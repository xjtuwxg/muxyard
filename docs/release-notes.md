Preview release of Muxyard, a desktop home for existing tmux sessions and coding agents.

- Attach existing sessions over system OpenSSH, with no remote Muxyard daemon.
- Create new sessions from the machine overview, including on an empty tmux server.
- Switch windows and panes with the mouse, create windows with Ctrl+T / Cmd+T, and split panes.
- Keep clickable window tabs in the compact focus toolbar.
- Preserve saved machines and their Machines membership across application restarts.
- Selectively import SSH aliases with optional connection checks.

Downloads: macOS arm64/x64 DMG and ZIP, Windows x64 installer, and Linux x64 AppImage/DEB. SHA256SUMS is included.

This is an early preview. Mac builds are ad-hoc signed and not notarized; Windows builds are unsigned. Windows supports remote tmux over SSH, without local tmux or WSL integration. Linux packages target Ubuntu 24.04 initially. Automatic updates are not implemented. Real remote SSH connections and each target installer still need manual validation before publishing.
