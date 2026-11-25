import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Updates,
  selectRelease,
  updateCapability,
  releasesAPI,
  type UpdateInstaller
} from '../src/main/updates'
import { stageUpdate } from '../src/main/update-download'
import type { UpdateState } from '../src/shared/types'

const release = (tag: string, extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  body: 'Release notes',
  ...extra
})

test('release discovery compares semantic versions, excludes drafts/previews and constructs trusted links', () => {
  const list = [
    release('v0.1.9'),
    release('v0.1.10'),
    release('v0.1.11', { draft: true }),
    release('v0.2.0', { prerelease: true }),
    release('v0.3.0-beta.1'),
    release('v0.4.0/evil'),
    release('v0.1.0')
  ]
  assert.equal(selectRelease(list, '0.1.1', false)?.version, '0.1.10')
  assert.equal(selectRelease(list, '0.1.1', true)?.version, '0.3.0-beta.1')
  assert.equal(
    selectRelease(
      [release('v0.1.2', { html_url: 'https://evil.test', body: '<script>bad</script>' })],
      '0.1.1',
      false
    )?.url,
    'https://github.com/xjtuwxg/muxyard/releases/tag/v0.1.2'
  )
  assert.equal(selectRelease(list, '1.0.0', true), undefined)
  assert.throws(() => selectRelease({}, '0.1.1', false), /invalid release list/)
})

async function fixture(body: unknown = [release('v0.1.2')], supported = true, status = 200) {
  const directory = await mkdtemp(join(tmpdir(), 'muxyard-updates-'))
  const file = join(directory, 'updates.json')
  let installs = 0,
    downloads = 0,
    requests = 0,
    failDownload = false
  const states: UpdateState[] = []
  const installer: UpdateInstaller = {
    capability: { supported, reason: 'Test installation policy' },
    async download(_release, progress) {
      downloads++
      progress(38)
      progress(101)
      if (failDownload) throw new Error('Download failed')
    },
    install() {
      installs++
    }
  }
  const fetcher: typeof fetch = async (url, options) => {
    requests++
    assert.equal(url, releasesAPI)
    assert.equal(options?.redirect, 'error')
    return new Response(JSON.stringify(body), { status })
  }
  const updates = new Updates('0.1.1', file, installer, (state) => states.push(state), fetcher)
  await updates.load()
  return {
    updates,
    file,
    installer,
    fetcher,
    states,
    counts: () => ({ installs, downloads, requests }),
    fail: () => {
      failDownload = true
    },
    close: () => rm(directory, { recursive: true, force: true })
  }
}

test('checks deduplicate; downloading stages an update but never installs until explicitly requested', async () => {
  const f = await fixture()
  try {
    assert.throws(() => f.updates.install(), /Download an update/)
    const [a, b] = await Promise.all([f.updates.check(), f.updates.check()])
    assert.equal(a.status, 'available')
    assert.equal(b.release?.version, '0.1.2')
    assert.deepEqual(f.counts(), { installs: 0, downloads: 0, requests: 1 })
    const ready = await f.updates.download()
    assert.equal(ready.status, 'ready')
    assert.equal(ready.progress, 100)
    assert.ok(f.states.some((state) => state.progress === 38))
    assert.equal((await f.updates.check()).status, 'ready')
    assert.equal(f.counts().installs, 0)
    await assert.rejects(() => f.updates.configure({ automaticChecks: false }), /Finish/)
    f.updates.install()
    assert.equal(f.counts().installs, 1)
  } finally {
    await f.close()
  }
})

test('update preferences and per-version dismissal survive app restarts; downloads can be automatic', async () => {
  const f = await fixture()
  try {
    await f.updates.configure({
      automaticChecks: false,
      automaticDownload: true,
      includePrereleases: true
    })
    await f.updates.check()
    await f.updates.dismiss()
    assert.equal(f.updates.get().status, 'ready')
    const restarted = new Updates('0.1.1', f.file, f.installer, () => {}, f.fetcher)
    await restarted.load()
    assert.deepEqual(restarted.get().preferences, {
      automaticChecks: false,
      automaticDownload: true,
      includePrereleases: true
    })
    assert.equal(restarted.get().dismissedVersion, '0.1.2')
    assert.equal(restarted.get().status, 'idle')
    const saved = JSON.parse(await readFile(f.file, 'utf8'))
    assert.equal(saved.dismissedVersion, '0.1.2')
    await assert.rejects(() => restarted.configure({ automaticChecks: 'yes' } as never), /Invalid/)
    assert.equal(f.counts().installs, 0)
  } finally {
    await f.close()
  }
})

test('unsupported installation stays manual even with automatic downloads enabled', async () => {
  const f = await fixture(undefined, false)
  try {
    await f.updates.configure({ automaticDownload: true })
    assert.equal((await f.updates.check()).status, 'available')
    await assert.rejects(() => f.updates.download(), /not available/)
    assert.equal(f.counts().downloads, 0)
  } finally {
    await f.close()
  }
})

test('network and download failures remain recoverable without affecting terminal connections', async () => {
  const f = await fixture(undefined, true, 429)
  const d = await fixture()
  try {
    const state = await f.updates.check()
    assert.equal(state.status, 'error')
    assert.match(state.error!, /limiting/)
    await d.updates.check()
    d.fail()
    const failed = await d.updates.download()
    assert.equal(failed.status, 'available')
    assert.match(failed.error!, /Download failed/)
    assert.equal(d.counts().installs, 0)
  } finally {
    await f.close()
    await d.close()
  }
})

test('installation policy requires Developer ID on Mac and AppImage on Linux', () => {
  assert.equal(updateCapability(false, 'win32', false, false).supported, false)
  assert.equal(updateCapability(true, 'darwin', false, false).supported, false)
  assert.equal(updateCapability(true, 'darwin', false, true).supported, true)
  assert.equal(updateCapability(true, 'linux', false, false).supported, false)
  assert.equal(updateCapability(true, 'linux', true, false).supported, true)
  assert.equal(updateCapability(true, 'win32', false, false).supported, true)
})

test('native updater never auto-installs on quit and rejects mismatched manifests before downloading', async () => {
  let downloads = 0
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    allowPrerelease: false,
    on() {},
    async checkForUpdates() {
      return { updateInfo: { version: '0.1.3' } }
    },
    async downloadUpdate() {
      downloads++
    }
  }
  const target = selectRelease([release('v0.1.2')], '0.1.1', false)!
  await assert.rejects(() => stageUpdate(updater, target, () => {}), /does not match/)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowDowngrade, false)
  assert.equal(downloads, 0)
  updater.checkForUpdates = async () => ({ updateInfo: { version: target.version } })
  await stageUpdate(updater, target, () => {})
  assert.equal(downloads, 1)
})
