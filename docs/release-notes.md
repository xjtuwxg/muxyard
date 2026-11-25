# Muxyard 0.1.1

A desktop home for your existing tmux sessions and coding agents. This release adds update awareness, a brighter appearance, and more room for your terminals.

- Check GitHub Releases from the app, with startup and periodic checks, compact version reminders, and release notes.
- Download updates in the app on Windows NSIS and Linux AppImage installations; restart to install only when you choose. Optional automatic downloads and preview releases are configurable.
- Choose Daylight, Paper, Graphite, Dusk, or Grove, follow system appearance, and customize accent and terminal colors without reconnecting sessions.
- Use the unified Muxyard logo throughout the app, README, website, and native icon.
- Fit pane grids to the available viewport and keep the scrollbar near the right edge.
- Keep mouse-accessible tmux window tabs in focus mode, create sessions from the machine overview, and retain saved machines across restarts.

Downloads include macOS Apple Silicon and Intel DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB. Architecture-specific update manifests, blockmaps, and SHA256SUMS are attached. The website follows this published release automatically.

## Installation and update notes

- **Existing v0.1.0 users:** manually install v0.1.1 once. Older builds do not have an update checker.
- **macOS:** builds are ad-hoc signed and not notarized. Update checks and reminders work; install updates by downloading the DMG and replacing Muxyard in Applications. Developer ID signing is required before enabling Mac in-app installation.
- **Windows:** installers are unsigned and can trigger OS trust warnings. Remote tmux over system OpenSSH is supported; local tmux and WSL integration are not included.
- **Linux:** packages initially target Ubuntu 24.04. AppImage updates need a writable installation location; DEB installations use the system package manager.
- Updates apply after restarting the desktop app. Reattach to your sessions afterward. Muxyard detaches its clients; your server's tmux configuration controls session and agent lifetime.

Unit, real tmux integration, desktop UI, native packaging, and manifest integrity checks cover this release. Updater download/install UI is tested with fixtures; a real cross-version installation needs a later updater-enabled release. Real SSH configurations, sleep/wake recovery, and complex agent TUIs still benefit from broader testing.
