import { getDb } from '../db/client'
import { getRecentCommits } from '../lib/git'
import { generateEmbedding } from '../lib/ai'
import { readdir, readFile, stat } from 'fs/promises'
import { join, relative, extname } from 'path'
import ts from 'typescript'

export type ProgressCallback = (progress: number, status: string) => void

interface ExtractedSymbol {
  name: string
  kind: string
  startLine: number
  endLine: number
  sourceText: string
  signature: string
  calledSymbols: string[]
  referencedIdentifiers: string[]
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  '.turbo',
  'coverage',
  'release',
])

const SENSITIVE_PATTERNS = [
  /\.env(\..+)?$/i,
  /\.(pem|key|crt|cert|p12|pfx)$/i,
  /id_rsa/i,
  /credentials\.json/i,
  /secrets?\./i,
]

function isSensitiveFile(filename: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filename))
}

/**
 * Recursively find all source code files in a repository, filtering out sensitive and build files.
 */
async function findSourceFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        files.push(...(await findSourceFiles(fullPath, baseDir)))
      }
    } else if (entry.isFile()) {
      if (isSensitiveFile(entry.name)) continue
      const ext = extname(entry.name).toLowerCase()
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
        files.push(fullPath)
      }
    }
  }

  return files
}

/**
 * Extract functions, classes, methods, and types from a TypeScript/JavaScript source file AST.
 */
