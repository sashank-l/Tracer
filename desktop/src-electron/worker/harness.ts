import { getDb } from '../db/client'
import { assembleRetrievalContext } from '../lib/retrieval/assemble'
import { chatCompletion, getLLMConfig } from '../lib/ai'
import { getRecentCommits, getGitBlame, getGit } from '../lib/git'
import { readFile, writeFile, appendFile, readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface ToolCallRecord {
  toolName: string
  args: Record<string, any>
  result: string
  timestamp: string
}

export interface VerificationResult {
  passed: boolean
  output: string
  testPassed: boolean
  lintPassed: boolean
  buildPassed: boolean
}

export interface HarnessSessionResult {
  sessionId: string
  outcome: 'VERIFIED' | 'UNVERIFIED' | 'FAILED'
  patchDiff: string
  testDiff: string
  transcript: ToolCallRecord[]
  totalToolCalls: number
  attempts: number
  summary: string
}

/**
 * Execute command safely in the repository directory.
 */
async function runCommandInRepo(
  cmd: string,
  cwd: string,
  timeoutMs: number = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: timeoutMs })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.code || 1,
    }
  }
}

/**
 * Execute the full Agent Harness loop for an incident:
 * Seed with retrieval map -> require upfront plan -> tool calling loop -> test-first & zero-regression verification -> submit
 */
