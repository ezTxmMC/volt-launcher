import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { type ApiEnvelope, HTTP_METHODS, type HttpMethod, IPC, type SignInEnvelope } from '@shared/bridge'
import { ApiRequestError, BackendManager } from './backend'
import { signInWithMicrosoft } from './signin'

const backend = new BackendManager()
let mainWindow: BrowserWindow | null = null

function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && (HTTP_METHODS as readonly string[]).includes(value)
}

function registerIpc(): void {
  ipcMain.handle(IPC.api, async (_event, request: unknown): Promise<ApiEnvelope> => {
    const { method, path, body } = (request ?? {}) as { method?: unknown; path?: unknown; body?: unknown }
    if (!isHttpMethod(method) || typeof path !== 'string' || !path.startsWith('/api/')) {
      return { ok: false, status: 400, message: 'Invalid API request.' }
    }
    try {
      return { ok: true, result: await backend.request(method, path, body) }
    } catch (error) {
      if (error instanceof ApiRequestError) return { ok: false, status: error.status, message: error.message }
      return { ok: false, status: 0, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.signIn, (): Promise<SignInEnvelope> => signInWithMicrosoft(backend, mainWindow))

  // A game that runs hides the launcher; the renderer shows it again when the game exits.
  ipcMain.handle(IPC.hideWindow, () => {
    mainWindow?.hide()
  })
  ipcMain.handle(IPC.showWindow, () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  // Window buttons of the frameless window (top bar).
  ipcMain.handle(IPC.minimize, () => {
    mainWindow?.minimize()
  })
  ipcMain.handle(IPC.maximize, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.close, () => {
    mainWindow?.close()
  })
  ipcMain.handle(IPC.isMaximized, () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle(IPC.backendStatus, () => backend.getStatus())
  ipcMain.handle(IPC.restartBackend, () => {
    void backend.restart()
  })

  ipcMain.handle(IPC.openPath, async (_event, path: unknown): Promise<string> => {
    if (typeof path !== 'string' || path.length === 0) return 'Invalid path.'
    return shell.openPath(path)
  })

  ipcMain.handle(IPC.pickDirectory, async (): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  backend.onChange((status) => {
    mainWindow?.webContents.send(IPC.backendStatusEvent, status)
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    // Frameless: the renderer's top bar is the title bar and holds the window buttons. The OS
    // shadow stays on (Windows and macOS drop it with a frameless window unless asked).
    frame: false,
    hasShadow: true,
    autoHideMenuBar: true,
    backgroundColor: '#0d1014',
    title: 'Volt Launcher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A hidden launcher keeps polling the game status; throttled timers would delay showing it again.
      backgroundThrottling: false
    }
  })
  mainWindow = window
  window.setMenu(null)
  window.once('ready-to-show', () => window.show())
  // Maximise state drives the maximise/restore icon of the top bar.
  const sendMaximized = (): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.maximizedChangedEvent, window.isMaximized())
  }
  window.on('maximize', sendMaximized)
  window.on('unmaximize', sendMaximized)
  window.on('closed', () => {
    mainWindow = null
  })

  // Links in rendered content open in the system browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const internal = rendererUrl ? url.startsWith(rendererUrl) : url.startsWith('file://')
    if (!internal) {
      event.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    void backend.start()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    backend.killNow()
  })
}
