const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  await window.loadFile(join(__dirname, '../assets/icon.svg'))
})

app.on('window-all-closed', () => app.quit())
