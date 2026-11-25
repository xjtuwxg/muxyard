import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HostStore, sshAliases } from './hosts'
import { actionArgs, discover, runTmux } from './tmux'
import { Terminals } from './terminals'
import type { Host, TmuxAction } from '../shared/types'

const here = fileURLToPath(new URL('.', import.meta.url))
// Finder does not inherit a user's interactive shell PATH.
process.env.PATH = [
  ...new Set([
    ...(process.env.PATH ?? '').split(':'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin'
  ])
].join(':')
let window: BrowserWindow | null = null
let terminals: Terminals
let hosts: HostStore

function registerIPC(): void {
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Untrusted IPC sender.')
  }
  const handle = (channel: string, fn: (...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      trusted(event)
      return fn(...args)
    })
  }
  handle('hosts:list', () => hosts.list())
  handle('hosts:save', (host: Host) => hosts.save(host))
  handle('hosts:remove', (id: string) => hosts.remove(id))
  handle('hosts:import', async () => {
    for (const alias of await sshAliases()) {
      if (hosts.list().some((host) => host.address === alias)) continue
      await hosts.save({
        id: `ssh-${crypto.randomUUID()}`,
        kind: 'ssh',
        name: alias,
        address: alias
      })
    }
    return hosts.list()
  })
  handle('tmux:discover', (id: string) => discover(hosts.get(id)))
  handle('tmux:action', async (id: string, action: TmuxAction) => {
    const host = hosts.get(id)
    const snapshot = await discover(host)
    const pane = snapshot.sessions
      .find((session) => session.id === action?.sessionId)
      ?.panes.find((pane) => pane.id === action?.paneId)
    if (!pane) throw new Error('This pane no longer exists. Refresh your sessions.')
    await runTmux(host, actionArgs(action, pane))
  })
  handle(
    'terminal:open',
    async (request: {
      id: string
      hostId: string
      sessionId: string
      cols: number
      rows: number
    }) => {
      const owner = window?.webContents
      const host = hosts.get(request.hostId)
      const snapshot = await discover(host)
      if (!owner || owner.isDestroyed() || window?.webContents !== owner)
        throw new Error('The application window closed before attachment completed.')
      if (!snapshot.sessions.some((session) => session.id === request.sessionId))
        throw new Error('This session no longer exists. Refresh your sessions.')
      terminals.open(request.id, host, request.sessionId, request.cols, request.rows)
    }
  )
  handle('terminal:close', (id: string) => terminals.close(id))
  ipcMain.on('terminal:write', (event, id, data) => {
    trusted(event)
    terminals.write(id, data)
  })
  ipcMain.on('terminal:resize', (event, id, cols, rows) => {
    trusted(event)
    terminals.resize(id, cols, rows)
  })
  ipcMain.on('terminal:ack', (event, id, characters) => {
    trusted(event)
    terminals.acknowledge(id, characters)
  })
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1000,
    minHeight: 680,
    title: 'Muxyard',
    backgroundColor: '#101214',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 23 },
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('render-process-gone', () => terminals.closeAll())
  window.on('closed', () => {
    terminals.closeAll()
    window = null
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(here, '../renderer/index.html'))
}

app
  .whenReady()
  .then(async () => {
    if (!app.isPackaged && process.env.MUXYARD_DATA_DIR)
      app.setPath('userData', process.env.MUXYARD_DATA_DIR)
    hosts = new HostStore(join(app.getPath('userData'), 'hosts.json'))
    try {
      await hosts.load()
    } catch (error) {
      console.error('Could not load saved hosts:', error)
    }
    terminals = new Terminals((event) => {
      if (window && !window.isDestroyed()) window.webContents.send('terminal:event', event)
    })
    registerIPC()
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { role: 'togglefullscreen' }
          ]
        },
        { role: 'windowMenu' }
      ])
    )
    await createWindow()
    app.on('activate', () => {
      if (!window) void createWindow()
    })
  })
  .catch((error) => {
    console.error(error)
    app.quit()
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => terminals?.closeAll())
