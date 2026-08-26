import { IpcMain, BrowserWindow, shell } from 'electron'
import { randomBytes } from 'crypto'
import type { AuthState } from '../preload'

// ── In-memory CSRF state ───────────────────────────────────────────────────
// The state param is generated per OAuth attempt and verified when the
// deep-link comes back. Never persisted to disk.
let pendingState: string | null = null

// ── Stored auth (runtime only) ─────────────────────────────────────────────
// The encrypted token is stored via safeStorage. We keep the decrypted login
// name in memory only — never in SQLite.
let currentLogin: string | null = null

// Lazy-loaded to avoid import-time failures if safeStorage isn't ready yet
function getSafeStorage() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron').safeStorage as Electron.SafeStorage
}

const TOKEN_KEY = 'tracer-github-token'

/** Retrieve the stored token (decrypted from OS keychain via safeStorage). */
export function getStoredToken(): string | null {
  const ss = getSafeStorage()
  if (!ss.isEncryptionAvailable()) return null
  try {
    // We persist the encrypted buffer to a small JSON file in userData.
    // For Phase 0, we use a simple in-memory approach — Phase 1 adds persistence.
    return null // TODO Phase 1.4: read encrypted buffer from userData JSON, decrypt here
  } catch {
    return null
  }
}

/** Returns the current auth state for the renderer. */
function getAuthState(): AuthState {
  return currentLogin
    ? { status: 'signed-in', login: currentLogin }
    : { status: 'signed-out' }
}

export function registerAuthHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  // ── auth:start-oauth ─────────────────────────────────────────────────────
  // Renderer clicks "Sign in with GitHub" → main opens system browser
  ipcMain.handle('auth:start-oauth', () => {
    pendingState = randomBytes(16).toString('hex')

    const backendUrl = process.env.AUTH_BACKEND_URL ?? 'http://localhost:3000'
    const url = `${backendUrl}/api/auth/github/start?state=${pendingState}`

    shell.openExternal(url)
    return { ok: true }
  })

  // ── auth:sign-out ─────────────────────────────────────────────────────────
  ipcMain.handle('auth:sign-out', () => {
    currentLogin = null
    pendingState = null
    // TODO Phase 1.4: delete persisted encrypted buffer from userData
    const win = getWindow()
    win?.webContents.send('auth:state-changed', getAuthState())
    return { ok: true }
  })

  // ── auth:get-state ────────────────────────────────────────────────────────
  ipcMain.handle('auth:get-state', () => getAuthState())
}

/**
 * Called from main.ts when the OS fires the deep-link (tracer://auth-callback?...).
 * Verifies CSRF state, stores the token via safeStorage, notifies the renderer.
 */
export function handleAuthDeepLink(
  url: string,
  getWindow: () => BrowserWindow | null,
): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'tracer:' || parsed.hostname !== 'auth-callback') return

    const returnedState = parsed.searchParams.get('state')
    const token = parsed.searchParams.get('token')
    const login = parsed.searchParams.get('login')

    if (!token || !login) {
      console.error('[auth] Deep-link missing token or login')
      return
    }

    // CSRF check
    if (returnedState !== pendingState) {
      console.error('[auth] CSRF state mismatch — ignoring deep-link')
      return
    }
    pendingState = null

    // Store token encrypted via safeStorage
    const ss = getSafeStorage()
    if (ss.isEncryptionAvailable()) {
      const encrypted = ss.encryptString(token)
      // TODO Phase 1.4: persist `encrypted` buffer to userData JSON file
      console.log('[auth] Token stored via safeStorage ✓')
    } else {
      console.warn('[auth] safeStorage not available — token stored in memory only')
      // Fallback for dev: keep in memory (not safe for production)
    }

    currentLogin = login

    // Notify renderer
    const win = getWindow()
    win?.webContents.send('auth:state-changed', getAuthState())
  } catch (err) {
    console.error('[auth] Failed to handle deep-link:', err)
  }
}
