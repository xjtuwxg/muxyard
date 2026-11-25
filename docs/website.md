# Website and GitHub positioning

## GitHub About

Recommended description:

> A desktop GUI for the tmux sessions and coding agents you already run — locally or over SSH.

This says what the product is, includes the terms users search for, and makes existing-session compatibility explicit. It avoids requiring users to know an agent brand or learn a new multiplexer. The description is a draft; repository metadata has not been changed automatically.

Suggested topics: `tmux`, `tmux-gui`, `ssh`, `terminal`, `desktop`, `coding-agents`, `electron`, `macos`, `windows`, `linux`.

GitHub About text alone cannot guarantee organic discovery. A working download, a clear screenshot, a short real-session demonstration, and installation instructions provide the evidence behind the description. Prefer precise behavior to unsupported popularity, agent-state, or compatibility claims.

## Recommendation

A small product website is useful as an installation and demonstration page once downloads are ready for public use. It should complement the README rather than block the next app improvements. Keep the first version in this repository under `website/`.

A separate repository would introduce another issue tracker, release coordination, duplicated screenshots, and another place to update download links. Split it out later if the site gains its own contributors, backend, or release schedule. Neither SEO nor a custom domain requires a separate repository.

The site should be a static page. Plain HTML and CSS are enough initially; add a static-site generator if documentation grows. Do not require installing Electron or compiling node-pty to build the website. Keep website assets outside the packaged app; the current Electron Builder file list already includes only app output and runtime package metadata.

## First page

Suggested headline: **Your tmux. A better view.**

Supporting copy: **Open the sessions you already have. Click between windows and panes. Pick up your coding agents on any SSH machine.**

The page should answer these questions, in order:

1. What does it do? Show the actual app beside the headline, with light and dark themes and clearly marked demo content if sample data is used.
2. Can I install it? Offer explicit macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64 download choices. State Windows remote-only support and signing status beside the relevant download.
3. Why use it? Show existing-session attachment, mouse navigation, and sessions surviving app closure in a short demonstration with real tmux state.
4. What do I need? Explain system OpenSSH, remote tmux, key authentication, and that no remote Muxyard daemon is installed.
5. Where is the source? Link to GitHub, the release notes, and the setup guide.

Keep social proof out until it exists. Do not use a simulated terminal animation as evidence of working SSH or agent-state integration. Use lightweight images, descriptive alt text, keyboard-accessible controls, and a title/description that explicitly mention tmux GUI and SSH.

## Hosting and releases

GitHub Pages with a separate Pages workflow is sufficient for the initial static site. Upload `website/` as the Pages artifact through GitHub Actions. Do not repurpose the existing `docs/` Markdown source as the site's publishing root unless it becomes a deliberate documentation site.

Use a separate workflow filtered to website and shared public screenshot changes, so site deployments do not rebuild desktop installers. App release workflows should continue to manage signed or preview binaries independently. Public download buttons should use actual published releases; the current draft must not be advertised as a public download. Add a custom domain later if useful.

References: [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom workflows for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
