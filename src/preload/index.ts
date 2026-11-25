import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, TerminalEvent, PaneEvent } from '../shared/types'

const api: DesktopAPI = {
  hosts: {
    list: () => ipcRenderer.invoke('hosts:list'),
    save: (host) => ipcRenderer.invoke('hosts:save', host),
    remove: (id) => ipcRenderer.invoke('hosts:remove', id),
    candidates: () => ipcRenderer.invoke('hosts:candidates'),
    probe: (address) => ipcRenderer.invoke('hosts:probe', address),
    importSSH: (addresses) => ipcRenderer.invoke('hosts:import', addresses)
  },
  tmux: {
    discover: (id) => ipcRenderer.invoke('tmux:discover', id),
    action: (id, action) => ipcRenderer.invoke('tmux:action', id, action)
  },
  panes: {
    open: (request) => ipcRenderer.invoke('panes:open', request),
    capture: (id, paneId) => ipcRenderer.invoke('panes:capture', id, paneId),
    input: (id, paneId, data) => ipcRenderer.invoke('panes:input', id, paneId, data),
    select: (id, paneId) => ipcRenderer.invoke('panes:select', id, paneId),
    action: (id, action) => ipcRenderer.invoke('panes:action', id, action),
    resize: (id, cols, rows) => ipcRenderer.invoke('panes:resize', id, cols, rows),
    close: (id) => ipcRenderer.invoke('panes:close', id),
    acknowledge: (id, bytes) => ipcRenderer.send('panes:ack', id, bytes),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: PaneEvent): void =>
        listener(payload)
      ipcRenderer.on('panes:event', handler)
      return () => ipcRenderer.removeListener('panes:event', handler)
    }
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
