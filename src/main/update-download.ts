import type { UpdateRelease } from '../shared/types'

// Kept independent of Electron so installation policy can be tested without launching an app.
export interface StagedUpdater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowDowngrade: boolean
  allowPrerelease: boolean
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'download-progress', listener: (event: { percent: number }) => void): unknown
  checkForUpdates(): Promise<{ updateInfo: { version: string } } | null>
  downloadUpdate(): Promise<unknown>
}

export async function stageUpdate(
  updater: StagedUpdater,
  release: UpdateRelease,
  progress: (percent: number) => void
): Promise<void> {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowDowngrade = false
  updater.allowPrerelease = true
  // The library validates SHA-512 and platform signatures where configured.
  updater.on('error', (error) => console.error('Update installer:', error.message))
  updater.on('download-progress', (event) => progress(event.percent))
  const result = await updater.checkForUpdates()
  if (!result || result.updateInfo.version !== release.version)
    throw new Error('The update manifest does not match this release. Please use View downloads.')
  await updater.downloadUpdate()
}
