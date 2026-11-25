import { app } from 'electron'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import electronUpdater from 'electron-updater'
import type { AppUpdater } from 'electron-updater'
import type { UpdateInstaller } from './updates'
import { updateCapability } from './updates'
import { stageUpdate } from './update-download'

export function createUpdateInstaller(onError: (error: Error) => void): UpdateInstaller {
  let developerID = false
  if (app.isPackaged && process.platform === 'darwin') {
    const signature = spawnSync(
      '/usr/bin/codesign',
      ['-dv', '--verbose=4', resolve(process.execPath, '../../..')],
      { encoding: 'utf8' }
    )
    developerID =
      signature.status === 0 && /^Authority=Developer ID Application:/m.test(signature.stderr ?? '')
  }
  const capability = updateCapability(
    app.isPackaged,
    process.platform,
    Boolean(process.env.APPIMAGE),
    developerID
  )
  let updater: AppUpdater | undefined
  return {
    capability,
    async download(release, progress) {
      if (!capability.supported) throw new Error(capability.reason)
      const { NsisUpdater, AppImageUpdater, MacUpdater } = electronUpdater
      const Constructor =
        process.platform === 'win32'
          ? NsisUpdater
          : process.platform === 'darwin'
            ? MacUpdater
            : AppImageUpdater
      updater = new Constructor({
        provider: 'generic',
        url: `https://github.com/xjtuwxg/muxyard/releases/download/${release.tag}/`,
        channel: `latest-${process.arch}`,
        useMultipleRangeRequest: false
      })
      updater.on('error', onError)
      await stageUpdate(updater, release, progress)
    },
    install() {
      if (!updater) throw new Error('Download an update before installing.')
      // Installing only happens after an explicit Restart and install action.
      updater.quitAndInstall(true, true)
    }
  }
}
