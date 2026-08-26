import { anchorFromStackTrace, AnchoredSymbol } from './anchor'
import { traverseCallGraph, GraphNeighbor } from './callgraph'
import { searchSymbolsByVector, VectorSymbolMatch } from './vector'
import { correlateGitHistory, CorrelatedCommit } from './githistory'

export interface AssembledRetrievalContext {
  signatureMapPrompt: string
  anchoredSymbols: AnchoredSymbol[]
  graphNeighbors: GraphNeighbor[]
  vectorMatches: VectorSymbolMatch[]
  recentCommits: CorrelatedCommit[]
  implicatedFiles: string[]
  candidateSymbolIds: string[]
}

/**
 * Two-tier context assembler:
 * Tier 1: Compact signature-level summary per candidate (symbols, callers, commits)
 * Tier 2: Full source code delivered on-demand via agent tools (read_symbol, read_file)
 */
export async function assembleRetrievalContext(
  repoId: string,
  errorMessage: string,
  stackTrace?: string,
): Promise<AssembledRetrievalContext> {
  // 1. Layer 1: Stack Trace Anchoring
  const anchoredSymbols = await anchorFromStackTrace(repoId, stackTrace)
  const anchoredIds = anchoredSymbols.map((s) => s.symbolId)

  // Implicated files collected so far
  const fileSet = new Set<string>(anchoredSymbols.map((s) => s.filePath))

  // 2. Layer 2: Call Graph Traversal (1-2 hops outward)
  const graphNeighbors = await traverseCallGraph(anchoredIds, 2, 8)
  for (const g of graphNeighbors) {
    fileSet.add(g.filePath)
  }

  // 3. Layer 3: Vector Similarity Search
  const query = `${errorMessage}\n${stackTrace ? stackTrace.slice(0, 500) : ''}`
  const vectorMatches = await searchSymbolsByVector(repoId, query, 6)
  for (const v of vectorMatches) {
    fileSet.add(v.filePath)
  }

  // 4. Layer 4: Git History Correlation
  const implicatedFiles = Array.from(fileSet)
  const recentCommits = await correlateGitHistory(repoId, implicatedFiles, 4)

  // 5. Build Tier 1 Signature Map Prompt
  const sections: string[] = []

  // Section 1: Anchored
  if (anchoredSymbols.length > 0) {
    sections.push('### [ANCHORED SYMBOLS (from stack trace)]')
    for (const s of anchoredSymbols) {
      sections.push(
        `- Symbol [ID: ${s.symbolId}] \`${s.name}\` (${s.kind}) in \`${s.filePath}:${s.startLine}-${s.endLine}\`\n  Signature: ${s.signature || s.name}`,
      )
    }
  }

  // Section 2: Call Graph & References
  if (graphNeighbors.length > 0) {
    sections.push('\n### [CALLERS & REFERENCED SYMBOLS]')
    for (const g of graphNeighbors) {
      sections.push(
        `- Symbol [ID: ${g.symbolId}] \`${g.name}\` (${g.kind}, ${g.relationship}, hop ${g.hop}) in \`${g.filePath}\`\n  Signature: ${g.signature || g.name}`,
      )
    }
  }

  // Section 3: Similar Code
  if (vectorMatches.length > 0) {
    sections.push('\n### [SEMANTICALLY SIMILAR CODE]')
    for (const v of vectorMatches) {
      sections.push(
        `- Symbol [ID: ${v.symbolId}] \`${v.name}\` (${v.kind}, similarity: ${(v.similarity * 100).toFixed(1)}%) in \`${v.filePath}\`\n  Signature: ${v.signature || v.name}`,
      )
    }
  }

  // Section 4: Recent Commits
  if (recentCommits.length > 0) {
    sections.push('\n### [RECENT COMMITS ON IMPLICATED FILES]')
    for (const c of recentCommits) {
      sections.push(
        `- Commit \`${c.sha.slice(0, 7)}\` by ${c.authorEmail} (${c.committedAt.toISOString().split('T')[0]})\n  Message: ${c.message}\n  Touching: ${c.implicatedFile}`,
      )
      if (c.diffSnippet) {
        sections.push(`  Diff snippet:\n\`\`\`diff\n${c.diffSnippet.slice(0, 400)}\n\`\`\``)
      }
    }
  }

  const allSymbolIds = Array.from(
    new Set([
      ...anchoredSymbols.map((s) => s.symbolId),
      ...graphNeighbors.map((g) => g.symbolId),
      ...vectorMatches.map((v) => v.symbolId),
    ]),
  )

  return {
    signatureMapPrompt: sections.join('\n'),
    anchoredSymbols,
    graphNeighbors,
    vectorMatches,
    recentCommits,
    implicatedFiles,
    candidateSymbolIds: allSymbolIds,
  }
}
