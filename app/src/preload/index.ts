import { contextBridge, ipcRenderer } from 'electron'
import {
  type ApiEnvelope,
  type ApiResult,
  type BackendStatus,
  type HttpMethod,
  IPC,
  type SignInEnvelope,
  type VoltBridge
} from '@shared/bridge'
import type { Job } from '@shared/models'

const bridge: VoltBridge = {
  async api<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResult<T>> {
    const envelope = (await ipcRenderer.invoke(IPC.api, { method, path, body })) as ApiEnvelope
    if (!envelope.ok) {
      // The HTTP status travels with the error, so the renderer can tell a 422 from a 500.
      const error = new Error(envelope.message) as Error & { status: number }
      error.status = envelope.status
      throw error
    }
    return envelope.result as ApiResult<T>
  },
  backendStatus: () => ipcRenderer.invoke(IPC.backendStatus) as Promise<BackendStatus>,
  onBackendStatus(callback) {
    const listener = (_event: Electron.IpcRendererEvent, status: BackendStatus): void => callback(status)
    ipcRenderer.on(IPC.backendStatusEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC.backendStatusEvent, listener)
    }
  },
  restartBackend: () => ipcRenderer.invoke(IPC.restartBackend) as Promise<void>,
  platform: process.platform,
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path) as Promise<string>,
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory) as Promise<string | null>,
  async signIn(): Promise<Job | null> {
    const envelope = (await ipcRenderer.invoke(IPC.signIn)) as SignInEnvelope
    if (!envelope.ok) throw new Error(envelope.message)
    return envelope.job
  },
  hideWindow: () => ipcRenderer.invoke(IPC.hideWindow) as Promise<void>,
  showWindow: () => ipcRenderer.invoke(IPC.showWindow) as Promise<void>,
  minimize: () => ipcRenderer.invoke(IPC.minimize) as Promise<void>,
  maximize: () => ipcRenderer.invoke(IPC.maximize) as Promise<void>,
  close: () => ipcRenderer.invoke(IPC.close) as Promise<void>,
  isMaximized: () => ipcRenderer.invoke(IPC.isMaximized) as Promise<boolean>,
  onMaximizedChange(callback) {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on(IPC.maximizedChangedEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC.maximizedChangedEvent, listener)
    }
  }
}

contextBridge.exposeInMainWorld('volt', bridge)
