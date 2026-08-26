import { PrismaClient } from '@prisma/client'
import { app } from 'electron'
import { join } from 'path'

// Set DATABASE_URL before PrismaClient is instantiated.
// Electron's userData directory is per-install and writable.
const dbPath = join(app.getPath('userData'), 'tracer.db')
process.env.DATABASE_URL = `file:${dbPath}`

let _prisma: PrismaClient | null = null

export function getDb(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    })
  }
  return _prisma
}

/** Gracefully close the DB connection. Call from app.on('will-quit'). */
export async function closeDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect()
    _prisma = null
  }
}
