import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { publicRelease, repository } from './website-release.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, 'dist/website')
const offline = process.argv.includes('--offline')
let releases = []
let themesAvailable = false
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Muxyard-website' }
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`
if (process.env.SITE_RELEASES_FILE) {
  releases = JSON.parse(await readFile(process.env.SITE_RELEASES_FILE, 'utf8'))
} else if (!offline) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=30`,
      { headers, signal: AbortSignal.timeout(15000) }
    )
    if (response.ok) releases = await response.json()
    else
      console.warn(
        `Release metadata unavailable (${response.status}); retaining links to GitHub Releases.`
      )
  } catch {
    console.warn('Release metadata unavailable; retaining links to GitHub Releases.')
  }
}
const release = publicRelease(releases)
if (release.version && !offline && !process.env.SITE_RELEASES_FILE) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/contents/src/renderer/src/themes.ts?ref=${encodeURIComponent(release.version)}`,
      { headers, signal: AbortSignal.timeout(10000) }
    )
    themesAvailable = response.ok
  } catch {}
}
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const file of ['index.html', 'styles.css', 'site.js'])
  await cp(join(root, 'website', file), join(output, file))
await cp(join(root, 'website/fonts'), join(output, 'fonts'), { recursive: true })
await cp(join(root, 'website/assets'), join(output, 'assets'), { recursive: true })
await cp(join(root, 'assets/brand'), join(output, 'assets/brand'), { recursive: true })

const siteURL = new URL(process.env.SITE_URL || 'https://xiaoguang.wang/muxyard/')
if (!['https:', 'http:'].includes(siteURL.protocol))
  throw new Error('SITE_URL must be an HTTP(S) website URL.')
siteURL.protocol = 'https:'
if (!siteURL.pathname.endsWith('/')) siteURL.pathname += '/'
let html = await readFile(join(output, 'index.html'), 'utf8')
html = html.replaceAll('https://xjtuwxg.github.io/muxyard/', siteURL.href)
if (themesAvailable)
  html = html.replace(
    'Theme customization is available in the source build and is coming to the next packaged preview.',
    `Customizable themes are included in ${release.version}.`
  )
await writeFile(join(output, 'index.html'), html)
await writeFile(join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n')
await writeFile(join(output, '.nojekyll'), '')
await writeFile(
  join(output, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', siteURL)}\n`
)
await writeFile(
  join(output, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteURL.href}</loc></url></urlset>\n`
)
console.log(`Website built at ${output}; public release: ${release.version ?? 'none'}.`)
