import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const data = await mkdtemp(join(tmpdir(), 'muxyard-site-shots-'))
const destination = join(root, 'website/assets/screenshots')
const socket = `muxyard-site-${process.pid}-${Date.now()}`
const env = { ...process.env, MUXYARD_DATA_DIR: data }
delete env.ELECTRON_RUN_AS_NODE
const tmux = (args) => execFileSync('tmux', ['-L', socket, ...args], { encoding: 'utf8' }).trim()
let app
try {
  await mkdir(destination, { recursive: true })
  app = await electron.launch({ args: [join(root, 'out/main/index.js')], env })
  if (
    (await realpath(await app.evaluate(({ app }) => app.getPath('userData')))) !==
    (await realpath(data))
  )
    throw new Error('Screenshot capture requires isolated app data.')
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Explore demo', exact: true }).first().click()
  for (const name of ['Daylight', 'Paper', 'Graphite', 'Dusk', 'Grove']) {
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.getByRole('radio', { name, exact: true }).click()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.screenshot({
      path: join(destination, `overview-${name.toLowerCase()}.png`),
      scale: 'css',
      animations: 'disabled'
    })
  }
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click()
  tmux([
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-s',
    'muxyard',
    '-n',
    'workspace',
    '-c',
    root,
    '/bin/sh'
  ])
  const left = tmux(['display-message', '-p', '-t', 'muxyard:', '#{pane_id}'])
  const top = tmux([
    'split-window',
    '-h',
    '-t',
    left,
    '-P',
    '-F',
    '#{pane_id}',
    '-c',
    root,
    '/bin/sh'
  ])
  const bottom = tmux([
    'split-window',
    '-v',
    '-t',
    top,
    '-P',
    '-F',
    '#{pane_id}',
    '-c',
    root,
    '/bin/sh'
  ])
  tmux([
    'send-keys',
    '-t',
    left,
    "printf '\\033[2J\\033[HLOCAL TMUX WORKSPACE\\n\\n'; git log -5 --oneline; printf '\\nYour existing sessions, in one place.\\n'",
    'Enter'
  ])
  tmux(['send-keys', '-t', top, 'npm test', 'Enter'])
  tmux([
    'send-keys',
    '-t',
    bottom,
    "printf '\\033[2J\\033[HMUXYARD / LOCAL DEMONSTRATION\\n\\n'; tmux display-message -p '#{session_name}: #{window_name}'; printf '\\nCtrl+T       New window\\nCtrl+Tab     Switch windows\\nCtrl+B %%     Split panes\\n\\nOpenSSH + tmux. No remote daemon.\\n'",
    'Enter'
  ])
  await page.getByRole('button', { name: 'Add machine', exact: true }).first().click()
  await page.getByRole('button', { name: 'Local socket' }).click()
  await page.getByLabel('Display name').fill('Local demonstration')
  await page.getByLabel('Tmux socket name').fill(socket)
  await page.getByRole('dialog').getByRole('button', { name: 'Add machine', exact: true }).click()
  await page.locator('.session-card').filter({ hasText: 'muxyard' }).click()
  await page.locator('.toolbar-status').filter({ hasText: 'Attached' }).waitFor()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('radio', { name: 'Graphite', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click()
  await page.locator('.gui-pane:visible').first().waitFor()
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.gui-pane:not([style*="display: none"]) .xterm-rows').length === 3
  )
  await page.locator('.gui-pane:visible .xterm-rows').filter({ hasText: 'tests' }).first().waitFor()
  await page.screenshot({
    path: join(destination, 'focus.png'),
    scale: 'css',
    animations: 'disabled'
  })
  // Render the social card from the same outlined vectors used by the app and site.
  const logo = await readFile(join(root, 'assets/brand/wordmark.svg'), 'utf8')
  const mark = await readFile(join(root, 'assets/brand/mark.svg'), 'utf8')
  const social = join(data, 'social.html')
  const font = new URL('file://' + join(root, 'website/fonts/InterVariable.woff2')).href
  await writeFile(
    social,
    `<!doctype html><style>@font-face{font-family:Inter;src:url('${font}')}*{box-sizing:border-box}body{width:1200px;height:630px;margin:0;background:#f4f7ff;color:#17263d;font-family:Inter,Arial;padding:65px 75px;position:relative;overflow:hidden}header svg{width:220px;height:55px}h1{font-size:84px;font-weight:650;letter-spacing:-4.2px;word-spacing:3px;line-height:1.04;margin:55px 0 25px}h1 span{color:#245bd7}p{font-size:23px;line-height:1.7;color:#526986}.mark{position:absolute;right:75px;top:165px;width:270px;height:270px;background:#e5edff;border:1px solid #cfddf6;border-radius:65px;display:grid;place-items:center}.mark svg{width:185px;height:185px}footer{font-size:16px;color:#61789b;margin-top:35px}</style><header>${logo}</header><h1>Your tmux.<br><span>A better view.</span></h1><p>The sessions you already have.<br>The agents you already run.</p><div class="mark">${mark}</div><footer>A desktop GUI for existing tmux sessions · Local or SSH</footer>`
  )
  const opened = app.waitForEvent('window')
  await app.evaluate(async ({ BrowserWindow }, path) => {
    const window = new BrowserWindow({
      width: 1200,
      height: 630,
      useContentSize: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await window.loadFile(path)
  }, social)
  const socialPage = await opened
  await socialPage.setViewportSize({ width: 1200, height: 630 })
  await socialPage.evaluate(() => document.fonts.ready)
  await socialPage.screenshot({
    path: join(root, 'website/assets/social.png'),
    scale: 'css',
    animations: 'disabled'
  })
  console.log(
    'Captured five source-preview themes, a real local tmux demonstration, and the social card.'
  )
} finally {
  await app?.close()
  try {
    tmux(['kill-server'])
  } catch {}
  await rm(data, { recursive: true, force: true })
}
