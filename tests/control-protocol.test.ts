import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ControlProtocol, decodeOutput } from '../src/main/control-protocol'

test('frames partial replies, command-looking screen contents, and notifications', async () => {
  const notifications: string[] = []
  const writes: string[] = []
  const protocol = new ControlProtocol(
    (command) => writes.push(command),
    (line) => notifications.push(line)
  )
  protocol.feed(Buffer.from('%beg'))
  protocol.feed(Buffer.from('in 1 1 0\n%end 1 1 0\n'))
  await protocol.ready
  await assert.rejects(
    protocol.request(['split-window', '-c', '/tmp/path\nkill-server']),
    /line breaks/
  )
  assert.equal(writes.length, 0)
  const first = protocol.request(['capture-pane', '-t', '%2'])
  const second = protocol.request(['select-pane', '-t', '%2'])
  protocol.feed(Buffer.from('%begin 1 90 0\nunsolicited hook output\n%end 1 90 0\n'))
  protocol.feed(
    Buffer.from(
      '%begin 2 2 1\n%output is actual screen text\n%end 2 2 1\n%layout-change @1 stuff\n%begin 2 3 1\n%end 2 3 1\n'
    )
  )
  assert.deepEqual(await first, ['%output is actual screen text'])
  assert.deepEqual(await second, [])
  assert.deepEqual(notifications, ['%layout-change @1 stuff'])
  assert.equal(writes[0], "'capture-pane' '-t' '%2'\n")
  protocol.fail(new Error('Test complete'))
})

test('preserves binary output and UTF-8 bytes across notifications', () => {
  assert.deepEqual(decodeOutput('hello\\015\\012\\134\\000'), Buffer.from('hello\r\n\\\0'))
  assert.deepEqual(Buffer.concat([decodeOutput('\\303'), decodeOutput('\\251')]), Buffer.from('é'))
  assert.equal(decodeOutput(Buffer.from('你好').toString('latin1')).toString(), '你好')
})

test('emits capture completion before subsequent output and rejects failed commands', async () => {
  const order: string[] = []
  const protocol = new ControlProtocol(
    () => {},
    () => order.push('stream')
  )
  protocol.feed(Buffer.from('%begin 1 1 0\n%end 1 1 0\n'))
  await protocol.ready
  const capture = protocol.request(['capture-pane'], () => order.push('capture'))
  protocol.feed(Buffer.from('%begin 2 2 1\nhello\n%end 2 2 1\n%output %0 world\n'))
  await capture
  assert.deepEqual(order, ['capture', 'stream'])
  const failing = protocol.request(['bad-command'])
  protocol.feed(Buffer.from('%begin 3 3 1\nunknown command\n%error 3 3 1\n'))
  await assert.rejects(failing, /unknown command/)
  protocol.fail(new Error('Done'))
})
