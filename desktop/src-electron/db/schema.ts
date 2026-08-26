// ── Prisma schema types mirrored here for preload usage ───────────────────────
// These mirror the Prisma-generated types so the preload can reference them
// without importing from @prisma/client (which can't run in preload context).

export type CloneStatus = 'PENDING' | 'CLONING' | 'INDEXED' | 'ERROR'
export type IncidentStatus =
  | 'NEW'
  | 'DIAGNOSING'
  | 'PATCHING'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNVERIFIED'

export interface Repository {
  id: string
  githubId: bigint | null
  owner: string
  name: string
  defaultBranch: string
  localPath: string | null
  apiKey: string
  cloneStatus: CloneStatus
  testCommand: string | null
  buildCommand: string | null
  lintCommand: string | null
  indexedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Incident {
  id: string
  repositoryId: string
  fingerprint: string
  title: string
  message: string | null
  stackTrace: string | null
  status: IncidentStatus
  firstSeenAt: Date
  lastSeenAt: Date
  occurrenceCount: number
  createdAt: Date
  updatedAt: Date
}

export interface AppSettings {
  id: string
  maxToolCalls: number
  reposDir: string | null
  llmProvider: string
  llmModel: string
  createdAt: Date
  updatedAt: Date
}
