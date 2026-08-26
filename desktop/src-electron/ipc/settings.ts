import { IpcMain } from 'electron'
import { getDb } from '../db/client'

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  // ── settings:get ──────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', async () => {
    const db = getDb()
    return db.appSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        maxToolCalls: 25,
        llmProvider: 'openai',
        llmModel: 'gpt-4o-mini',
      },
      update: {},
    })
  })

  // ── settings:update ───────────────────────────────────────────────────────
  ipcMain.handle('settings:update', async (_event, patch: any) => {
    const db = getDb()
    return db.appSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        ...patch,
      },
      update: patch,
    })
  })
}
