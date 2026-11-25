import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'

export const updateManifests = [
  'latest-arm64-mac.yml',
  'latest-x64-mac.yml',
  'latest-x64.yml',
  'latest-x64-linux.yml'
]

export async function hashFile(path, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

export async function validateUpdateMetadata(directory, version, manifests = updateManifests) {
  const allowed = {
    'latest-arm64-mac.yml': [
      `Muxyard-${version}-mac-arm64.zip`,
      `Muxyard-${version}-mac-arm64.dmg`
    ],
    'latest-x64-mac.yml': [`Muxyard-${version}-mac-x64.zip`, `Muxyard-${version}-mac-x64.dmg`],
    'latest-x64.yml': [`Muxyard-${version}-win-x64.exe`],
    'latest-x64-linux.yml': [
      `Muxyard-${version}-linux-x86_64.AppImage`,
      `Muxyard-${version}-linux-amd64.deb`
    ]
  }
  for (const name of manifests) {
    if (!allowed[name]) throw new Error(`Unexpected update manifest: ${name}`)
    const info = parse(await readFile(join(directory, name), 'utf8'))
    if (info?.version !== version || !Array.isArray(info.files) || !info.files.length)
      throw new Error(`Invalid version or files in ${name}`)
    if (!info.files.some((file) => file.url === allowed[name][0]))
      throw new Error(`Missing primary update artifact in ${name}`)
    for (const file of info.files) {
      if (!allowed[name].includes(file.url))
        throw new Error(`Unsafe or wrong-architecture update URL in ${name}`)
      const path = join(directory, file.url)
      if (
        file.size !== (await stat(path)).size ||
        file.sha512 !== (await hashFile(path, 'sha512', 'base64'))
      )
        throw new Error(`Update checksum or size mismatch: ${file.url}`)
    }
    if (info.path !== undefined) {
      const file = info.files.find((file) => file.url === info.path)
      if (!file || file.sha512 !== info.sha512)
        throw new Error(`Invalid legacy update path in ${name}`)
    }
  }
}
