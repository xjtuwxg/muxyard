import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const tag = process.argv[2]
if (tag !== `v${version}`) {
  throw new Error(`Release tag must be v${version}, received ${JSON.stringify(tag)}.`)
}
console.log(`Building Muxyard ${version}`)
