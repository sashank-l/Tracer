import { IpcMain, dialog } from 'electron'
import { getDb } from '../db/client'
import { randomUUID } from 'crypto'
import simpleGit from 'simple-git'
import { join } from 'path'

export function registerRepoHandlers(ipcMain: IpcMain): void {
  // ── repos:list ────────────────────────────────────────────────────────────
  ipcMain.handle('repos:list', async () => {
    const db = getDb()
    return db.repository.findMany({ orderBy: { createdAt: 'desc' } })
  })

  // ── repos:add ─────────────────────────────────────────────────────────────
  ipcMain.handle('repos:add', async (_event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Repository Folder',
      properties: ['openDirectory'],
    })
    if (canceled || !filePaths[0]) return { ok: false, reason: 'canceled' }

    const localPath = filePaths[0]
    const db = getDb()

    // Read git remote to get owner/name
    const git = simpleGit(localPath)
    let owner = 'unknown'
    let name = localPath.split(/[\\/]/).pop() ?? 'repo'

    try {
      const remotes = await git.getRemotes(true)
      const origin = remotes.find((r) => r.name === 'origin')
      if (origin?.refs?.fetch) {
        const match = origin.refs.fetch.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
        if (match) {
          owner = match[1]
          name = match[2]
        }
      }
    } catch {
      // Not a git repo or no remote — that's fine, we still index it
    }

    let defaultBranch = 'main'
    try {
      const branchResult = await git.revparse(['--abbrev-ref', 'HEAD'])
      defaultBranch = branchResult.trim()
    } catch { /* ignore */ }

    // Check if already added
    const existing = await db.repository.findUnique({ where: { owner_name: { owner, name } } })
    if (existing) return { ok: false, reason: 'already-added', repo: existing }

    const repo = await db.repository.create({
      data: {
        owner,
        name,
        defaultBranch,
        localPath,
        apiKey: randomUUID(),
        cloneStatus: 'PENDING',
      },
    })

    return { ok: true, repo }
  })

  // ── repos:index ───────────────────────────────────────────────────────────
  // Triggers the indexing pipeline for a repo. The actual heavy lifting is
  // in src-electron/worker/indexer.ts — this just kicks it off.
  ipcMain.handle('repos:index', async (event, repoId: string) => {
    const db = getDb()
    const repo = await db.repository.findUnique({ where: { id: repoId } })
    if (!repo || !repo.localPath) return { ok: false, reason: 'not-found' }

    // Update status
    await db.repository.update({
      where: { id: repoId },
      data: { cloneStatus: 'CLONING' },
    })

    // Kick off indexer in background (non-blocking)
    // The indexer sends progress via IPC: repos:index-progress
    import('../worker/indexer').then(({ runIndexer }) =>
      runIndexer(repoId, repo.localPath!, (progress, status) => {
        event.sender.send('repos:index-progress', { repoId, progress, status })
      }),
    )

    return { ok: true }
  })
}
