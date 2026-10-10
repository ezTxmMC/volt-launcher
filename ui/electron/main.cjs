const { app, BrowserWindow, shell, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const process = require('process');

app.setName('VoltLauncher');

let mainWindow;

const DEFAULT_BOUNDS = { width: 1280, height: 720 };
const MIN_WIDTH = 940;
const MIN_HEIGHT = 600;

const windowStateFile = () => path.join(app.getPath('userData'), 'window-state.json');

/**
 * Restores the window to where it was left.
 *
 * A saved position is only reused when it still lands on a display that exists — unplugging a
 * second monitor would otherwise reopen the launcher off-screen, with no way to drag it back.
 */
function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
    const bounds = {
      width: Math.max(MIN_WIDTH, saved.width || DEFAULT_BOUNDS.width),
      height: Math.max(MIN_HEIGHT, saved.height || DEFAULT_BOUNDS.height),
      maximized: Boolean(saved.maximized)
    };

    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return (
          saved.x + saved.width > area.x &&
          saved.y + saved.height > area.y &&
          saved.x < area.x + area.width &&
          saved.y < area.y + area.height
        );
      });
      if (visible) {
        bounds.x = saved.x;
        bounds.y = saved.y;
      }
    }
    return bounds;
  } catch {
    // No saved state yet, or a file we cannot read: open at the default size.
    return { ...DEFAULT_BOUNDS, maximized: false };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    // getNormalBounds reports the restored geometry, so maximising does not overwrite the size
    // the window should return to.
    const bounds = mainWindow.getNormalBounds();
    fs.writeFileSync(
      windowStateFile(),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
      'utf8'
    );
  } catch {
    // Persisting the geometry is a convenience; failing to write it must not break shutdown.
  }
}

/** Coalesces the flood of resize and move events into one write. */
let saveTimer = null;
function scheduleWindowStateSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWindowState, 400);
}

function createWindow() {
  const state = readWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    // Windows and macOS take the icon from the packaged binary; on Linux the
    // window and taskbar entry only get one when it is set here.
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#030912',
    show: false
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.on('close', saveWindowState);

  const environment = process.env.NODE_ENV || 'production';
  const loadURL = process.env.VITE_DEV_SERVER_URL;

  if (environment === 'development' && loadURL) {
    mainWindow.loadURL(loadURL);
    // mainWindow.webContents.openDevTools();
  } else {
    // Falls die App prod gepackt wird, load via file
    // Ansonsten lädt main.ts die localhost:7070 - hier rufen wir einfach das auf,
    // was Vite baut, oder greifen direkt auf die lokalen Vue dateien zu.
    // Eigentlich wird Vue über den java server localhost:7070 gehostet? Nein wir bauen es nun rein.
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle links like normal browsers do
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://login.live.com') || url.startsWith('https://login.microsoftonline.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  app.on('web-contents-created', (e, contents) => {
    if (contents.getType() === 'window') {
      const handleRedirect = (event, url) => {
        if (url.startsWith('https://login.live.com/oauth20_desktop.srf')) {
          event.preventDefault();
          // Extract query string
          const urlObj = new URL(url);
          const state = urlObj.searchParams.get('state');
          const code = urlObj.searchParams.get('code');
          const err = urlObj.searchParams.get('error');
          const errorDesc = urlObj.searchParams.get('error_description');

          // Send callback to Java backend
          fetch('http://localhost:45938/api/auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: state,
              code: code,
              error: err ? (errorDesc || err) : null
            })
          }).then(() => {
            const win = BrowserWindow.fromWebContents(contents);
            if (win) win.close();
          }).catch(() => {
            const win = BrowserWindow.fromWebContents(contents);
            if (win) win.close();
          });
        }
      };

      contents.on('will-navigate', handleRedirect);
      contents.on('will-redirect', handleRedirect);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', saveWindowState);

app.on('window-all-closed', () => {
  app.quit();
});
