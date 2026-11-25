export const repository = 'xjtuwxg/muxyard'
export const repositoryURL = `https://github.com/${repository}`
const formats = [
  ['mac-arm64', /-mac-arm64\.(dmg|zip)$/, ['dmg', 'zip']],
  ['mac-x64', /-mac-x64\.(dmg|zip)$/, ['dmg', 'zip']],
  ['win-x64', /-win-x64\.(exe)$/, ['exe']],
  ['linux-x64', /-linux-(?:amd64|x86_64)\.(deb|AppImage)$/, ['deb', 'AppImage']]
]
export function publicRelease(releases) {
  const available = (Array.isArray(releases) ? releases : []).filter(
    (release) =>
      release &&
      release.draft === false &&
      typeof release.tag_name === 'string' &&
      /^v\d+\.\d+\.\d+(?:[-.][\da-z.-]+)?$/i.test(release.tag_name)
  )
  available.sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0))
  const release = available.find((item) => !item.prerelease) ?? available[0]
  if (!release) return { version: null, url: `${repositoryURL}/releases`, platforms: {} }
  const platforms = {}
  for (const [platform, pattern, order] of formats) {
    platforms[platform] = (Array.isArray(release.assets) ? release.assets : [])
      .flatMap((asset) => {
        if (!asset || typeof asset.name !== 'string') return []
        const match = asset.name.match(pattern)
        const expected = `${repositoryURL}/releases/download/${encodeURIComponent(release.tag_name)}/`
        let url
        try {
          url = new URL(asset.browser_download_url)
        } catch {
          return []
        }
        if (
          !match ||
          url.protocol !== 'https:' ||
          url.hostname !== 'github.com' ||
          !url.href.startsWith(expected) ||
          asset.state !== 'uploaded'
        )
          return []
        return [
          {
            label:
              match[1].toLowerCase() === 'deb'
                ? 'DEB'
                : match[1] === 'AppImage'
                  ? 'AppImage'
                  : match[1].toUpperCase(),
            url: url.href,
            format: match[1],
            bytes: asset.size ?? 0
          }
        ]
      })
      .sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format))
  }
  return {
    version: release.tag_name,
    prerelease: Boolean(release.prerelease),
    url: `${repositoryURL}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    platforms
  }
}