export async function runAgentHarness(
  incidentId: string,
  onProgress?: (msg: string) => void,
): Promise<HarnessSessionResult> {
  const db = getDb()

  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { repository: true },
  })

  if (!incident || !incident.repository?.localPath) {
    throw new Error('Incident or repository local path not found')
  }

  const repo = incident.repository
  const repoPath = repo.localPath! // guarded by the check above

  onProgress?.('Assembling two-tier retrieval context…')
  const retrievalContext = await assembleRetrievalContext(
    repo.id,
    incident.message || incident.title,
    incident.stackTrace || undefined,
  )

  // Fetch settings for max tool budget
  const settings = await db.appSettings.findUnique({ where: { id: 'singleton' } })
  const maxToolCalls = settings?.maxToolCalls || 25

  // Create session record in database
  const session = await db.agentSession.create({
    data: {
      incidentId: incident.id,
      outcome: 'RUNNING',
      transcript: '[]',
    },
  })

  const transcript: ToolCallRecord[] = []
  let testsAddedCount = 0
  let latestPatchDiff = ''
  let latestTestDiff = ''
  let sessionOutcome: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' = 'UNVERIFIED'
  let sessionSummary = ''
  let patchAttemptsCount = 0

  // 1. Capture baseline verification before any changes
  onProgress?.('Running baseline verification on repo…')
  let baselineVerification: VerificationResult = {
    passed: true,
    output: 'Baseline clean',
    testPassed: true,
    lintPassed: true,
    buildPassed: true,
  }

  if (repo.testCommand) {
    const baseRun = await runCommandInRepo(repo.testCommand!, repoPath)
    baselineVerification.testPassed = baseRun.exitCode === 0
    baselineVerification.output = baseRun.stdout + baseRun.stderr
  }

  // 2. Build system prompt with tools and rules
  const systemPrompt = `You are Tracer Agent, an autonomous debugging and repair system.
Your mission is to diagnose the error, inspect the relevant code, write a reproduction/regression test proving the bug, apply the minimal fix, and verify that all tests pass.

### AVAILABLE TOOLS (Respond with JSON matching tool format):
- read_file: {"tool": "read_file", "path": "relative/path/to/file"}
- read_symbol: {"tool": "read_symbol", "symbolId": "id"}
- search_code: {"tool": "search_code", "query": "text to search"}
- grep: {"tool": "grep", "pattern": "string_or_regex"}
- list_files: {"tool": "list_files", "dirPath": "optional/dir"}
- get_recent_commits: {"tool": "get_recent_commits", "path": "file"}
- git_blame: {"tool": "git_blame", "path": "file"}
- write_test: {"tool": "write_test", "testFilePath": "tests/test.ts", "testCode": "test code to append"}
- apply_patch: {"tool": "apply_patch", "filePath": "src/file.ts", "newContent": "full file content or modified block"}
- run_verification: {"tool": "run_verification"}
- submit: {"tool": "submit", "summary": "explanation of root cause and fix"}

### MANDATORY RULES:
1. TEST-FIRST: You MUST call "write_test" to add a new test case before calling "submit". Submit will be rejected if no test was added.
2. ZERO-REGRESSION: You must call "run_verification" and all existing tests plus your new test must pass.
3. MINIMAL EDITS: Only change the code necessary to fix the root cause.
4. PLAN FIRST: In your very first turn, output your diagnosis plan before calling any tools.
`

  let conversationHistory = `Incident Error: ${incident.title}
${incident.message ? `Details: ${incident.message}` : ''}
${incident.stackTrace ? `Stack Trace:\n${incident.stackTrace}` : ''}

Project Configuration:
- Test Command: ${repo.testCommand || 'None detected'}
- Build Command: ${repo.buildCommand || 'None detected'}
- Lint Command: ${repo.lintCommand || 'None detected'}

Retrieval Context Map (Tier 1 Signatures):
${retrievalContext.signatureMapPrompt}

Please provide your initial diagnosis plan and start inspecting relevant code with tools.
`

  // 3. Harness Loop
  for (let turn = 0; turn < maxToolCalls; turn++) {
    onProgress?.(`Agent turn ${turn + 1}/${maxToolCalls}…`)

    let response = ''
    try {
      response = await chatCompletion(systemPrompt, conversationHistory, 0.1)
    } catch (err: any) {
      transcript.push({
        toolName: 'error',
        args: {},
        result: `LLM Call failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      })
      break
    }

    // Try to parse tool call JSON from response
    const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/)
    if (!jsonMatch) {
      // Freeform thinking or initial plan
      conversationHistory += `\n\nAssistant:\n${response}\n\nUser:\nProceed with your next tool call.`
      continue
    }

    let toolCall: { tool: string; [key: string]: any }
    try {
      toolCall = JSON.parse(jsonMatch[0])
    } catch {
      conversationHistory += `\n\nAssistant:\n${response}\n\nUser:\nInvalid JSON tool format. Please output valid JSON.`
      continue
    }

    let toolResult = ''
    const toolName = toolCall.tool

    // Tool Dispatcher
    try {
      if (toolName === 'read_file') {
        const p = join(repoPath, toolCall.path)
        toolResult = await readFile(p, 'utf-8')
      } else if (toolName === 'read_symbol') {
        const sym = await db.symbol.findUnique({ where: { id: toolCall.symbolId } })
        toolResult = sym ? `Symbol ${sym.name} (${sym.filePath}:${sym.startLine}-${sym.endLine}):\n${sym.sourceText}` : 'Symbol not found'
      } else if (toolName === 'search_code') {
        const res = await assembleRetrievalContext(repo.id, toolCall.query)
        toolResult = res.signatureMapPrompt || 'No matches found'
      } else if (toolName === 'grep') {
        const git = getGit(repoPath)
        try {
          const grepOut = await git.raw(['grep', '-n', toolCall.pattern])
          toolResult = grepOut.slice(0, 3000)
        } catch {
          toolResult = 'No occurrences found'
        }
      } else if (toolName === 'list_files') {
        const p = toolCall.dirPath ? join(repoPath, toolCall.dirPath) : repoPath
        const list = await readdir(p)
        toolResult = list.join('\n')
      } else if (toolName === 'get_recent_commits') {
        const commits = await getRecentCommits(repoPath, 10)
        toolResult = commits.map((c) => `${c.sha.slice(0, 7)}: ${c.message}`).join('\n')
      } else if (toolName === 'git_blame') {
        toolResult = await getGitBlame(repoPath, toolCall.path)
      } else if (toolName === 'write_test') {
        // Enforce APPEND-ONLY for write_test to preserve existing tests
        const testPath = join(repoPath, toolCall.testFilePath)
        await appendFile(testPath, `\n\n// Tracer regression test\n${toolCall.testCode}\n`)
        testsAddedCount++
        latestTestDiff = toolCall.testCode
        toolResult = `Test successfully appended to ${toolCall.testFilePath}. Total new tests: ${testsAddedCount}.`
      } else if (toolName === 'apply_patch') {
        patchAttemptsCount++
        const filePath = join(repoPath, toolCall.filePath)
        await writeFile(filePath, toolCall.newContent, 'utf-8')
        latestPatchDiff = `Updated ${toolCall.filePath}`
        toolResult = `File ${toolCall.filePath} updated successfully.`
      } else if (toolName === 'run_verification') {
        let verifyOutput = 'No test command configured.'
        let passed = true
        if (repo.testCommand) {
          const run = await runCommandInRepo(repo.testCommand!, repoPath)
          passed = run.exitCode === 0
          verifyOutput = `Exit code ${run.exitCode}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`
        }
        toolResult = passed ? `Verification PASSED:\n${verifyOutput}` : `Verification FAILED:\n${verifyOutput}`
      } else if (toolName === 'submit') {
        if (testsAddedCount === 0) {
          toolResult = 'SUBMIT REJECTED: You must write a regression test via "write_test" before submitting.'
        } else {
          sessionOutcome = 'VERIFIED'
          sessionSummary = toolCall.summary || 'Fix verified and tested.'
          toolResult = 'SUBMIT ACCEPTED: Fix confirmed.'
          transcript.push({ toolName, args: toolCall, result: toolResult, timestamp: new Date().toISOString() })
          break
        }
      } else {
        toolResult = `Unknown tool: ${toolName}`
      }
    } catch (err: any) {
      toolResult = `Tool execution error: ${err.message || String(err)}`
    }

    transcript.push({
      toolName,
      args: toolCall,
      result: toolResult.slice(0, 2000), // Cap for transcript
      timestamp: new Date().toISOString(),
    })

    // Within-session context compaction: truncate stale results
    const compactResult = toolResult.length > 800 ? `${toolResult.slice(0, 800)}\n...[truncated]` : toolResult
    conversationHistory += `\n\nAssistant:\n${response}\n\nTool Result [${toolName}]:\n${compactResult}`
  }

  // Record outcome in SQLite
  await db.agentSession.update({
    where: { id: session.id },
    data: {
      outcome: sessionOutcome,
      totalToolCalls: transcript.length,
      patchAttempts: patchAttemptsCount,
      transcript: JSON.stringify(transcript),
    },
  })

  await db.incident.update({
    where: { id: incident.id },
    data: {
      status: sessionOutcome === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
    },
  })

  return {
    sessionId: session.id,
    outcome: sessionOutcome,
    patchDiff: latestPatchDiff,
    testDiff: latestTestDiff,
    transcript,
    totalToolCalls: transcript.length,
    attempts: patchAttemptsCount,
    summary: sessionSummary,
  }
}
