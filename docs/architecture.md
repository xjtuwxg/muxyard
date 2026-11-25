# Architecture

## Decision: a desktop app with a web-based interface

Muxyard is a local Electron application. React renders the workspace; xterm.js renders terminal output; the main process uses node-pty to run system `tmux` or `/usr/bin/ssh`.

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
        +-- Interactive terminals: node-pty
                    |
                    +-- local tmux attach-session
                    |
                    +-- OpenSSH -tt -> remote tmux attach-session
```

Remote machines require only SSH and tmux. OpenSSH resolves keys, SSH config aliases, jump hosts, ports, and known-host verification.

## Session discovery and navigation

`tmux list-panes -a -F ...` returns a metadata snapshot. The format includes session IDs, window IDs, pane IDs, commands, paths, and titles. Stable tmux IDs are used for all actions; user-facing session names are never interpolated into shell commands.

The UI refreshes each configured host every eight seconds. A polling cycle does not overlap itself. Errors retain the last successful snapshot with a stale-data indication. Discovery has a 12-second execution timeout and a bounded output buffer. This is intentionally a small implementation; many hosts or high-latency networks will benefit from a persistent control connection.

Before a terminal is opened or a pane action runs, the main process discovers the current state again and verifies the target exists. The initial implementation operates on the original session. It does not forcibly detach other clients. Window selection and pane selection remain shared tmux state.

## Terminal transport and lifetime

The interactive transport is a real PTY attached to a regular tmux client. Full-screen terminal programs, shell input, and existing tmux bindings pass through xterm.js. Local environment variables `TMUX` and `TMUX_PANE` are removed to avoid tmux's nested-session guard.

The renderer acknowledges consumed output. The PTY pauses when unacknowledged output exceeds 262,144 JavaScript string characters and resumes below 131,072 characters. This bounds the normal backlog and prevents a fast terminal process from continually outrunning the renderer. Connection count is limited to 12 tabs. Scrollback is capped at 10,000 lines per terminal.

Closing a tab terminates only the local PTY client. Tmux manages the session and its processes. Closing the window or a renderer crash releases all application PTYs. The renderer also closes any terminal that finishes opening after its view has unmounted.

## Security properties

- The renderer has no Node integration, uses context isolation, and runs sandboxed.
- The preload exposes specific host, discovery, pane-action, and terminal APIs. It does not expose arbitrary process execution or filesystem access.
- IPC handlers validate the originating web contents and main frame.
- Navigation and new windows are denied. The app loads bundled application content in production.
- SSH destinations and socket names are validated. Local commands use argument arrays. Every remote command token is shell-quoted.
- SSH uses `BatchMode=yes` and `StrictHostKeyChecking=yes`. Unknown host keys and password prompts fail visibly.
- Host profiles contain only labels, destinations, and socket names. Private keys and passwords are never copied into application storage.
- Terminal output is rendered by a terminal emulator rather than inserted into HTML. The app does not install an OSC clipboard handler or open output-provided URLs automatically.
- No telemetry, cloud account, or network listener is part of the packaged runtime. The development server is only for development.

Host profiles are stored in Electron's user-data directory as `hosts.json`, written through a temporary file with owner-only file permissions. The built-in `local` profile is immutable. The development-only `MUXYARD_DATA_DIR` environment variable isolates automated tests.

## Why not tmux control mode immediately?

[Tmux control mode](https://github.com/tmux/tmux/wiki/Control-Mode) is the intended path for deep GUI integration. It exposes output events and commands over a text protocol that can run through SSH. It can support GUI-managed pane surfaces and reduce metadata polling.

A correct implementation also needs streaming framing, octal byte decoding, command/result correlation, pane history recovery, terminal dimensions, layout synchronization, backpressure, and reconnection. Replacing a real terminal with periodic `capture-pane` snapshots would lose terminal semantics and interactivity. The prototype therefore uses a real attached client first, with GUI actions around it.

The present UI displays tmux's terminal layout inside one terminal surface. It does not yet render each pane as a separate draggable GUI terminal. That distinction is part of the product's current scope.

## Validation boundaries

Unit tests cover metadata parsing, executable recognition, SSH configuration import, argument quoting, destination validation, and concurrent profile persistence. Integration tests use an isolated tmux server to exercise PTY input/output, pane actions, and detach persistence with multiple clients. Electron UI tests cover demo navigation and a real local socket attachment, including against the packaged application.

Real remote servers, SSH jump hosts, non-default user shells, agent wrappers, large output streams, macOS sleep/wake, and long-duration sessions need additional validation before a general release.

## References

- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [node-pty](https://github.com/microsoft/node-pty)
- [xterm.js documentation](https://xtermjs.org/docs/)
- [tmux control mode](https://github.com/tmux/tmux/wiki/Control-Mode)
