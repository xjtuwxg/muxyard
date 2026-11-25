const screenshot = document.querySelector('#workspace-image')
const themes = new Set(['daylight', 'paper', 'graphite', 'dusk', 'grove'])
for (const button of document.querySelectorAll('[data-theme]')) {
  button.addEventListener('click', () => {
    const theme = button.dataset.theme
    if (!themes.has(theme) || !screenshot) return
    for (const choice of document.querySelectorAll('[data-theme]'))
      choice.setAttribute('aria-pressed', String(choice === button))
    screenshot.src = `assets/screenshots/overview-${theme}.png`
    screenshot.alt = `Muxyard ${button.textContent.trim()} theme showing a clearly labeled demo workspace with tmux sessions and coding agent panes`
  })
}
function publicURL(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.startsWith('/xjtuwxg/muxyard/releases/')
      ? url.href
      : null
  } catch {
    return null
  }
}
async function downloads() {
  try {
    const response = await fetch('release.json')
    if (!response.ok) return
    const release = await response.json()
    if (!release.version || !publicURL(release.url)) return
    document.querySelector('#release-label').textContent =
      `${release.version} ${release.prerelease ? 'preview' : 'release'}`
    document.querySelector('#release-status').textContent =
      'Public builds for your next workspace. Choose your OS and processor below.'
    document.querySelector('#release-notes').href = publicURL(release.url)
    for (const card of document.querySelectorAll('[data-platform]')) {
      const assets = (release.platforms?.[card.dataset.platform] ?? []).filter((asset) =>
        publicURL(asset.url)
      )
      if (!assets.length) continue
      const container = card.querySelector('.download-actions')
      container.replaceChildren()
      for (const [index, asset] of assets.entries()) {
        const anchor = document.createElement('a')
        anchor.href = publicURL(asset.url)
        anchor.textContent = `${index === 0 ? 'Download ' : ''}${asset.label}`
        if (index === 0) anchor.className = 'button button-secondary'
        container.append(anchor)
      }
    }
  } catch {
    // The static release links remain usable when metadata is unavailable.
  }
}
void downloads()
