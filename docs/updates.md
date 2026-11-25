# Application updates

Starting with v0.1.1, Muxyard checks its public GitHub Releases on startup (after ten seconds) and every six hours. Open **Software updates** in the overview, terminal toolbar, or focus toolbar, or use **Help → Check for Updates…**. Checking and downloading do not reconnect terminals or change the terminal layout.

The update panel shows your installed version, release notes as plain text, download progress, and errors. A compact reminder can be dismissed for that version. Automatic checks, optional automatic downloads, preview releases, and dismissed reminders persist in `updates.json` alongside your saved machine profiles. Automatic downloads are off by default. Stable releases are selected by semantic version, excluding drafts and prereleases unless preview releases are enabled. No downgrade is offered.

## Installation support

| Installation                           | Check and notify | Download and install in app                                                                      |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| Current macOS DMG / ZIP, ad-hoc signed | Yes              | Use **View downloads**, then replace the app in Applications                                     |
| Future Developer ID signed macOS build | Yes              | Supported by the updater; needs signing, notarization, and a signed-to-signed upgrade validation |
| Windows x64, installed with NSIS       | Yes              | Download, then **Restart and install**                                                           |
| Linux x64 AppImage                     | Yes              | Download, then **Restart and install**; the AppImage location must be writable                   |
| Linux DEB                              | Yes              | Download the DEB and use your package manager                                                    |
| Development build                      | Manual check     | Download a packaged build                                                                        |

Downloaded files are staged in the updater cache and checked against the release manifest's SHA-512 hash. Platform signature checks remain enabled where configured. Current Windows builds are unsigned, so hashes establish download integrity, not an independently verified publisher identity. Mac auto-installation is disabled for ad-hoc builds instead of bypassing signature validation. Release metadata is hosted publicly; no GitHub account, embedded token, remote service, or server-side Muxyard installation is needed.

**Restart and install** is always explicit. Closing Muxyard normally does not install a staged update. After restarting, reopen your sessions from the machine overview; workspace tabs are not restored automatically. Muxyard closes its tmux clients without sending commands to terminate sessions or agents. Server settings such as `destroy-unattached` still determine session lifetime.

This is a desktop application update, not a live replacement of running JavaScript or native modules. New code takes effect after relaunch. Existing v0.1.0 installations do not contain an update checker: users must manually install v0.1.1 once to receive future in-app notifications.

## Release pipeline

Use `electron-builder.config.cjs` for every distributable build. It creates separate `latest-arm64-mac.yml`, `latest-x64-mac.yml`, `latest-x64.yml` (Windows), and `latest-x64-linux.yml` feeds. The installer reads the feed from the selected release's immutable tag download directory; an Intel Mac feed cannot overwrite an Apple Silicon feed when CI merges artifacts. Native updaters retain their normal platform filename conventions and SHA-512 verification. Differential downloads may fall back to full downloads when an older blockmap is unavailable.

The release workflow uploads the manifests and blockmaps alongside all seven packages. Draft assembly checks manifest versions, architecture-specific filenames, file sizes, and SHA-512 hashes before uploading, then includes all published artifacts in `SHA256SUMS`. A published release is never overwritten. Drafts are invisible to update checks; publishing makes the release eligible. A regular release reaches the default channel; a prerelease reaches only users who enable preview releases.

Unit tests cover version selection, preference persistence, manual-only platforms, failure recovery, and explicit installation policy. Desktop tests exercise notifications, the manual download route, and a simulated staged installation, without replacing the app running the tests. Native packages receive CI smoke tests and metadata validation. An actual upgrade between two published updater-enabled versions still needs platform-by-platform validation; v0.1.1 is the first updater-enabled version.

References: [electron-builder v26 auto-update documentation](https://www.electron.build/v26/docs/features/auto-update/), [code signing](https://www.electron.build/v26/docs/features/code-signing/), and [Claude Code update behavior](https://code.claude.com/docs/en/setup#update-claude-code). Claude Code's native auto-updates also take effect the next time the program starts.
