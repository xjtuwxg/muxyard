import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
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
    await page.locator('.terminal-container textarea').fill("printf 'MUXYARD_%s\\n' 'UI_OK'")
    await page.locator('.terminal-container textarea').press('Enter')
    await expect.poll(() => tmux(['capture-pane', '-p'])).toContain('MUXYARD_UI_OK')
    await page.getByRole('button', { name: 'Split', exact: true }).click()
    await expect(page.locator('.pane-button')).toHaveCount(2)
    await page.getByRole('button', { name: 'Detach', exact: true }).click()
    await expect(page.locator('.terminal-view')).toHaveCount(0)
    await expect.poll(() => tmux(['display-message', '-p', '#{session_attached}']).trim()).toBe('0')
    expect(tmux(['list-sessions'])).toContain('ui-existing')
  } finally {
    await app?.close()
    tmux(['kill-server'])
    await rm(data, { recursive: true, force: true })
  }
})
