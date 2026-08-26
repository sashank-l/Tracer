import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerAuthHandlers, handleAuthDeepLink } from './ipc/auth'
import { registerRepoHandlers } from './ipc/repos'
import { registerIncidentHandlers } from './ipc/incidents'
import { registerSettingsHandlers } from './ipc/settings'
import { startIngestServer } from './lib/ingestServer'
import { closeDb } from './db/client'

// ── Custom protocol (tracer://) ─────────────────────────────────────────────
// Registers the OS-level association so the system browser can hand back
// the OAuth deep-link after GitHub completes the sign-in flow.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('tracer', process.execPath, [
      join(__dirname, '..', process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient('tracer')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Tracer',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use contextBridge
    },
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Deep-link handler (Windows / Linux) ─────────────────────────────────────
// On macOS, the OS fires 'open-url'. On Windows/Linux, the second app instance
// receives the URL as a command-line argument — we forward it to the first.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // The deep-link URL is the last argument on Windows/Linux
    const url = argv.find((arg) => arg.startsWith('tracer://'))
    if (url && mainWindow) {
      handleAuthDeepLink(url, () => mainWindow)
      mainWindow.webContents.send('deep-link', url)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ── macOS deep-link ──────────────────────────────────────────────────────────
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) {
    handleAuthDeepLink(url, () => mainWindow)
    mainWindow.webContents.send('deep-link', url)
  }
})

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // Register all IPC handlers
  registerAuthHandlers(ipcMain, () => mainWindow)
  registerRepoHandlers(ipcMain)
  registerIncidentHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)

  // Start local HTTP ingestion server (localhost:47821)
  try {
    startIngestServer(47821)
  } catch (err) {
    console.error('[main] Failed to start ingest server:', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async () => {
  await closeDb()
})

export { mainWindow }
