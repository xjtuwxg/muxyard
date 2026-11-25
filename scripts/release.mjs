import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { hashFile, updateManifests, validateUpdateMetadata } from './update-metadata.mjs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const tag = process.env.RELEASE_TAG
if (tag !== `v${version}`) throw new Error('Release tag and package version do not match.')
const directory = 'artifacts'
const expected = [
  `Muxyard-${version}-mac-arm64.dmg`,
  `Muxyard-${version}-mac-arm64.zip`,
  `Muxyard-${version}-mac-x64.dmg`,
  `Muxyard-${version}-mac-x64.zip`,
  `Muxyard-${version}-win-x64.exe`,
  `Muxyard-${version}-linux-x86_64.AppImage`,
  `Muxyard-${version}-linux-amd64.deb`
]
const actual = readdirSync(directory)
for (const name of expected) {
  if (!actual.includes(name)) throw new Error(`Missing installer: ${name}`)
}
await validateUpdateMetadata(directory, version)
expected.push(
  ...updateManifests,
  ...actual.filter((name) => expected.some((installer) => name === `${installer}.blockmap`))
)
const hashes = []
for (const name of expected) hashes.push(`${await hashFile(join(directory, name))}  ${name}`)
writeFileSync(join(directory, 'SHA256SUMS'), hashes.join('\n') + '\n')
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'GitHub CLI failed.')
  return result.stdout
}
// A retry can replace assets on its draft, but cannot alter an already published release.
const existing = JSON.parse(
  gh(['api', '--method', 'GET', 'repos/{owner}/{repo}/releases', '-F', 'per_page=100'])
)
const release = existing.find((item) => item.tag_name === tag)
if (release && !release.draft)
  throw new Error('This release is already published. Create a new version instead.')
if (!release) {
  gh([
    'release',
    'create',
    tag,
    '--draft',
    '--prerelease',
    '--verify-tag',
    '--title',
    `Muxyard ${version}`,
    '--notes-file',
    'docs/release-notes.md'
  ])
}
gh([
  'release',
  'upload',
  tag,
  ...expected.map((name) => join(directory, name)),
  join(directory, 'SHA256SUMS'),
  '--clobber'
])
console.log(`Draft ${tag} is ready for review. Nothing has been published.`)
