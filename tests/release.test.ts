import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

test(
  'release assembly accepts actual platform filenames and protects published releases',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'muxyard-release-'))
    const { version } = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )
    const script = fileURLToPath(new URL('../scripts/release.mjs', import.meta.url))
    const tag = `v${version}`
    const log = join(directory, 'gh.log')
    try {
      await mkdir(join(directory, 'artifacts'))
      await mkdir(join(directory, 'bin'))
      await writeFile(
        join(directory, 'bin', 'gh'),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_GH_LOG"\nif [ "$1" = api ]; then printf "%s" "$MOCK_RELEASES"; fi\n',
        { mode: 0o700 }
      )
      const env = {
        ...process.env,
        PATH: join(directory, 'bin') + delimiter + process.env.PATH,
        RELEASE_TAG: tag,
        MOCK_GH_LOG: log,
        MOCK_RELEASES: '[]'
      }
      const run = () =>
        spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8' })
      const missing = run()
      assert.notEqual(missing.status, 0)
      assert.match(missing.stderr, /Missing installer/)
      await assert.rejects(() => readFile(log), { code: 'ENOENT' })

      // These suffixes come from actual native builds. Linux targets use different arch names.
      const suffixes = [
        'mac-arm64.dmg',
        'mac-arm64.zip',
        'mac-x64.dmg',
        'mac-x64.zip',
        'win-x64.exe',
        'linux-x86_64.AppImage',
        'linux-amd64.deb'
      ]
      for (const suffix of suffixes)
        await writeFile(join(directory, 'artifacts', `Muxyard-${version}-${suffix}`), suffix)

      env.MOCK_RELEASES = JSON.stringify([{ tag_name: tag, draft: false }])
      const published = run()
      assert.notEqual(published.status, 0)
      assert.match(published.stderr, /already published/)
      assert.doesNotMatch(await readFile(log, 'utf8'), /release create|release upload/)

      env.MOCK_RELEASES = '[]'
      const draft = run()
      assert.equal(draft.status, 0, draft.stderr)
      const calls = await readFile(log, 'utf8')
      assert.ok(calls.includes(`release create ${tag} --draft --prerelease --verify-tag`))
      assert.ok(calls.includes(`release upload ${tag}`))
      const sums = (await readFile(join(directory, 'artifacts', 'SHA256SUMS'), 'utf8'))
        .trim()
        .split('\n')
      assert.equal(sums.length, 7)
      for (const suffix of suffixes)
        assert.ok(sums.some((line) => /^[a-f0-9]{64}  /.test(line) && line.endsWith(suffix)))

      await writeFile(log, '')
      env.RELEASE_TAG = 'wrong-version'
      const mismatch = run()
      assert.notEqual(mismatch.status, 0)
      assert.match(mismatch.stderr, /do not match/)
      assert.equal(await readFile(log, 'utf8'), '')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
