import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PaneConnections } from '../../src/main/panes'
import { discover, runTmux } from '../../src/main/tmux'
import type { Host, PaneEvent } from '../../src/shared/types'

test(
  'control mode streams separate panes, handles splits from another client, and preserves processes',
  { timeout: 20000 },
  async () => {
    const host: Host = {
      id: 'panes-test',
      name: 'Test',
      kind: 'local',
      address: '',
      socket: `muxyard-panes-${process.pid}-${Date.now()}`
    }
    const events: PaneEvent[] = []
    const connections = new PaneConnections((event) => {
      events.push(event)
      if (event.data)
        connections.get(event.id).acknowledge(Buffer.from(event.data, 'base64').length)
    })
    const until = async (condition: () => boolean | Promise<boolean>): Promise<void> => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        if (await condition()) return
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      throw new Error(
        'Pane test timed out: ' + JSON.stringify(events.filter((event) => event.error))
      )
    }
    try {
      await runTmux(host, [
        '-f',
        '/dev/null',
        'new-session',
        '-d',
        '-s',
        'panes',
        '-x',
        '100',
        '-y',
        '30',
        '/bin/sh'
      ])
      const session = (await discover(host)).sessions[0]
      await connections.open('panes-client', host, session.id)
      const first = session.panes[0].id
      const client = connections.get('panes-client')
      await client.capture(first)
      await client.input(first, "printf 'FIRST_%s\\n' 'PANE'\r")
      await until(() =>
        events.some(
          (event) =>
            event.paneId === first &&
            Buffer.from(event.data || '', 'base64')
              .toString()
              .includes('FIRST_PANE')
        )
      )
      await client.capture(first)
      const cursor = (
        await runTmux(host, ['display-message', '-p', '-t', first, '#{cursor_y},#{cursor_x}'])
      )
        .trim()
        .split(',')
        .map(Number)
      const hydrated = events.filter((event) => event.paneId === first && event.reset).at(-1)!
      assert.ok(
        Buffer.from(hydrated.data!, 'base64')
          .toString()
          .includes(`\x1b[${cursor[0] + 1};${cursor[1] + 1}H`)
      )
      await runTmux(host, ['split-window', '-h', '-t', first, '/bin/sh'])
      await until(() => events.some((event) => event.session?.panes.length === 2))
      const second = (await discover(host)).sessions[0].panes.find((pane) => pane.id !== first)!.id
      await client.capture(second)
      await client.select(second)
      await client.input(second, "printf 'SECOND_%s\\n' 'PANE'\r")
      await until(() =>
        events.some(
          (event) =>
            event.paneId === second &&
            Buffer.from(event.data || '', 'base64')
              .toString()
              .includes('SECOND_PANE')
        )
      )
      assert.ok(!(await runTmux(host, ['capture-pane', '-p', '-t', first])).includes('SECOND_PANE'))
      await client.resize(120, 36)
      await client.action({ type: 'zoom', sessionId: session.id, paneId: second })
      assert.equal(
        (
          await runTmux(host, ['display-message', '-p', '-t', second, '#{window_zoomed_flag}'])
        ).trim(),
        '1'
      )
      await client.action({ type: 'new-window', sessionId: session.id, paneId: second })
      const updated = (await discover(host)).sessions[0]
      assert.equal(updated.windows, 2)
      const newPane = updated.panes.find((pane) => pane.windowActive)!
      assert.notEqual(newPane.windowId, session.panes[0].windowId)
      assert.equal(newPane.path, session.panes[0].path)
      await client.action({ type: 'previous-window', sessionId: session.id, paneId: newPane.id })
      assert.equal(
        (await discover(host)).sessions[0].panes.find((pane) => pane.windowActive)!.windowId,
        session.panes[0].windowId
      )
      await client.action({ type: 'next-window', sessionId: session.id, paneId: first })
      assert.equal(
        (await discover(host)).sessions[0].panes.find((pane) => pane.windowActive)!.windowId,
        newPane.windowId
      )
      connections.close('panes-client')
      await until(async () => (await discover(host)).sessions[0].attached === 0)
      assert.equal((await discover(host)).sessions[0].panes.length, 3)
    } finally {
      connections.closeAll()
      await runTmux(host, ['kill-server']).catch(() => {})
    }
  }
)
