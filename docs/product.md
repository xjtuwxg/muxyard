# Product direction

## Name and positioning

**Muxyard** combines “mux” with a yard: a place where existing terminals and agents come together. The name is short enough to say aloud and descriptive enough to connect to tmux. Initial web searches did not surface an established tmux product with this exact name; this is not a trademark clearance or a guarantee of repository, domain, or package-name availability.

Tagline: **Your tmux sessions. A little more civilized.**

Repository description: **A mouse-friendly macOS desktop home for your existing local and remote tmux sessions and coding agents.**

The promise is straightforward: keep the sessions, tools, and persistence you already trust, then add a useful desktop interface. Muxyard should be attractive even to a developer who never uses a coding agent.

## The core user journey

1. Open Muxyard on a MacBook.
2. See local sessions, or import an existing SSH alias.
3. Click an existing session and immediately resume its real terminal.
4. Navigate windows and panes without memorizing tmux prefixes.
5. Find the agent pane that needs attention, once an authoritative integration is available.
6. Close the app, move networks, and reattach later without restarting the work.

No forced migration, account creation, remote agent installation, or replacement multiplexer belongs in this journey.

## Product priorities

### Current prototype

Local and SSH profiles; selective SSH import and optional reachability checks; on-demand remote connection; session discovery and creation; persisted preferred machines; classic terminal attachment; persistent control-mode pane surfaces with click-to-focus input; compact terminal-first workspaces and focus mode; collapsible machine and pane navigation; session tabs and tmux window tabs, including in the single-row focus toolbar; window creation and navigation shortcuts; split and zoom controls; terminal search and selection copying; conservative executable-based agent discovery; a labeled demo; isolated integration tests.

### Daily-driver milestone

- Validate SSH on Linux and macOS, including aliases, `Include`, `ProxyJump`, IPv6, encrypted keys, and non-default shells.
- Persist recently attached sessions, with explicit reconnect behavior.
- Handle Mac sleep/wake, lost Wi-Fi, and reconnect backoff while retaining clear status.
- Add context menus, accessible keyboard navigation, adjustable font sizes, and a resizable inspector.
- Verify large output, Unicode/IME input, bracketed paste, terminal mouse reporting, and clipboard behavior in real agent TUIs.
- Measure idle CPU, memory per terminal, and input/render latency.
- Validate the cross-platform release pipeline on real target machines and prepare signed/notarized public packages.

### Deeper tmux integration

- Extend pane-view compatibility for terminal modes, tmux key tables, and copy/choose overlays.
- Add detachable macOS windows for individual panes, with deliberate connection ownership and cleanup.
- Support mouse-driven pane resizing and layouts while retaining the real tmux layout.
- Evaluate grouped sessions for independent window navigation, with deliberate lifecycle cleanup.
- Add custom socket paths and deliberate support for renaming and ending sessions. Destructive actions need clear target labels and confirmations.

### Agent awareness

- Define a versioned event contract with host, pane, agent identity, task state, timestamp, and provenance.
- Integrate official agent events or hooks where available. Installation should be optional and reviewable.
- Surface “needs input,” “working,” “finished,” and “unknown” only when backed by authoritative events.
- Show stale or disconnected status when events become unreliable.
- Add opt-in notifications and one-click jumps to the relevant real terminal.
- Keep interaction in the agent's real TUI. Structured agent conversations can be explored separately if they offer a clear benefit.

Screen scraping and time-since-output heuristics can be offered later as explicit estimates. They must never be presented as exact task state.

## Launch strategy

A name cannot guarantee GitHub adoption. A narrow, believable demonstration is more useful than a long feature list.

The first public demo should show an agent already running on a remote tmux server, Muxyard finding it, a mouse click resuming it, and the same task surviving the app closing. Keep this sequence under 30 seconds. Include a readable screenshot, a three-command quick start, an unsigned-build warning only where relevant, and an honest “what works / what is next” list.

Possible launch title: **“I built a desktop home for the tmux sessions I already had.”**

Suggested repository topics: `tmux`, `macos`, `ssh`, `terminal`, `desktop`, `coding-agents`, `electron`, `developer-tools`.

Do not publish before real remote SSH validation and a usable installation path exist. Do not claim native Swift rendering, accurate agent task state, complete tmux key-table support in pane view, or detachable macOS pane windows until they ship.
