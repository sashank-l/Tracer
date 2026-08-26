import { contextBridge, ipcRenderer } from 'electron'

// ── Typed IPC bridge ─────────────────────────────────────────────────────────
// This is the ONLY surface the renderer can use to talk to the main process.
// contextIsolation: true + nodeIntegration: false keeps the renderer sandboxed.

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; login: string }

const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    /** Open system browser to start GitHub OAuth flow */
    startOAuth: () => ipcRenderer.invoke('auth:start-oauth'),
    /** Sign out — clears stored token */
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    /** Get current auth state synchronously */
    getState: (): Promise<AuthState> => ipcRenderer.invoke('auth:get-state'),
    /** Listen for auth state changes (e.g. after deep-link completes) */
    onStateChange: (cb: (state: AuthState) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: AuthState) => cb(state)
      ipcRenderer.on('auth:state-changed', listener)
      return () => {
        ipcRenderer.removeListener('auth:state-changed', listener)
      }
    },
  },

  // ── Repositories ─────────────────────────────────────────────────────────
  repos: {
    /** Open folder picker dialog and add a local repo */
    add: () => ipcRenderer.invoke('repos:add'),
    /** List all connected repos */
    list: (): Promise<import('./db/schema').Repository[]> =>
      ipcRenderer.invoke('repos:list'),
    /** Trigger indexing for a repo */
    index: (repoId: string) => ipcRenderer.invoke('repos:index', repoId),
    /** Listen for indexing progress updates */
    onIndexProgress: (
      cb: (data: { repoId: string; progress: number; status: string }) => void,
    ) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        data: { repoId: string; progress: number; status: string },
      ) => cb(data)
      ipcRenderer.on('repos:index-progress', listener)
      return () => {
        ipcRenderer.removeListener('repos:index-progress', listener)
      }
    },
  },

  // ── Incidents ─────────────────────────────────────────────────────────────
  incidents: {
    list: (repoId?: string): Promise<import('./db/schema').Incident[]> =>
      ipcRenderer.invoke('incidents:list', repoId),
    get: (id: string): Promise<any> =>
      ipcRenderer.invoke('incidents:get', id),
    diagnose: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('incidents:diagnose', id),
    onNewIncident: (cb: (incident: import('./db/schema').Incident) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, incident: any) => cb(incident)
      ipcRenderer.on('incident:new', listener)
      return () => {
        ipcRenderer.removeListener('incident:new', listener)
      }
    },
    onHarnessProgress: (
      cb: (data: { incidentId: string; message: string }) => void,
    ) => {
      const listener = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
      ipcRenderer.on('harness:progress', listener)
      return () => {
        ipcRenderer.removeListener('harness:progress', listener)
      }
    },
    onHarnessComplete: (
      cb: (data: { incidentId: string; result: any }) => void,
    ) => {
      const listener = (_e: Electron.IpcRendererEvent, data: any) => cb(data)
      ipcRenderer.on('harness:complete', listener)
      return () => {
        ipcRenderer.removeListener('harness:complete', listener)
      }
    },
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get: (): Promise<import('./db/schema').AppSettings> =>
      ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<import('./db/schema').AppSettings>) =>
      ipcRenderer.invoke('settings:update', patch),
  },
}

contextBridge.exposeInMainWorld('tracer', api)

export type TracerAPI = typeof api
