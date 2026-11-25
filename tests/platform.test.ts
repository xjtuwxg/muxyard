import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireLocalTmux, sshExecutable } from '../src/main/platform'

test('selects system OpenSSH on each platform and explains Windows local tmux support', () => {
  assert.equal(sshExecutable('darwin'), '/usr/bin/ssh')
  assert.equal(sshExecutable('linux'), '/usr/bin/ssh')
  assert.equal(sshExecutable('win32', 'D:\\Windows'), 'D:\\Windows\\System32\\OpenSSH\\ssh.exe')
  assert.throws(() => requireLocalTmux('win32'), /Add an SSH machine/)
  assert.doesNotThrow(() => requireLocalTmux('linux'))
})
