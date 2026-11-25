# Muxyard website

The public site is <https://xiaoguang.wang/muxyard/>. GitHub Pages inherits the custom domain already configured on the owner's account. HTTPS is enforced. Repository About text is managed by the owner.

## Development

The buildless HTML/CSS/JS source lives in `website/`. It has its own lockfile and Playwright tests; it does not install Electron or compile node-pty.

```sh
npm ci --prefix website
npm run site:build
npm run site:preview
# In another terminal, after installing the test browser:
cd website
npx playwright install chromium
npm run test:unit
npm test
```

`npm run site:build` writes `dist/website/`. `npm run site:preview` serves it on <http://127.0.0.1:4173>. For an offline build, run `npm run build --prefix website -- --offline`, or invoke `node scripts/build-website.mjs --offline` directly. An unavailable release API leaves working links to GitHub Releases and source instructions; it never invents installer URLs.

When using an existing Chrome install for local QA, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can name its executable. CI installs a clean Playwright Chromium browser.

## Assets and branding

[Brand assets](brand.md) use one canonical pane mark and outlined wordmarks. Fonts are served locally with their license. Product screenshots come from the actual app. Theme previews show labeled demo data; the focus screenshot uses a real isolated local tmux server.

Regenerate screenshots after relevant app changes:

```sh
npm run screenshots
```

This requires the normal app development dependencies, tmux, and permission to launch Electron. It creates only its own named socket and temporary application-data directory, then removes them. Checked-in screenshots keep normal site builds independent from the app toolchain.

## Releases and truthful downloads

The builder reads GitHub release metadata, discards drafts, prefers a public stable release, and otherwise selects the latest public prerelease. It offers only uploaded assets from this exact repository and release tag, accounting for AppImage `x86_64` and Debian `amd64` filenames. Download buttons use the returned public URLs.

A read-only check against the selected tag determines whether it contains customizable themes. When the published installer predates a feature shown in the current source screenshot, the site explicitly identifies the screenshot as a source preview. It does not publish a draft or create an app release.

The site includes honest empty states when no release or platform asset is available. Tests verify draft exclusion, asset routing, metadata failure, theme controls, keyboard access, image loading, and desktop/mobile overflow.

## GitHub Pages

`.github/workflows/pages.yml` runs website unit checks and desktop/mobile browser tests, uploads only `dist/website`, and deploys through the `github-pages` environment. Build jobs have read-only access; only the deploy job has Pages write and OIDC permissions.

Pushes affecting the site, shared brand, or site build scripts trigger it. Publishing an app release also refreshes the download metadata, using the latest website source on `main`. Pull requests run the checks without deployment. The workflow can be dispatched manually.

Desktop app CI ignores website-only changes. Native installer builds remain tag-triggered and separate. No separate website repository, runtime backend, analytics, or visitor account is needed.

## GitHub positioning

The recommended About description is:

> A desktop GUI for the tmux sessions and coding agents you already run — locally or over SSH.

A useful next demonstration is a short recording of a real remote tmux session being opened, navigated with the mouse, and left running after the app closes. Keep sample content labeled and do not imply accurate agent task status from executable detection alone.

References: [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom workflows for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
