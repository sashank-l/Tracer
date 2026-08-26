import { getDb } from '../../db/client'
import { generateEmbedding } from '../ai'
import { rankBySimilarity } from '../vectorSearch'

export interface VectorSymbolMatch {
  symbolId: string
  name: string
  filePath: string
  kind: string
  signature: string | null
  sourceText: string
  similarity: number
}

/**
 * Search code symbols by semantic vector similarity against the incident error message.
 * Surfaces structurally unlinked utility functions, shared config, or similar bug patterns.
 */
export async function searchSymbolsByVector(
  repoId: string,
  query: string,
  topK: number = 8,
): Promise<VectorSymbolMatch[]> {
  const db = getDb()

  // Generate embedding for the search query (error message + stack snippet)
  const queryEmbedding = await generateEmbedding(query)

  // Fetch all symbols with embeddings for this repository
  const symbols = await db.symbol.findMany({
    where: {
      repositoryId: repoId,
      embedding: { not: null },
    },
    select: {
      id: true,
      name: true,
      filePath: true,
      kind: true,
      signature: true,
      sourceText: true,
      embedding: true,
    },
  })

  if (!symbols.length) return []

  const ranked = rankBySimilarity(symbols, queryEmbedding, topK)

  return ranked.map((r) => ({
    symbolId: r.item.id,
    name: r.item.name,
    filePath: r.item.filePath,
    kind: r.item.kind,
    signature: r.item.signature,
    sourceText: r.item.sourceText,
    similarity: r.similarity,
  }))
}
