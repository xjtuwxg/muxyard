import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionArgs,
  newSessionArgs,
  commandFor,
  detectAgent,
  FIELD,
  parseSnapshot,
  shellQuote,
  validateHost
} from '../src/main/tmux'
import { parseSSHConfig } from '../src/main/hosts'
import type { Host } from '../src/shared/types'

const remote: Host = { id: 'remote', name: 'Remote', kind: 'ssh', address: 'dev@box' }
const row = (changes: Record<number, string> = {}): string => {
  const fields = [
    '$1',
    'work',
    '1',
    '2',
    '@2',
    '0',
    'agent',
    '1',
    '%3',
    '0',
    '1',
    'claude',
    '/srv/project',
    'title',
    '0'
  ]
  for (const [index, value] of Object.entries(changes)) fields[Number(index)] = value
  return fields.join(FIELD)
}

test('discovers sessions, windows, panes, and executable-based agents', () => {
  const snapshot = parseSnapshot(
    [
      row(),
      row({ 4: '@3', 5: '1', 6: 'shell', 7: '0', 8: '%4', 11: 'zsh' }),
      row({ 0: '$2', 1: 'other', 8: '%5', 11: 'codex' })
    ].join('\n')
  )
  assert.equal(snapshot.sessions.length, 2)
  assert.equal(snapshot.sessions[0].panes.length, 2)
  assert.equal(snapshot.sessions[0].panes[0].agent, 'Claude Code')
  assert.equal(snapshot.sessions[1].panes[0].agent, 'Codex')
  assert.equal(snapshot.sessions[0].panes[1].windowActive, false)
  assert.equal(detectAgent('node'), undefined)
  assert.equal(detectAgent('/bin/opencode'), 'OpenCode')
})

test('ignores login banners and malformed metadata without inventing sessions', () => {
  assert.equal(parseSnapshot('Welcome to this server\n' + row() + '\nbad').sessions.length, 1)
  assert.equal(parseSnapshot(row({ 8: 'not-a-pane' })).sessions.length, 0)
})

test('SSH destinations cannot introduce options or shell commands', () => {
  for (const address of [
    '-oProxyCommand=evil',
    'host;touch /tmp/evil',
    '$(whoami)',
    'host\nother',
    'user@-oFoo'
  ]) {
    assert.throws(() => validateHost({ ...remote, address }))
  }
  assert.equal(validateHost(remote).address, 'dev@box')
  assert.equal(validateHost({ ...remote, address: 'my-ssh-alias' }).address, 'my-ssh-alias')
  assert.throws(() => validateHost({ ...remote, socket: 'foo;bar' }))
})

test('shell quotes remote arguments, including paths with executable syntax', () => {
  const value = "/srv/O'Reilly/$(touch bad); echo no"
  assert.equal(shellQuote(value), "'/srv/O'\\''Reilly/$(touch bad); echo no'")
  const command = commandFor(remote, ['split-window', '-c', value])
  assert.ok(command.file.endsWith(process.platform === 'win32' ? 'ssh.exe' : '/usr/bin/ssh'))
  assert.ok(command.args.includes('StrictHostKeyChecking=yes'))
  assert.ok(command.args.includes('BatchMode=yes'))
  assert.equal(command.args.at(-1), `'tmux' '-u' 'split-window' '-c' ${shellQuote(value)}`)
})

test('mouse actions target stable pane IDs and preserve the working directory', () => {
  const pane = parseSnapshot(row({ 12: "/srv/project with 'quotes'" })).sessions[0].panes[0]
  assert.deepEqual(
    actionArgs({ type: 'select', sessionId: pane.sessionId, paneId: pane.id }, pane),
    ['select-window', '-t', '$1:@2', ';', 'select-pane', '-t', '%3']
  )
  assert.deepEqual(
    actionArgs(
      { type: 'split', sessionId: pane.sessionId, paneId: pane.id, direction: 'horizontal' },
      pane
    ),
    ['split-window', '-h', '-t', '%3', '-c', pane.path]
  )
  assert.deepEqual(
    actionArgs({ type: 'new-window', sessionId: pane.sessionId, paneId: pane.id }, pane),
    ['new-window', '-t', '$1:', '-c', pane.path]
  )
  assert.deepEqual(
    actionArgs({ type: 'next-window', sessionId: pane.sessionId, paneId: pane.id }, pane),
    ['next-window', '-t', '$1']
  )
})

test('imports literal SSH aliases, skipping wildcard and negated patterns', () => {
  assert.deepEqual(
    parseSSHConfig(
      'Host dev staging # work\n Host *.example.com !bad *\nHost dev\nhost gpu-01\nInclude ~/.ssh/work'
    ),
    ['dev', 'staging', 'gpu-01']
  )
})

test('session creation validates names and sends literal remote working directories', () => {
  for (const name of ['', '-flag', 'a.b', 'a:b', 'a;evil', 'x'.repeat(65)]) {
    assert.throws(() => newSessionArgs({ name }))
  }
  for (const directory of ['relative/path', '/tmp/\ncommand', '/tmp/\0bad']) {
    assert.throws(() => newSessionArgs({ name: 'project', directory }))
  }
  const directory = "/srv/O'Reilly/$(touch bad)"
  const args = newSessionArgs({ name: 'project-1', directory })
  assert.deepEqual(args.slice(-2), ['-c', directory])
  assert.ok(commandFor(remote, args).args.at(-1)?.endsWith(shellQuote(directory)))
})
