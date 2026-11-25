import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicRelease, repositoryURL } from '../../scripts/website-release.mjs'
const asset = (name, tag = 'v0.1.0') => ({
  name,
  state: 'uploaded',
  size: 100,
  browser_download_url: `${repositoryURL}/releases/download/${tag}/${name}`
})
const release = (changes = {}) => ({
  tag_name: 'v0.1.0',
  draft: false,
  prerelease: true,
  published_at: '2026-01-01',
  assets: [],
  ...changes
})
test('drafts never become public downloads', () => {
  assert.equal(publicRelease([release({ draft: true })]).version, null)
  assert.equal(publicRelease(null).version, null)
})
test('routes actual native installer names and excludes unrelated or untrusted assets', () => {
  const result = publicRelease([
    release({
      assets: [
        asset('Muxyard-0.1.0-mac-arm64.zip'),
        asset('Muxyard-0.1.0-mac-arm64.dmg'),
        asset('Muxyard-0.1.0-linux-amd64.deb'),
        asset('Muxyard-0.1.0-linux-x86_64.AppImage'),
        asset('SHA256SUMS'),
        { ...asset('evil-mac-x64.dmg'), browser_download_url: 'https://evil.example/installer' },
        asset('wrong-win-x64.exe', 'v9.0.0')
      ]
    })
  ])
  assert.deepEqual(
    result.platforms['mac-arm64'].map((item) => item.label),
    ['DMG', 'ZIP']
  )
  assert.deepEqual(
    result.platforms['linux-x64'].map((item) => item.label),
    ['DEB', 'AppImage']
  )
  assert.equal(result.platforms['mac-x64'].length, 0)
  assert.equal(result.platforms['win-x64'].length, 0)
})
test('prefers stable releases over previews and uses previews when no stable build exists', () => {
  const preview = release({ tag_name: 'v0.2.0', published_at: '2026-02-01' })
  const stable = release({ prerelease: false })
  assert.equal(publicRelease([preview, stable]).version, 'v0.1.0')
  assert.equal(publicRelease([preview]).version, 'v0.2.0')
})
