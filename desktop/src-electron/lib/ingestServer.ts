import { createServer, IncomingMessage, ServerResponse } from 'http'
import { createHash } from 'crypto'
import { getDb } from '../db/client'
import { mainWindow } from '../main'

export interface IngestPayload {
  message: string
  stackTrace?: string
  title?: string
  level?: string
  timestamp?: string
  repoId?: string
  apiKey?: string
}

/**
 * Generate a deterministic hash fingerprint from a stack trace or error message.
 * Normalizes line numbers and memory addresses so identical bugs group together.
 */
export function computeFingerprint(message: string, stackTrace?: string): string {
  const raw = (stackTrace || message)
    .replace(/:\d+:\d+/g, '') // remove line and col numbers
    .replace(/0x[0-9a-fA-F]+/g, '') // remove memory addresses
    .trim()

  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/**
 * Ingest an error payload into SQLite, updating existing incident or creating a new one.
 */
export async function processIngestPayload(payload: IngestPayload) {
  const db = getDb()

  // Find target repository either by apiKey or repoId or fallback to the latest repo
  let repo = null
  if (payload.apiKey) {
    repo = await db.repository.findUnique({ where: { apiKey: payload.apiKey } })
  } else if (payload.repoId) {
    repo = await db.repository.findUnique({ where: { id: payload.repoId } })
  }

  if (!repo) {
    repo = await db.repository.findFirst({ orderBy: { createdAt: 'desc' } })
  }

  if (!repo) {
    throw new Error('No repository configured in Tracer to associate this error with.')
  }

  const fingerprint = computeFingerprint(payload.message, payload.stackTrace)
  const title = payload.title || payload.message.slice(0, 100)

  const incident = await db.incident.upsert({
    where: {
      repositoryId_fingerprint: {
        repositoryId: repo.id,
        fingerprint,
      },
    },
    create: {
      repositoryId: repo.id,
      fingerprint,
      title,
      message: payload.message,
      stackTrace: payload.stackTrace,
      status: 'NEW',
      occurrenceCount: 1,
    },
    update: {
      lastSeenAt: new Date(),
      occurrenceCount: { increment: 1 },
      message: payload.message,
      stackTrace: payload.stackTrace || undefined,
    },
  })

  // Notify renderer window via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('incident:new', incident)
  }

  return incident
}

/**
 * Start the local HTTP ingestion server on localhost:47821.
 */
export function startIngestServer(port: number = 47821) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Enable CORS for local testing from browser apps
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.method === 'POST' && (req.url === '/ingest' || req.url === '/api/ingest')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })

      req.on('end', async () => {
        try {
          const payload = JSON.parse(body) as IngestPayload
          const apiKeyHeader = req.headers['x-api-key']
          if (typeof apiKeyHeader === 'string') {
            payload.apiKey = apiKeyHeader
          }

          const incident = await processIngestPayload(payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, incidentId: incident.id }))
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: err.message || String(err) }))
        }
      })
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not Found' }))
    }
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`[ingest] Tracer local ingestion server listening on http://localhost:${port}/ingest`)
  })

  return server
}
