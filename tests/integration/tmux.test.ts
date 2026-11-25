import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionArgs, discover, runTmux, PANE_FORMAT } from '../../src/main/tmux'
import { Terminals } from '../../src/main/terminals'
import type { Host } from '../../src/shared/types'

test(
  'attaches a real PTY, sends input, splits and zooms, and detaches without killing the session',
  { timeout: 20000 },
  async () => {
    const host: Host = {
      id: 'integration',
      name: 'Isolated test',
      kind: 'local',
      address: '',
      socket: `muxyard-test-${process.pid}-${Date.now()}`
    }
    const output: string[] = []
    const terminals = new Terminals((event) => {
      if (event.data) {
        output.push(event.data)
        terminals.acknowledge(event.id, event.data.length)
      }
    })
    async function until(check: () => boolean | Promise<boolean>): Promise<void> {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        if (await check()) return
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      throw new Error('Timed out waiting for tmux state or terminal output.')
    }
    try {
      await runTmux(host, [
        '-f',
        '/dev/null',
        'new-session',
        '-d',
        '-s',
        'existing-session',
        '-x',
        '100',
        '-y',
        '30',
        '/bin/sh'
      ])
      const original = (await discover(host)).sessions[0]
      assert.ok(
        original,
        JSON.stringify(await runTmux(host, ['list-panes', '-a', '-F', PANE_FORMAT]))
      )
      assert.equal(original.name, 'existing-session')
      terminals.open('integration-pty', host, original.id, 100, 30)
      await until(async () => (await discover(host)).sessions[0].attached === 1)
      terminals.open('second-client', host, original.id, 100, 30)
      await until(async () => (await discover(host)).sessions[0].attached === 2)
      terminals.write('integration-pty', "printf 'MUXYARD_%s\\n' 'PTY_OK'\r")
      await until(() => output.join('').includes('MUXYARD_PTY_OK'))
      terminals.resize('integration-pty', 110, 34)
      const pane = original.panes[0]
      await runTmux(
        host,
        actionArgs(
          { type: 'split', sessionId: original.id, paneId: pane.id, direction: 'horizontal' },
          pane
        )
      )
      assert.equal((await discover(host)).sessions[0].panes.length, 2)
      await runTmux(
        host,
        actionArgs({ type: 'select', sessionId: original.id, paneId: pane.id }, pane)
      )
      await runTmux(
        host,
        actionArgs({ type: 'zoom', sessionId: original.id, paneId: pane.id }, pane)
      )
      assert.equal(
        (
          await runTmux(host, ['display-message', '-p', '-t', pane.id, '#{window_zoomed_flag}'])
        ).trim(),
        '1'
      )
      terminals.close('integration-pty')
      await until(async () => (await discover(host)).sessions[0].attached === 1)
      terminals.close('second-client')
      await until(async () => (await discover(host)).sessions[0].attached === 0)
      assert.equal((await discover(host)).sessions[0].panes.length, 2)
      assert.ok(
        (await runTmux(host, ['capture-pane', '-p', '-t', pane.id])).includes('MUXYARD_PTY_OK')
      )
    } finally {
      terminals.closeAll()
      await runTmux(host, ['kill-server']).catch(() => {})
    }
  }
)
