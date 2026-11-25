import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { shellQuote } from '../../src/main/tmux'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function launch(data: string): Promise<ElectronApplication> {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    MUXYARD_DATA_DIR: data
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch(
    process.env.MUXYARD_APP
      ? { executablePath: process.env.MUXYARD_APP, args: [`--user-data-dir=${data}`], env }
      : { args: [join(root, 'out/main/index.js')], env }
  )
  const userData = await app.evaluate(({ app }) => app.getPath('userData'))
  if ((await realpath(userData)) !== (await realpath(data))) {
    await app.close()
    throw new Error(`Refusing to run UI tests without an isolated user-data directory: ${userData}`)
  }
  return app
}

test('desktop demo supports session attachment, pane navigation, search and detach', async () => {
  const data = await mkdtemp(join(tmpdir(), 'muxyard-ui-'))
  let app: ElectronApplication | undefined
  try {
    app = await launch(data)
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await expect(page.getByText('Pick up where you left off.')).toBeVisible()
    await page.getByRole('button', { name: 'Explore demo', exact: true }).first().click()
    await expect(
      page.getByText('Sample machines and terminal output. No connection to your servers.')
    ).toBeVisible()
    await expect(page.locator('.session-card')).toHaveCount(3)
    await page.screenshot({ path: '/private/tmp/muxyard-overview.png' })
    await page.locator('.session-card').filter({ hasText: 'atlas-api' }).click()
    await expect(page.locator('.pane-inspector')).toContainText('Claude Code')
    await expect(page.locator('.terminal-view')).toBeVisible()
    await page.getByRole('button', { name: 'Find in terminal', exact: true }).click()
    await page.getByPlaceholder('Find in terminal…').fill('pagination')
    await page.getByRole('button', { name: 'Close search' }).click()
    await page.screenshot({ path: '/private/tmp/muxyard-terminal.png' })
    await page.getByRole('button', { name: 'Detach', exact: true }).click()
    await expect(page.locator('.terminal-view')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Find a session' }).fill('web-studio')
    await expect(page.locator('.session-card')).toHaveCount(1)
    await page.getByRole('textbox', { name: 'Find a session' }).fill('')
    await page.getByRole('button', { name: 'Add machine', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Make room for a machine.')
    await expect(
      page.getByRole('button', { name: 'Add machine', exact: true }).last()
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    expect(errors).toEqual([])
  } finally {
    await app?.close()
    await rm(data, { recursive: true, force: true })
  }
})

test('desktop connects to a real isolated tmux session and keeps it after detaching', async () => {
  const data = await mkdtemp(join(tmpdir(), 'muxyard-live-ui-'))
  const socket = `muxyard-ui-${process.pid}-${Date.now()}`
  const tmux = (args: string[]): string =>
    execFileSync('tmux', ['-L', socket, ...args], { encoding: 'utf8' })
  tmux([
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-s',
    'ui-existing',
    '-x',
    '100',
    '-y',
    '30',
    '/bin/sh'
  ])
  let app: ElectronApplication | undefined
  try {
    app = await launch(data)
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add machine', exact: true }).first().click()
    await page.getByRole('button', { name: 'Local socket' }).click()
    await page.getByLabel('Display name').fill('Isolated UI test')
    await page.getByLabel('Tmux socket name').fill(socket)
    await page.getByRole('dialog').getByRole('button', { name: 'Add machine', exact: true }).click()
    await expect(page.locator('.session-card').filter({ hasText: 'ui-existing' })).toBeVisible()
    await page.locator('.session-card').filter({ hasText: 'ui-existing' }).click()
    await expect(page.locator('.toolbar-status')).toHaveText('Attached')
    await expect(page.locator('.gui-pane')).toHaveCount(1)
    await page.locator('.gui-pane textarea').fill("printf 'MUXYARD_%s\\n' 'UI_OK'")
    await page.locator('.gui-pane textarea').press('Enter')
    await expect.poll(() => tmux(['capture-pane', '-p'])).toContain('MUXYARD_UI_OK')
    await page.getByRole('button', { name: 'Split', exact: true }).click()
    await expect(page.locator('.pane-button')).toHaveCount(2)
    await expect(page.locator('.gui-pane:visible')).toHaveCount(2)
    const paneIds = tmux(['list-panes', '-F', '#{pane_id}']).trim().split('\n')
    await page.locator(`.gui-pane[data-pane-id="${paneIds[0]}"] .gui-pane-header strong`).click()
    await expect(page.locator(`.gui-pane[data-pane-id="${paneIds[0]}"]`)).toHaveClass(/focused/)
    await page.keyboard.type("printf 'CLICK_%s\\n' 'LEFT_OK'")
    await page.keyboard.press('Enter')
    await expect
      .poll(() => tmux(['capture-pane', '-p', '-t', paneIds[0]]))
      .toContain('CLICK_LEFT_OK')
    expect(tmux(['capture-pane', '-p', '-t', paneIds[1]])).not.toContain('CLICK_LEFT_OK')
    const queryScript = join(data, 'terminal-query.cjs')
    await writeFile(
      queryScript,
      "process.stdin.setRawMode(true); let reply = ''; process.stdin.on('data', chunk => reply += chunk.toString()); process.stdout.write('\\x1b[6n'); setTimeout(() => { process.stdin.setRawMode(false); console.log('\\r\\nQUERY_REPLIES=' + (reply.match(/R/g) || []).length); process.exit(0) }, 350)"
    )
    await page.keyboard.type(`${shellQuote(process.execPath)} ${shellQuote(queryScript)}`)
    await page.keyboard.press('Enter')
    await expect
      .poll(() => tmux(['capture-pane', '-p', '-t', paneIds[0]]))
      .toContain('QUERY_REPLIES=1')
    await page.locator(`.gui-pane[data-pane-id="${paneIds[1]}"] .gui-pane-header strong`).click()
    await expect(page.locator(`.gui-pane[data-pane-id="${paneIds[1]}"]`)).toHaveClass(/focused/)
    await page.keyboard.type("printf 'CLICK_%s\\n' 'RIGHT_OK'")
    await page.keyboard.press('Enter')
    await expect
      .poll(() => tmux(['capture-pane', '-p', '-t', paneIds[1]]))
      .toContain('CLICK_RIGHT_OK')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await page.screenshot({ path: '/private/tmp/muxyard-panes.png' })
    await page.locator(`.gui-pane[data-pane-id="${paneIds[1]}"] textarea`).press('Control+b')
    await page.keyboard.type('%')
    await expect(page.locator('.gui-pane:visible')).toHaveCount(3)
    tmux(['split-window', '-v', '-t', paneIds[0], '/bin/sh'])
    await expect(page.locator('.gui-pane:visible')).toHaveCount(4)
    await page.getByRole('button', { name: 'Classic terminal', exact: true }).click()
    await expect(page.locator('.terminal-view')).toBeVisible()
    await page.getByRole('button', { name: 'Pane view', exact: true }).click()
    await expect(page.locator('.gui-pane:visible')).toHaveCount(4)
    await page.getByRole('button', { name: 'Detach', exact: true }).click()
    await expect(page.locator('.pane-workspace')).toHaveCount(0)
    await expect.poll(() => tmux(['display-message', '-p', '#{session_attached}']).trim()).toBe('0')
    expect(tmux(['list-sessions'])).toContain('ui-existing')
  } finally {
    await app?.close()
    tmux(['kill-server'])
    await rm(data, { recursive: true, force: true })
  }
})

test('creates and navigates real tmux windows with buttons, shortcuts, panes, and external updates', async () => {
  const data = await mkdtemp(join(tmpdir(), 'muxyard windows-'))
  const socket = `muxyard-windows-${process.pid}-${Date.now()}`
  const tmux = (args: string[]): string =>
    execFileSync('tmux', ['-L', socket, ...args], { encoding: 'utf8' })
  tmux([
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-s',
    'ui-windows',
    '-n',
    'original',
    '-c',
    data,
    '-x',
    '100',
    '-y',
    '30',
    '/bin/sh'
  ])
  tmux(['set-option', '-g', 'default-shell', '/bin/sh'])
  tmux(['new-session', '-d', '-s', 'unrelated', '/bin/sh'])
  const active = (format: string): string =>
    tmux(['display-message', '-p', '-t', 'ui-windows:', format]).trim()
  let app: ElectronApplication | undefined
  try {
    app = await launch(data)
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.getByRole('button', { name: 'Add machine', exact: true }).first().click()
    await page.getByRole('button', { name: 'Local socket' }).click()
    await page.getByLabel('Display name').fill('Window test')
    await page.getByLabel('Tmux socket name').fill(socket)
    await page.getByRole('dialog').getByRole('button', { name: 'Add machine', exact: true }).click()
    await page.locator('.session-card').filter({ hasText: 'ui-windows' }).click()
    await expect(page.locator('.toolbar-status')).toHaveText('Attached')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await page.locator('.gui-pane:visible .gui-pane-header strong').click()
    await page.keyboard.press('Control+t')
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expect.poll(() => active('#{window_index}')).toBe('1')
    await expect(page.locator('.window-tab[aria-selected="true"]')).toContainText('1')
    expect(active('#{pane_current_path}')).toBe(await realpath(data))
    const secondWindow = active('#{window_id}')
    const secondPane = active('#{pane_id}')
    await page.locator(`.gui-pane[data-pane-id="${secondPane}"] .gui-pane-header strong`).click()
    await page.keyboard.type("printf 'WINDOW_%s\\n' 'INPUT_OK'")
    await page.keyboard.press('Enter')
    await expect
      .poll(() => tmux(['capture-pane', '-p', '-t', secondPane]))
      .toContain('WINDOW_INPUT_OK')
    await page.keyboard.press('Meta+d')
    await expect(page.locator('.gui-pane:visible')).toHaveCount(2)
    await page.keyboard.press('Meta+Shift+d')
    await expect(page.locator('.gui-pane:visible')).toHaveCount(3)
    await page.getByRole('tab', { name: 'Window 0: original', exact: true }).click()
    await expect(
      page.getByRole('tab', { name: 'Window 0: original', exact: true })
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.gui-pane:visible')).toHaveCount(1)
    await page.keyboard.press('Control+Tab')
    await expect.poll(() => active('#{window_id}')).toBe(secondWindow)
    await expect(page.locator('.gui-pane:visible')).toHaveCount(3)
    await page.keyboard.press('Control+Shift+Tab')
    await expect(
      page.getByRole('tab', { name: 'Window 0: original', exact: true })
    ).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Meta+t')
    await expect(page.getByRole('tab')).toHaveCount(3)
    await page.getByRole('button', { name: 'New tmux window', exact: true }).click()
    await expect(page.getByRole('tab')).toHaveCount(4)
    await page.locator('.gui-pane:visible textarea').press('Control+b')
    await page.keyboard.type('c')
    await expect(page.getByRole('tab')).toHaveCount(5)
    await page.screenshot({ path: '/private/tmp/muxyard-windows.png' })
    tmux(['new-window', '-t', 'ui-windows:', '-n', 'external-window', '/bin/sh'])
    await expect(page.getByRole('tab')).toHaveCount(6)
    await expect(page.getByRole('tab', { name: /external-window/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const externalWindow = active('#{window_id}')
    tmux(['rename-window', '-t', externalWindow, 'renamed-window'])
    await expect(page.getByRole('tab', { name: /renamed-window/ })).toBeVisible()
    tmux(['kill-window', '-t', externalWindow])
    await expect(page.getByRole('tab')).toHaveCount(5)
    await page.getByRole('button', { name: 'Classic terminal', exact: true }).click()
    await expect(page.locator('.toolbar-status')).toHaveText('Attached')
    await page.locator('.terminal-container textarea').focus()
    await page.keyboard.press('Control+t')
    await expect(page.getByRole('tab')).toHaveCount(6)
    expect(
      tmux(['list-windows', '-t', 'unrelated', '-F', '#{window_id}']).trim().split('\n')
    ).toHaveLength(1)
    await page.getByRole('button', { name: 'Detach', exact: true }).click()
    await expect.poll(() => active('#{session_attached}')).toBe('0')
    expect(
      tmux(['list-windows', '-t', 'ui-windows', '-F', '#{window_id}']).trim().split('\n')
    ).toHaveLength(6)
    expect(errors).toEqual([])
  } finally {
    await app?.close()
    tmux(['kill-server'])
    await rm(data, { recursive: true, force: true })
  }
})

test('SSH import previews aliases without connecting, checks on demand, and imports only selected hosts', async () => {
  const data = await mkdtemp(join(tmpdir(), 'muxyard-import-ui-'))
  let app: ElectronApplication | undefined
  try {
    app = await launch(data)
    await app.evaluate(({ ipcMain }) => {
      const probes: string[] = []
      const discoveries: string[] = []
      Object.assign(globalThis, { muxyardTestProbes: probes, muxyardTestDiscoveries: discoveries })
      for (const channel of ['hosts:candidates', 'hosts:probe', 'hosts:import', 'tmux:discover'])
        ipcMain.removeHandler(channel)
      ipcMain.handle('hosts:candidates', () => [
        { address: 'active-dev', added: false },
        { address: 'old-server', added: false }
      ])
      ipcMain.handle('hosts:probe', (_event, address) => {
        probes.push(address)
        return address === 'active-dev'
          ? { reachable: true, sessions: 2 }
          : { reachable: false, sessions: 0, error: 'Connection timed out' }
      })
      ipcMain.handle('hosts:import', (_event, addresses: string[]) => [
        { id: 'local', kind: 'local', name: 'This Mac', address: '' },
        ...addresses.map((address) => ({ id: address, name: address, kind: 'ssh', address }))
      ])
      ipcMain.handle('tmux:discover', (_event, id) => {
        discoveries.push(id)
        return { sessions: [], checkedAt: Date.now() }
      })
    })
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Import SSH config' }).click()
    await expect(page.getByRole('dialog')).toContainText('Bring in your SSH machines.')
    await expect(page.getByRole('checkbox', { name: 'Import active-dev' })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Import old-server' })).not.toBeChecked()
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { muxyardTestProbes: string[] }).muxyardTestProbes
      )
    ).toEqual([])
    await page.getByRole('button', { name: 'Check & select reachable' }).click()
    await expect(page.getByRole('checkbox', { name: 'Import active-dev' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Import old-server' })).not.toBeChecked()
    await expect(page.getByText('Connection timed out')).toBeVisible()
    await page.screenshot({ path: '/private/tmp/muxyard-import.png' })
    await page.getByRole('button', { name: 'Add 1 selected machine', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.locator('.other-machines summary').click()
    await expect(page.locator('.other-machine-row')).toHaveCount(1)
    await expect(page.locator('.other-machine-row')).toContainText('active-dev')
    expect(
      await app.evaluate(() =>
        (
          globalThis as unknown as { muxyardTestDiscoveries: string[] }
        ).muxyardTestDiscoveries.filter((id) => id !== 'local')
      )
    ).toEqual([])
    await page.locator('.other-machine-row .host-nav').click()
    await expect
      .poll(() =>
        app!.evaluate(() =>
          (
            globalThis as unknown as { muxyardTestDiscoveries: string[] }
          ).muxyardTestDiscoveries.includes('active-dev')
        )
      )
      .toBe(true)
  } finally {
    await app?.close()
    await rm(data, { recursive: true, force: true })
  }
})
