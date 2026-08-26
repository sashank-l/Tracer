import { getDb } from '../../db/client'

export interface GraphNeighbor {
  symbolId: string
  name: string
  filePath: string
  kind: string
  signature: string | null
  sourceText: string
  relationship: 'caller' | 'callee' | 'reference'
  hop: number
}

/**
 * Traverse call graph and reference edges outward from anchored symbols (1-2 hops).
 * Catches upstream bad argument passing and related identifier dependencies.
 */
export async function traverseCallGraph(
  seedSymbolIds: string[],
  maxHops: number = 2,
  limitPerSeed: number = 10,
): Promise<GraphNeighbor[]> {
  if (!seedSymbolIds.length) return []

  const db = getDb()
  const visited = new Set<string>(seedSymbolIds)
  const neighbors: GraphNeighbor[] = []

  let currentLevelIds = [...seedSymbolIds]

  for (let hop = 1; hop <= maxHops; hop++) {
    if (!currentLevelIds.length) break

    // Find outgoing edges (symbols called or referenced by current level)
    const outgoing = await db.symbolEdge.findMany({
      where: { fromSymbolId: { in: currentLevelIds } },
      include: { to: true },
      take: limitPerSeed * currentLevelIds.length,
    })

    // Find incoming edges (symbols that call or reference current level)
    const incoming = await db.symbolEdge.findMany({
      where: { toSymbolId: { in: currentLevelIds } },
      include: { from: true },
      take: limitPerSeed * currentLevelIds.length,
    })

    const nextLevelIds: string[] = []

    for (const edge of outgoing) {
      if (!visited.has(edge.toSymbolId) && edge.to) {
        visited.add(edge.toSymbolId)
        nextLevelIds.push(edge.toSymbolId)
        neighbors.push({
          symbolId: edge.to.id,
          name: edge.to.name,
          filePath: edge.to.filePath,
          kind: edge.to.kind,
          signature: edge.to.signature,
          sourceText: edge.to.sourceText,
          relationship: edge.edgeType === 'calls' ? 'callee' : 'reference',
          hop,
        })
      }
    }

    for (const edge of incoming) {
      if (!visited.has(edge.fromSymbolId) && edge.from) {
        visited.add(edge.fromSymbolId)
        nextLevelIds.push(edge.fromSymbolId)
        neighbors.push({
          symbolId: edge.from.id,
          name: edge.from.name,
          filePath: edge.from.filePath,
          kind: edge.from.kind,
          signature: edge.from.signature,
          sourceText: edge.from.sourceText,
          relationship: edge.edgeType === 'calls' ? 'caller' : 'reference',
          hop,
        })
      }
    }

    currentLevelIds = nextLevelIds
  }

  return neighbors
}
