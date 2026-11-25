import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, TerminalEvent } from '../shared/types'

const api: DesktopAPI = {
  hosts: {
    list: () => ipcRenderer.invoke('hosts:list'),
    save: (host) => ipcRenderer.invoke('hosts:save', host),
    remove: (id) => ipcRenderer.invoke('hosts:remove', id),
    importSSH: () => ipcRenderer.invoke('hosts:import')
  },
  tmux: {
    discover: (id) => ipcRenderer.invoke('tmux:discover', id),
    action: (id, action) => ipcRenderer.invoke('tmux:action', id, action)
  },
  terminal: {
    open: (request) => ipcRenderer.invoke('terminal:open', request),
    close: (id) => ipcRenderer.invoke('terminal:close', id),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    acknowledge: (id, characters) => ipcRenderer.send('terminal:ack', id, characters),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalEvent): void =>
        listener(payload)
      ipcRenderer.on('terminal:event', handler)
      return () => ipcRenderer.removeListener('terminal:event', handler)
    }
  }
}
contextBridge.exposeInMainWorld('muxyard', api)
