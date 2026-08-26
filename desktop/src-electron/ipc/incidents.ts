import { IpcMain } from 'electron'
import { getDb } from '../db/client'
import { runAgentHarness } from '../worker/harness'

export function registerIncidentHandlers(ipcMain: IpcMain): void {
  // ── incidents:list ────────────────────────────────────────────────────────
  ipcMain.handle('incidents:list', async (_event, repoId?: string) => {
    const db = getDb()
    if (repoId) {
      return db.incident.findMany({
        where: { repositoryId: repoId },
        orderBy: { lastSeenAt: 'desc' },
        include: { repository: true, sessions: true },
      })
    }
    return db.incident.findMany({
      orderBy: { lastSeenAt: 'desc' },
      include: { repository: true, sessions: true },
    })
  })

  // ── incidents:get ─────────────────────────────────────────────────────────
  ipcMain.handle('incidents:get', async (_event, id: string) => {
    const db = getDb()
    return db.incident.findUnique({
      where: { id },
      include: {
        repository: true,
        sessions: { orderBy: { createdAt: 'desc' } },
        patchAttempts: true,
      },
    })
  })

  // ── incidents:diagnose ────────────────────────────────────────────────────
  ipcMain.handle('incidents:diagnose', async (event, incidentId: string) => {
    const db = getDb()
    await db.incident.update({
      where: { id: incidentId },
      data: { status: 'DIAGNOSING' },
    })

    // Run harness in background
    runAgentHarness(incidentId, (progressMsg) => {
      event.sender.send('harness:progress', { incidentId, message: progressMsg })
    })
      .then((result) => {
        event.sender.send('harness:complete', { incidentId, result })
      })
      .catch((err) => {
        event.sender.send('harness:error', { incidentId, error: String(err) })
      })

    return { ok: true }
  })
}
