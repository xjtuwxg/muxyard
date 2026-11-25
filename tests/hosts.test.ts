import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HostStore, importAliases } from '../src/main/hosts'

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
    if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600)
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

test('SSH import adds only explicitly selected aliases and never imports the whole config implicitly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxyard-import-'))
  try {
    const store = new HostStore(join(directory, 'hosts.json'))
    await store.load()
    await importAliases(store, [], ['dev', 'offline'])
    assert.equal(store.list().length, 1)
    await importAliases(store, ['dev', 'dev'], ['dev', 'offline'])
    assert.deepEqual(
      store
        .list()
        .filter((host) => host.kind === 'ssh')
        .map((host) => host.address),
      ['dev']
    )
    await assert.rejects(() =>
      importAliases(store, ['not-selected-from-config'], ['dev', 'offline'])
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('machine membership survives restart and migrates legacy aliases without promoting every import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muxyard-membership-'))
  const file = join(directory, 'hosts.json')
  try {
    await writeFile(
      file,
      JSON.stringify([
        { id: 'host-manual', name: 'Manual', kind: 'ssh', address: 'manual' },
        { id: 'ssh-old', name: 'Old import', kind: 'ssh', address: 'old' }
      ])
    )
    const store = new HostStore(file)
    await store.load()
    assert.equal(store.get('host-manual').pinned, true)
    assert.equal(store.get('ssh-old').pinned, false)
    await store.pin('ssh-old', true)
    await importAliases(store, ['selected'], ['selected'])
    const reopened = new HostStore(file)
    await reopened.load()
    assert.equal(reopened.get('ssh-old').pinned, true)
    assert.equal(reopened.list().find((host) => host.address === 'selected')?.pinned, true)
    await assert.rejects(() => reopened.pin('missing', true))
    await assert.rejects(() => reopened.pin('local', false))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
