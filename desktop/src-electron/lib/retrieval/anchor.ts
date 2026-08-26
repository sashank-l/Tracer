import { getDb } from '../../db/client'

export interface AnchoredSymbol {
  symbolId: string
  name: string
  filePath: string
  kind: string
  startLine: number
  endLine: number
  signature: string | null
  sourceText: string
  matchedPath: string
  matchedFunction?: string
}

/**
 * Parse an error stack trace and anchor onto discrete symbols in the database.
 * This provides high-precision, zero-noise starting points for the retrieval engine.
 */
export async function anchorFromStackTrace(
  repoId: string,
  stackTrace?: string,
): Promise<AnchoredSymbol[]> {
  if (!stackTrace) return []

  const db = getDb()
  const lines = stackTrace.split('\n')
  const results: AnchoredSymbol[] = []
  const seenSymbolIds = new Set<string>()

  for (const line of lines) {
    // Match patterns like "at Object.handleClick (src/components/Button.tsx:42:15)"
    // or "at handleRequest (api/routes.ts:18:9)" or "File 'foo.py', line 12, in bar"
    const jsMatch = line.match(/at\s+(?:(\S+)\s+)?\(?(?:.*[\\/])?([^\\/:\s]+\.[a-zA-Z0-9]+):(\d+):(\d+)\)?/)
    const pyMatch = line.match(/File\s+"(?:.*[\\/])?([^\\/"]+)",\s+line\s+(\d+)(?:,\s+in\s+(\w+))?/)

    let parsedFile = ''
    let parsedLine = 0
    let parsedFunc = ''

    if (jsMatch) {
      parsedFunc = jsMatch[1] ? jsMatch[1].replace(/.*[.#]/, '') : ''
      parsedFile = jsMatch[2]
      parsedLine = parseInt(jsMatch[3], 10)
    } else if (pyMatch) {
      parsedFile = pyMatch[1]
      parsedLine = parseInt(pyMatch[2], 10)
      parsedFunc = pyMatch[3] || ''
    }

    if (parsedFile) {
      // Find matching symbols in database by filename and optional line number / function name
      const symbols = await db.symbol.findMany({
        where: {
          repositoryId: repoId,
          filePath: { endsWith: parsedFile },
        },
      })

      for (const sym of symbols) {
        if (seenSymbolIds.has(sym.id)) continue

        let isMatch = false
        if (parsedLine >= sym.startLine && parsedLine <= sym.endLine) {
          isMatch = true
        } else if (parsedFunc && (sym.name === parsedFunc || sym.name.toLowerCase() === parsedFunc.toLowerCase())) {
          isMatch = true
        } else if (symbols.length === 1) {
          isMatch = true
        }

        if (isMatch) {
          seenSymbolIds.add(sym.id)
          results.push({
            symbolId: sym.id,
            name: sym.name,
            filePath: sym.filePath,
            kind: sym.kind,
            startLine: sym.startLine,
            endLine: sym.endLine,
            signature: sym.signature,
            sourceText: sym.sourceText,
            matchedPath: parsedFile,
            matchedFunction: parsedFunc || undefined,
          })
        }
      }
    }
  }

  return results
}
