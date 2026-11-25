# Contributing to Muxyard

Muxyard is a working prototype. Favor small changes that make attaching to existing tmux sessions more reliable and pleasant.

## Setup

Use macOS with Node.js 22.12+ or a newer supported release, npm, tmux, and Xcode Command Line Tools.

```sh
npm install
npm run dev
```

All documentation, UI copy, and source comments are written in English.

## Checks

```sh
npm run build
npm test
npm run test:integration
npm run test:ui
```

Build before UI tests. The desktop tests launch Electron and require GUI access. Test servers use unique named tmux sockets. Never run destructive tests against the default socket or a developer's existing sessions.

## Design constraints

- Preserve existing tmux processes and configuration.
- Keep privileged capabilities in the main process behind narrowly scoped IPC.
- Use argument arrays for local commands and quote every remote command token.
- Never disable SSH host-key verification to make connection setup seem easier.
- Separate actual agent state from executable-name recognition or guesses.
- Keep demo data visibly labeled and separate from real connections.
- Include behavior-focused tests for transport, security, or session-lifecycle changes.

When reporting connection bugs, include macOS, tmux, SSH, and app versions; whether the issue affects local or remote sessions; and the sanitized error. Do not include private keys, passwords, or full sensitive terminal output.