function extractSymbolsFromAST(sourceCode: string, filePath: string): ExtractedSymbol[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const symbols: ExtractedSymbol[] = []

  function visit(node: ts.Node) {
    let name = ''
    let kind = ''

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text
      kind = 'function'
    } else if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.text
      kind = 'class'
    } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      name = node.name.text
      kind = 'method'
    } else if (ts.isInterfaceDeclaration(node)) {
      name = node.name.text
      kind = 'interface'
    } else if (ts.isTypeAliasDeclaration(node)) {
      name = node.name.text
      kind = 'type'
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          name = decl.name.text
          kind = 'function'
          break
        }
      }
    }

    if (name && kind) {
      const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      )
      const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
      const sourceText = node.getText(sourceFile)
      const firstLine = sourceText.split('\n')[0] || name

      // Collect calls and identifiers inside this symbol
      const calledSymbols: string[] = []
      const referencedIdentifiers: string[] = []

      function walkBody(child: ts.Node) {
        if (ts.isCallExpression(child)) {
          if (ts.isIdentifier(child.expression)) {
            calledSymbols.push(child.expression.text)
          } else if (
            ts.isPropertyAccessExpression(child.expression) &&
            ts.isIdentifier(child.expression.name)
          ) {
            calledSymbols.push(child.expression.name.text)
          }
        } else if (ts.isIdentifier(child) && child.text !== name) {
          referencedIdentifiers.push(child.text)
        }
        ts.forEachChild(child, walkBody)
      }

      walkBody(node)

      symbols.push({
        name,
        kind,
        startLine: startLine + 1,
        endLine: endLine + 1,
        sourceText,
        signature: `${kind} ${firstLine.slice(0, 120)}`,
        calledSymbols: Array.from(new Set(calledSymbols)),
        referencedIdentifiers: Array.from(new Set(referencedIdentifiers)),
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return symbols
}

/**
 * Run the full indexing pipeline on a local repository:
 * 1. Discover project config (TRACER.md, test commands)
 * 2. Walk files, parse AST, extract symbols and signatures
 * 3. Build call graph and reference edges
 * 4. Generate embeddings for symbols
 * 5. Index git history and diffs with embeddings
 */
export async function runIndexer(
  repoId: string,
  localPath: string,
  onProgress: ProgressCallback,
): Promise<void> {
  const db = getDb()

  try {
    onProgress(5, 'Starting repository indexing…')

    // 1. Discover project configuration
    await discoverProjectConfig(repoId, localPath, db, onProgress)

    // Clean old index data for this repo
    await db.symbol.deleteMany({ where: { repositoryId: repoId } })
    await db.commitRecord.deleteMany({ where: { repositoryId: repoId } })

    // 2. Find source files
    onProgress(15, 'Scanning source files…')
    const files = await findSourceFiles(localPath)

    onProgress(25, `Parsing AST for ${files.length} source files…`)
    const rawSymbols: Array<ExtractedSymbol & { relPath: string }> = []

    for (const file of files) {
      const relPath = relative(localPath, file).replace(/\\/g, '/')
      try {
        const content = await readFile(file, 'utf-8')
        const extracted = extractSymbolsFromAST(content, file)
        for (const sym of extracted) {
          rawSymbols.push({ ...sym, relPath })
        }
      } catch (err) {
        console.warn(`[indexer] Failed to parse ${relPath}:`, err)
      }
    }

    // 3. Insert symbols and generate embeddings
    onProgress(45, `Indexing ${rawSymbols.length} code symbols…`)
    const createdSymbols: Array<{ id: string; name: string; calledSymbols: string[]; referencedIdentifiers: string[] }> = []

    for (let i = 0; i < rawSymbols.length; i++) {
      const sym = rawSymbols[i]
      const progressPercent = Math.min(45 + Math.floor((i / rawSymbols.length) * 25), 70)

      if (i % 20 === 0) {
        onProgress(progressPercent, `Embedding symbol ${i + 1}/${rawSymbols.length}…`)
      }

      // Generate embedding for signature and top of source
      let embeddingBuffer: Uint8Array<ArrayBuffer> | null = null
      try {
        const textToEmbed = `${sym.signature}\n${sym.sourceText.slice(0, 1000)}`
        const floats = new Float32Array(await generateEmbedding(textToEmbed))
        const ab = floats.buffer.slice(0) as ArrayBuffer
        embeddingBuffer = new Uint8Array(ab)
      } catch {
        // Leave null if embedding fails
      }

      const record = await db.symbol.create({
        data: {
          repositoryId: repoId,
          filePath: sym.relPath,
          name: sym.name,
          kind: sym.kind,
          startLine: sym.startLine,
          endLine: sym.endLine,
          sourceText: sym.sourceText,
          signature: sym.signature,
          embedding: embeddingBuffer,
        },
      })

      createdSymbols.push({
        id: record.id,
        name: sym.name,
        calledSymbols: sym.calledSymbols,
        referencedIdentifiers: sym.referencedIdentifiers,
      })
    }

    // 4. Build Call Graph and Reference Edges
    onProgress(75, 'Connecting call graph and reference edges…')
    const symbolMapByName = new Map<string, string>()
    for (const s of createdSymbols) {
      symbolMapByName.set(s.name, s.id)
    }

    for (const s of createdSymbols) {
      // Calls edges
      for (const called of s.calledSymbols) {
        const targetId = symbolMapByName.get(called)
        if (targetId && targetId !== s.id) {
          await db.symbolEdge.create({
            data: {
              fromSymbolId: s.id,
              toSymbolId: targetId,
              edgeType: 'calls',
            },
          }).catch(() => {}) // Ignore duplicates
        }
      }

      // Reference edges
      for (const ref of s.referencedIdentifiers.slice(0, 10)) {
        const targetId = symbolMapByName.get(ref)
        if (targetId && targetId !== s.id) {
          await db.symbolEdge.create({
            data: {
              fromSymbolId: s.id,
              toSymbolId: targetId,
              edgeType: 'references',
            },
          }).catch(() => {})
        }
      }
    }

    // 5. Index Git Commits
    onProgress(85, 'Indexing local git commit history…')
    try {
      const commits = await getRecentCommits(localPath, 100)
      for (const commit of commits) {
        let commitEmb: Uint8Array<ArrayBuffer> | null = null
        try {
          const floats = new Float32Array(await generateEmbedding(`${commit.message}\n${commit.diff?.slice(0, 1000) ?? ''}`))
          commitEmb = new Uint8Array(floats.buffer.slice(0) as ArrayBuffer)
        } catch { /* ignore */ }

        await db.commitRecord.create({
          data: {
            repositoryId: repoId,
            sha: commit.sha,
            message: commit.message,
            authorEmail: commit.authorEmail,
            committedAt: new Date(commit.date),
            filesChanged: JSON.stringify(commit.filesChanged || []),
            diffText: commit.diff || '',
            embedding: commitEmb,
          },
        }).catch(() => {})
      }
    } catch (err) {
      console.warn('[indexer] Git commit indexing failed:', err)
    }

    // 6. Complete
    await db.repository.update({
      where: { id: repoId },
      data: {
        cloneStatus: 'INDEXED',
        indexedAt: new Date(),
      },
    })

    onProgress(100, `Indexed ${createdSymbols.length} symbols successfully ✓`)
  } catch (err) {
    console.error('[indexer] Error during indexing:', err)
    await db.repository.update({
      where: { id: repoId },
      data: { cloneStatus: 'ERROR' },
    })
    onProgress(-1, `Indexing error: ${String(err)}`)
  }
}

async function discoverProjectConfig(
  repoId: string,
  localPath: string,
  db: ReturnType<typeof getDb>,
  onProgress: ProgressCallback,
): Promise<void> {
  onProgress(10, 'Discovering project configuration…')

  let testCommand: string | null = null
  let buildCommand: string | null = null
  let lintCommand: string | null = null

  // 1. Check for TRACER.md or AGENTS.md
  for (const filename of ['TRACER.md', 'AGENTS.md']) {
    try {
      const content = await readFile(join(localPath, filename), 'utf-8')
      const testMatch = content.match(/test[:\s]+`([^`]+)`/i)
      const buildMatch = content.match(/build[:\s]+`([^`]+)`/i)
      const lintMatch = content.match(/lint[:\s]+`([^`]+)`/i)
      if (testMatch) testCommand = testMatch[1]
      if (buildMatch) buildCommand = buildMatch[1]
      if (lintMatch) lintCommand = lintMatch[1]
      if (testCommand || buildCommand || lintCommand) break
    } catch { /* file doesn't exist */ }
  }

  // 2. Fallback: package.json scripts
  if (!testCommand || !buildCommand || !lintCommand) {
    try {
      const pkg = JSON.parse(await readFile(join(localPath, 'package.json'), 'utf-8'))
      if (pkg.scripts) {
        if (!testCommand && pkg.scripts.test) testCommand = 'npm test'
        if (!buildCommand && pkg.scripts.build) buildCommand = 'npm run build'
        if (!lintCommand && pkg.scripts.lint) lintCommand = 'npm run lint'
      }
    } catch { /* no package.json */ }
  }

  // 3. Fallback: python
  if (!testCommand) {
    try {
      await stat(join(localPath, 'pyproject.toml'))
      testCommand = 'pytest'
      lintCommand = 'ruff check .'
    } catch { /* not python */ }
  }

  await db.repository.update({
    where: { id: repoId },
    data: {
      testCommand: testCommand ?? null,
      buildCommand: buildCommand ?? null,
      lintCommand: lintCommand ?? null,
    },
  })
}
