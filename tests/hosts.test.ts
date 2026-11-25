import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HostStore } from '../src/main/hosts'

test('concurrent profile changes persist without losing machines and protect the local profile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxyard-hosts-'))
  const file = join(directory, 'hosts.json')
  try {
    const store = new HostStore(file)
    await store.load()
    await Promise.all([
      store.save({ id: 'dev', name: 'Dev', kind: 'ssh', address: 'dev-box' }),
      store.save({ id: 'lab', name: 'Lab', kind: 'ssh', address: 'lab-box' })
    ])
    const reopened = new HostStore(file)
    assert.deepEqual(
      (await reopened.load()).map((host) => host.id),
      ['local', 'dev', 'lab']
    )
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    await assert.rejects(() => reopened.remove('local'))
    await assert.rejects(() =>
      reopened.save({ id: 'local', name: 'Other', kind: 'local', address: '' })
    )
    await reopened.remove('dev')
    assert.deepEqual(
      reopened.list().map((host) => host.id),
      ['local', 'lab']
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
