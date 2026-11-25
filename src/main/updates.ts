import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import semver from 'semver'
import type { UpdatePreferences, UpdateRelease, UpdateState } from '../shared/types'

export const releasesURL = 'https://github.com/xjtuwxg/muxyard/releases'
export const releasesAPI = 'https://api.github.com/repos/xjtuwxg/muxyard/releases?per_page=100'

export interface UpdateInstaller {
  capability: UpdateState['installation']
  download(release: UpdateRelease, progress: (percent: number) => void): Promise<void>
  install(): void
}

export function selectRelease(
  data: unknown,
  current: string,
  previews: boolean
): UpdateRelease | undefined {
  if (!Array.isArray(data)) throw new Error('GitHub returned an invalid release list.')
  return data
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || item.draft || (!previews && item.prerelease))
        return []
      const tag = item.tag_name
      if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(tag)) return []
      const version = semver.valid(tag)
      if (!version || !semver.gt(version, current) || (!previews && semver.prerelease(version)))
        return []
      // Construct the link ourselves; API-provided URLs and Markdown are never executed.
      return [
        {
          version,
          tag,
          url: `${releasesURL}/tag/${tag}`,
          notes: typeof item.body === 'string' ? item.body.slice(0, 16000) : ''
        }
      ]
    })
    .sort((a, b) => semver.rcompare(a.version, b.version))[0]
}

async function releaseList(fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(releasesAPI, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Muxyard-update-check' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error'
  })
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'GitHub is limiting update checks. Please try again later.'
        : `Could not check GitHub Releases (HTTP ${response.status}).`
    )
  const reader = response.body?.getReader()
  if (!reader) throw new Error('GitHub returned an empty response.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.length
      if (bytes > 4 * 1024 * 1024) throw new Error('GitHub returned an oversized release list.')
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export function updateCapability(
  packaged: boolean,
  platform: string,
  appImage: boolean,
  developerID: boolean
): UpdateState['installation'] {
  if (!packaged)
    return {
      supported: false,
      reason:
        'Development builds can check for releases. Install a packaged app to enable installation.'
    }
  if (platform === 'darwin' && !developerID)
    return {
      supported: false,
      reason:
        'This macOS build is ad-hoc signed. Download the DMG and replace Muxyard in Applications. In-app installation requires a Developer ID signed release.'
    }
  if (platform === 'linux' && !appImage)
    return {
      supported: false,
      reason:
        'Install DEB updates with your package manager, or download the latest package. AppImage installations support in-app updates.'
    }
  if (!['darwin', 'linux', 'win32'].includes(platform))
    return { supported: false, reason: 'Download the latest package for your platform.' }
  return {
    supported: true,
    reason: 'Download updates in the background, then restart to install when you are ready.'
  }
}

export class Updates {
  private state: UpdateState
  private checking?: Promise<UpdateState>
  private saving: Promise<void> = Promise.resolve()
  private startup?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  constructor(
    version: string,
    private file: string,
    private installer: UpdateInstaller,
    private changed: (state: UpdateState) => void,
    private fetcher: typeof fetch = fetch
  ) {
    this.state = {
      currentVersion: version,
      status: 'idle',
      installation: installer.capability,
      preferences: { automaticChecks: true, automaticDownload: false, includePrereleases: false }
    }
  }
  get(): UpdateState {
    return structuredClone(this.state)
  }
  private update(patch: Partial<UpdateState>): UpdateState {
    Object.assign(this.state, patch)
    this.changed(this.get())
    return this.get()
  }
  async load(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'))
      for (const key of ['automaticChecks', 'automaticDownload', 'includePrereleases'] as const)
        if (typeof saved[key] === 'boolean') this.state.preferences[key] = saved[key]
      if (typeof saved.dismissedVersion === 'string' && semver.valid(saved.dismissedVersion))
        this.state.dismissedVersion = saved.dismissedVersion
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('Could not load update preferences:', error)
    }
  }
  private save(): Promise<void> {
    const value = JSON.stringify({
      ...this.state.preferences,
      dismissedVersion: this.state.dismissedVersion
    })
    const write = async (): Promise<void> => {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(`${this.file}.tmp`, value, { mode: 0o600 })
      await rename(`${this.file}.tmp`, this.file)
    }
    const pending = this.saving.then(write)
    this.saving = pending.catch(() => {})
    return pending
  }
  async configure(patch: Partial<UpdatePreferences>): Promise<UpdateState> {
    if (
      !patch ||
      typeof patch !== 'object' ||
      Object.entries(patch).some(
        ([key, value]) =>
          !['automaticChecks', 'automaticDownload', 'includePrereleases'].includes(key) ||
          typeof value !== 'boolean'
      )
    )
      throw new Error('Invalid update preferences.')
    if (this.state.status === 'downloading' || this.state.status === 'ready' || this.checking)
      throw new Error('Finish the current update before changing preferences.')
    const changedChannel =
      patch.includePrereleases !== undefined &&
      patch.includePrereleases !== this.state.preferences.includePrereleases
    this.state.preferences = { ...this.state.preferences, ...patch }
    await this.save()
    return this.update(
      changedChannel ? { status: 'idle', release: undefined, error: undefined } : {}
    )
  }
  async dismiss(): Promise<UpdateState> {
    this.state.dismissedVersion = this.state.release?.version
    await this.save()
    return this.update({})
  }
  check(): Promise<UpdateState> {
    if (this.checking) return this.checking
    if (this.state.status === 'downloading' || this.state.status === 'ready')
      return Promise.resolve(this.get())
    const run = async (): Promise<UpdateState> => {
      this.update({ status: 'checking', error: undefined })
      try {
        const release = selectRelease(
          await releaseList(this.fetcher),
          this.state.currentVersion,
          this.state.preferences.includePrereleases
        )
        this.update({ status: release ? 'available' : 'current', release, checkedAt: Date.now() })
        if (
          release &&
          this.state.preferences.automaticDownload &&
          this.installer.capability.supported
        )
          await this.download()
      } catch (error) {
        this.update({
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not check for updates.'
        })
      }
      return this.get()
    }
    this.checking = run().finally(() => {
      this.checking = undefined
    })
    return this.checking
  }
  async download(): Promise<UpdateState> {
    const release = this.state.release
    if (!release || this.state.status !== 'available' || !this.installer.capability.supported)
      throw new Error('An installable update is not available.')
    this.update({ status: 'downloading', progress: 0, error: undefined })
    try {
      await this.installer.download(release, (progress) => {
        if (Number.isFinite(progress))
          this.update({ progress: Math.min(100, Math.max(0, progress)) })
      })
      return this.update({ status: 'ready', progress: 100 })
    } catch (error) {
      return this.update({
        status: 'available',
        progress: undefined,
        error: error instanceof Error ? error.message : 'The update download failed.'
      })
    }
  }
  install(): void {
    if (this.state.status !== 'ready') throw new Error('Download an update before installing.')
    this.installer.install()
  }
  installationError(error: Error): void {
    if (this.state.status === 'ready') this.update({ error: error.message })
  }
  releaseURL(): string {
    return this.state.release?.url ?? releasesURL
  }
  start(): void {
    const check = (): void => {
      if (this.state.preferences.automaticChecks) void this.check()
    }
    this.startup = setTimeout(check, 10000)
    this.interval = setInterval(check, 6 * 60 * 60 * 1000)
    this.startup.unref()
    this.interval.unref()
  }
  dispose(): void {
    clearTimeout(this.startup)
    clearInterval(this.interval)
  }
}
