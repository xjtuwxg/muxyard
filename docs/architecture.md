# Architecture

## Decision: a desktop app with a web-based interface

Muxyard is a local Electron application. React renders the workspace; xterm.js renders terminal output. Pane view uses a persistent tmux control-mode process over local pipes or OpenSSH. Classic terminal uses node-pty to run a regular tmux client.

A browser-only app cannot directly use macOS OpenSSH, ssh-agent, or PTYs. It would require a local bridge or a server-side gateway. That adds installation and credential-handling complexity to a product whose first job is to attach to the user's existing sessions. A desktop shell provides those capabilities while preserving a reusable UI.

Electron is the initial implementation choice because it supports an established terminal renderer and a practical PTY integration. It carries a larger runtime and memory footprint than a Swift application or a system-webview shell. A future native implementation should be justified by measured typing latency, rendering performance, memory use, or accessibility limitations.

## Runtime boundaries

```text
React UI + xterm.js
        |
        | Narrow, typed IPC through a sandboxed preload
        v
Electron main process
        |
        +-- HostStore: profile metadata only
        |
        +-- Metadata and actions: execFile(tmux / ssh)
        |
        +-- Pane view: tmux -C attach-session over pipes or SSH
        |           +-- Framed command replies and byte-safe pane output
        |           +-- One xterm.js surface per tmux pane
        |
        +-- Interactive terminals: node-pty
                    |
                    +-- local tmux attach-session
                    |
                    +-- OpenSSH -tt -> remote tmux attach-session
```

Remote machines require only SSH and tmux. OpenSSH resolves keys, SSH config aliases, jump hosts, ports, and known-host verification.

## Session discovery and navigation

`tmux list-panes -a -F ...` returns a metadata snapshot. The format includes session IDs, window IDs, pane IDs, commands, paths, and titles. Stable tmux IDs are used for all actions; user-facing session names are never interpolated into shell commands.

SSH import is a preview operation. It reads aliases without saving or probing them. Only explicitly selected aliases are persisted. Optional probes run at most three at a time and select reachable aliases; the main process validates imports against the current alias list.

Local hosts and successfully connected SSH hosts refresh every eight seconds. Other saved SSH profiles are contacted only when chosen. A failed SSH host stops background polling until an explicit retry. Requests within the same discovery generation are deduplicated; stale results cannot overwrite a newer generation. Errors retain the last successful snapshot with a stale-data indication. Discovery has a 12-second execution timeout and a bounded output buffer.

Classic terminal attachment and standalone pane actions verify current discovery state. Pane-view commands validate targets against their control connection's session membership and use stable IDs. Both views operate on the original session and never forcibly detach other clients. Window selection and pane selection remain shared tmux state.

The window tab bar is derived from stable window IDs in the selected session snapshot and sorted by tmux window index. Selecting a window restores its active pane. New-window commands explicitly target the session and inherit the selected pane's working directory. Next/previous-window commands are scoped to the same session. Workspace shortcuts are handled during key-event capture so terminal widgets do not receive the reserved keystrokes; composing text and form/dialog inputs are excluded. Ctrl+D is deliberately passed through.

New-session requests validate a short session name and optional absolute working directory, run detached `new-session` on the chosen host/socket, discover its stable ID, and attach through the normal workspace. A new server starts if necessary. Duplicate names and invalid paths produce an error in the form without replacing an existing session.

## Platform and distribution

macOS and Linux use `/usr/bin/ssh` and support local tmux. Windows uses system OpenSSH Client and supports remote tmux only; local tmux and WSL integration are explicitly rejected. PATH separators and window/menu chrome follow the host OS. Electron Builder packages node-pty outside ASAR. Native build jobs run on each target OS, producing Mac arm64/x64 DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB.

The release workflow validates the version tag, waits for all packaging jobs, verifies the expected assets, creates SHA-256 checksums, and uploads to a draft prerelease. It cannot overwrite a published release. Current Mac signing is ad-hoc, Windows packages are unsigned, and automatic updates are not implemented. See [releasing](releasing.md).

## Terminal-first layout

Attached workspaces use compact chrome, with machine navigation and the pane inspector collapsed by default. A single attached session does not need a separate session-tab row. The overview keeps the full management layout. Focus mode hides both side panels and the session-tab row. Clickable window tabs move into the existing title strip alongside the session name and explicit exit action, so navigation does not add a second row. Machine, inspector, and focus preferences are stored in renderer-local storage; leaving focus mode restores the chosen panels.

Layout toggles change visibility and sizing without remounting terminal components or changing connection IDs. Existing ResizeObservers adjust the PTY or control client. Pane workspace sizing accounts for the actual compact pane-header height. Keyboard shortcuts reveal hidden navigation when needed, while plain Escape and the tmux Ctrl+B prefix remain available to terminal applications.

Desktop tests measure terminal area, check that tmux's actual pane width increases in focus mode, verify a single client remains attached, and send input through that same client after resizing. Both Pane view and Classic terminal are covered.

## Terminal transport and lifetime

