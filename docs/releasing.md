# Building and releasing Muxyard

Muxyard uses Electron Builder. Commit source code and the lockfile to Git; put installers in GitHub Releases instead of committing them to the repository. GitHub Releases hosts installers and architecture-specific update metadata. See [update behavior](updates.md).

## Packages

| Platform | Architecture          | Downloads             | Runtime requirements                                         |
| -------- | --------------------- | --------------------- | ------------------------------------------------------------ |
| macOS    | Apple Silicon (arm64) | `.dmg`, `.zip`        | System OpenSSH; tmux for local sessions                      |
| macOS    | Intel (x64)           | `.dmg`, `.zip`        | System OpenSSH; tmux for local sessions                      |
| Windows  | x64                   | `.exe` NSIS installer | Windows OpenSSH Client; remote Linux/macOS machine with tmux |
| Linux    | x64                   | `.AppImage`, `.deb`   | OpenSSH; tmux for local sessions                             |

The workflow builds on macOS 15, macOS 15 Intel, Windows Server 2022, and Ubuntu 24.04 respectively. Linux packages should first be tested on Ubuntu 24.04; older distributions and other desktop environments have not been validated. Linux arm64 and Windows arm64 are not currently included.

Windows does not run tmux locally. Add an SSH machine running tmux on Linux or macOS. Windows OpenSSH Client must be installed at `%SystemRoot%\System32\OpenSSH\ssh.exe`; verify your SSH alias and host key in PowerShell before using Muxyard. WSL integration is not implemented. The application uses the OS-specific OpenSSH path, PATH separator, menu, and title bar.

A DMG is the primary Mac download: open it and drag Muxyard into Applications. ZIP is useful for a portable app bundle and for signed Mac update support. The `.app` directory alone is suitable for local testing but should be archived for distribution. On Ubuntu, use `sudo apt install ./Muxyard-<version>-linux-amd64.deb`. An AppImage needs executable permission and may require FUSE support on the target distribution.

## Local builds

Install dependencies with `npm ci`. Native dependencies need the platform's compiler toolchain, such as Xcode Command Line Tools, Visual Studio C++ Build Tools, or GCC/make/Python. Install tmux for local sessions and integration tests.

```sh
# macOS: unpacked .app for local testing
npm run dist:mac

# macOS: DMG and ZIP for the current CPU architecture
npm run dist:mac:installers

# Run on Windows: x64 NSIS installer
npm run dist:win

# Run on Linux: x64 AppImage and Debian package
npm run dist:linux
```

Outputs are under `release/`. These commands explicitly disable publishing. Build on the target OS because node-pty contains native code; do not assume a Mac build validates Windows or Linux. The workflow produces separate Mac arm64 and x64 downloads, rather than a universal binary.

## GitHub Actions

- **CI** runs on pushes to `main` and pull requests. It checks formatting, unit tests, and production builds on macOS, Linux, and Windows. It additionally runs real tmux integration tests on macOS/Linux, full desktop UI tests on macOS, and remote-free desktop smoke tests on Windows.
- **Release** builds all four OS/architecture combinations. Mac installers receive full packaged-app desktop tests; Windows receives packaged-app smoke tests. Linux currently receives unit, build, and tmux integration checks, but no graphical desktop test in CI.
- Manually dispatch **Release** from the Actions page to download temporary build artifacts without creating a release.
- Pushing a version tag builds installers and creates a **draft prerelease** containing seven installers/archives, four architecture-specific update manifests, differential blockmaps, and `SHA256SUMS`. It does not publish the release. Draft creation waits for all builds and tests to pass.
- A retry can replace assets on an existing draft. It refuses to overwrite a published release.

The workflow uses the repository's built-in `GITHUB_TOKEN`; a personal access token is not required. Build jobs have read-only repository permission. Only the draft-release job has `contents: write`. Ensure Actions is enabled and repository or organization policy permits that job permission.

## Create a release

Commit and push your reviewed changes before creating the tag. The tag must exactly match `v` plus the version in `package.json` (currently `v0.1.1`).

```sh
git push -u origin main
git tag -a v0.1.1 -m "Muxyard 0.1.1"
git push origin v0.1.1
```

Watch the **Release** workflow under Actions. Open the resulting draft at <https://github.com/xjtuwxg/muxyard/releases>. Verify the package architecture, install and launch each package on its target OS, connect to a real SSH machine, create and attach a session, test pane/window input, and verify saved machines after restart. The automated SSH tests use fixtures and do not validate your real remote hosts.

Review the draft and publish when checks are complete. Clear **Set as a pre-release** for a regular release; stable update checks exclude prereleases unless users enable preview releases. Publishing triggers the website workflow so download links follow the latest public release. Keep signing limitations visible in release notes.

For later versions:

```sh
npm version patch
# Review the generated version commit and tag, then push them.
git push origin main
git push origin v0.1.2
```

`npm version patch` requires a clean working tree and creates the version commit and tag. Do not move a published tag; fix problems in a new version. Review `docs/release-notes.md` before tagging each release.

## Signing and notarization

The current Mac setting is `mac.identity: "-"`: ad-hoc signing only. It does not establish a Developer ID identity, and these builds are not notarized. Windows installers are also unsigned. Downloaded preview builds can trigger OS trust warnings. SHA-256 checksums detect changed downloads; they do not replace publisher signing.

For normal public Mac distribution, enroll in the Apple Developer Program, export a **Developer ID Application** certificate, and configure Electron Builder signing and notarization. Replace the ad-hoc identity setting before enabling signing. Configure certificate and notarization credentials as GitHub Actions encrypted secrets, pass them only to trusted release builds, and remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` if using automatic identity discovery. Electron Builder 26 supports certificate inputs such as `CSC_LINK` / `CSC_KEY_PASSWORD`, and Apple notarization credentials. Follow the documentation for the installed v26 version, rather than v27 configuration examples. Validate hardened-runtime entitlements for Electron and node-pty, notarize, staple, and verify the downloaded DMG with Gatekeeper on a clean Mac.

For Windows public distribution, configure an Authenticode certificate or a supported signing service and test the downloaded installer. The update provider is this public GitHub repository. Signing credentials are not stored in the repository.

References: [Electron Builder v26 multi-platform builds](https://www.electron.build/v26/docs/features/multi-platform-build/), [v26 code signing](https://www.electron.build/v26/docs/features/code-signing/), and [GitHub-hosted runner labels](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).