The interactive transport is a real PTY attached to a regular tmux client. Full-screen terminal programs, shell input, and existing tmux bindings pass through xterm.js. Local environment variables `TMUX` and `TMUX_PANE` are removed to avoid tmux's nested-session guard.

The renderer acknowledges consumed output. The PTY pauses when unacknowledged output exceeds 262,144 JavaScript string characters and resumes below 131,072 characters. This bounds the normal backlog and prevents a fast terminal process from continually outrunning the renderer. Connection count is limited to 12 tabs. Scrollback is capped at 10,000 lines per terminal.

Closing a tab terminates only its local client process. Tmux manages the session and its processes. Closing the window or a renderer crash releases PTY and control-mode clients. The renderer also closes any connection that finishes opening after its view has unmounted.

## Security properties

- The renderer has no Node integration, uses context isolation, and runs sandboxed.
- The preload exposes specific host, discovery, pane-action, and terminal APIs. It does not expose arbitrary process execution or filesystem access.
- IPC handlers validate the originating web contents and main frame.
- Navigation and new windows are denied. The app loads bundled application content in production.
- SSH destinations and socket names are validated. Local commands use argument arrays. Every remote command token is shell-quoted.
- SSH uses `BatchMode=yes` and `StrictHostKeyChecking=yes`. Unknown host keys and password prompts fail visibly.
- Host profiles contain only labels, destinations, socket names, and machine-group preferences. Private keys and passwords are never copied into application storage.
- Terminal output is rendered by a terminal emulator rather than inserted into HTML. The app does not install an OSC clipboard handler or open output-provided URLs automatically.
- No telemetry, cloud account, or network listener is part of the packaged runtime. The development server is only for development.

Host profiles are stored in Electron's user-data directory as `hosts.json`, written through a temporary file with owner-only POSIX permissions where supported. A persisted `pinned` preference determines Machines membership independently of connection snapshots. Manually added and explicitly selected imports default to pinned; older `ssh-` profiles migrate to Other machines and can be promoted with a pin action or successful connection. Offline status does not remove a pinned machine from Machines. The built-in `local` profile is immutable. The development-only `MUXYARD_DATA_DIR` environment variable isolates automated tests.

## Pane-view control mode

[Tmux control mode](https://github.com/tmux/tmux/wiki/Control-Mode) drives the default pane view. A persistent `tmux -C attach-session` process emits live per-pane output, layout changes, active-pane changes, and window changes. Each pane maps to an independent xterm.js instance positioned from tmux's geometry. Input uses hexadecimal bytes addressed to the stable pane ID; clicking and typing do not wait for the selection acknowledgement.

The parser handles fragmented lines, guarded command replies, unsolicited hook blocks, octal byte escapes, and binary output. IPC uses base64 so UTF-8 sequences split across output notifications survive intact. Output acknowledgements pause process stdout above 256 KiB and resume below 128 KiB. Commands have a 12-second timeout and a bounded pending queue. Pane input requests are serialized to preserve paste ordering.

Tmux itself answers terminal device queries from pane applications. Pane renderers consume the corresponding queries without generating a second response; otherwise xterm's synthetic response would be forwarded as input and could corrupt an interactive program. A real terminal-query program in the desktop tests verifies that it receives exactly one cursor-position response.

Initial capture and cursor/mode metadata are requested as one tmux command list, preventing an event-loop turn between them. Streaming output is withheld until this initial screen is emitted, then subsequent output is delivered in order. Up to 1,000 history lines are restored. Resizing or attaching can rebuild a pane's screen; live output is not implemented as repeated capture polling.

The control client's dimensions are updated with `refresh-client -C`. Pane terminal grids use tmux's reported dimensions and scale down to fit their GUI panels. The actual tmux layout and active pane are preserved. Drag resizing, pop-out macOS windows, exact recovery of every terminal mode, and the complete tmux key-table UI remain future work. Classic terminal remains available for full tmux key binding and overlay behavior.

## Validation boundaries

Unit tests cover metadata parsing, executable recognition, selective SSH import, argument quoting, destination validation, concurrent profile persistence, protocol framing, octal decoding, and capture ordering. Integration tests use isolated tmux servers to exercise both transports, separate pane streams, input routing, window creation/navigation, external splits, cursor hydration, zoom, and detach persistence. Electron UI tests cover direct mouse/keyboard focus, window and pane shortcuts, separate window layouts, external window creation/rename/removal, view switching, focus-mode mouse window switching, new-session creation on an empty server, profile membership across restarts, and selective import using simulated SSH outcomes without contacting real SSH hosts. A separate session in the window tests verifies that new windows are created only in the intended session.

Real remote servers, SSH jump hosts, non-default user shells, agent wrappers, large output streams, macOS sleep/wake, and long-duration sessions need additional validation before a general release.

## References

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [node-pty](https://github.com/microsoft/node-pty)
- [xterm.js documentation](https://xtermjs.org/docs/)
- [tmux control mode](https://github.com/tmux/tmux/wiki/Control-Mode)
