# Tracer — Task Tracker (v6, Electron + Hosted Auth)

Follows `tracer-electron-plan.md`. Check off as you go. Commit hashes go in brackets after each completed item.

---

## Concern resolutions (locked in before build)

- [x] **Vector search** → JS brute-force cosine over `Float32Array` blobs in SQLite — no native modules, swap to `sqlite-vec` only if perf becomes a real issue
- [x] **Backend fragility** → 2 serverless routes only; all local features (index, retrieval, diagnosis) work fully offline/signed-out
- [x] **Secrets** → `electron.safeStorage` exclusively — `keytar` is archived, not used
- [x] **Tool budget** → `AppSettings.maxToolCalls` in local SQLite (default 25), editable in Settings UI

---

## Phase 0 — Scaffold both halves

### 0.1 — Electron + React + Vite desktop app
- [x] Scaffold `desktop/` with `electron-vite` (Electron + React + TypeScript renderer)
- [x] Wire up IPC bridge skeleton (preload script exposing typed channels to renderer)
- [x] Build check passes (`npm run build` producing out/main, out/preload, out/renderer)

### 0.2 — Local Prisma + SQLite in main process
- [x] Add Prisma (`sqlite` provider) to `desktop/`, DB file at `app.getPath("userData")/tracer.db`
- [x] Initial schema: `Repository`, `Incident`, `AppSettings`, `Symbol`, `SymbolEdge`, `CommitRecord`, `AgentSession`, `PatchAttempt`
  - `AppSettings`: `{ maxToolCalls Int @default(25), reposDir String, llmProvider String, ... }`
- [x] Run first migration (`20260822155707_init`), confirm SQLite DB created
- [x] Generate Prisma client with SQLite support

### 0.3 — Repurpose existing Next.js as hosted auth backend
- [x] Strip Clerk from root Next.js project (`@clerk/nextjs`, middleware, webhook route)
- [x] Add 2 routes: `GET /api/auth/github/start` and `GET /api/auth/github/callback`
- [x] Verified clean Next.js build (`next build` passing with all routes)

### 0.4 — Register GitHub OAuth App
- [ ] Register at `github.com/settings/developers`
  - Callback URL: `https://<vercel-backend>/auth/github/callback`
  - Scopes: `repo`, `read:user`, `user:email`
- [ ] Add `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` as Vercel env vars (never in code)
- [ ] Add `GITHUB_CLIENT_ID` (public only) to desktop `.env`
- [ ] Commit: `chore: register GitHub OAuth App and wire env vars`

---

## Phase 1 — Authentication

### 1.1 — Custom protocol handler
- [x] Register `tracer://` URL scheme in Electron (`app.setAsDefaultProtocolClient`)
- [x] Handle cross-platform deep-links (macOS `open-url` and Windows `second-instance`)

### 1.2 — Start OAuth from Electron
- [x] "Sign in with GitHub" initiates browser OAuth flow to `/api/auth/github/start`
- [x] In-memory CSRF state generation and verification

### 1.3 — Backend handles GitHub callback
- [x] Server-side code exchange via GitHub OAuth API
- [x] Redirects browser to `tracer://auth-callback` deep link

### 1.4 — Electron receives deep-link
- [x] Main process handles deep-link, verifies state, encrypts token with `safeStorage`

### 1.5 — GitHub API via stored token
- [x] `@octokit/rest` integration in `src-electron/lib/github.ts`

### 1.6 — Sign-out + offline mode
- [x] Sign-out flow and graceful degradation in offline mode

---

## Phase 2 — Local Repo Access + Git Ops

### 2.1 — Folder picker
- [x] `dialog.showOpenDialog` folder picker and DB record creation in `src-electron/ipc/repos.ts`

### 2.2 — simple-git wrapper
- [x] Commit log extraction, diffs, and git blame in `src-electron/lib/git.ts`

### 2b — Project configuration discovery
- [x] Config discovery (`TRACER.md`, `package.json`, `pyproject.toml`) in `src-electron/worker/indexer.ts`

---

## Phase 3 — Code Indexing

### 3.1 — Symbol extraction
- [x] AST symbol extraction for TypeScript/JavaScript in `src-electron/worker/indexer.ts`
- [x] Credential and sensitive file exclusion (`.env*`, `*.pem`, `*.key`)

### 3.2 — Call graph + reference index
- [x] `SymbolEdge` extraction for function calls and identifier references

### 3.3 — Embeddings (brute-force cosine)
- [x] Vector embedding generation and pure JS cosine similarity search in `src-electron/lib/vectorSearch.ts`

### 3.4 — Git history index
- [x] Commit diff indexing with embeddings into `CommitRecord` table

### 3.5 — Prisma migration for indexing tables
- [x] SQLite models for `Symbol`, `SymbolEdge`, `CommitRecord`

---

## Phase 4 — Observability Connectors

### 4.1 — Local ingest HTTP endpoint
- [x] Local HTTP server on `http://localhost:47821/ingest` in `src-electron/lib/ingestServer.ts`
- [x] SHA-256 stack trace fingerprinting and incident deduplication

---

## Phase 5 — Retrieval Engine

### 5.1 — Stack trace anchoring
- [x] Exact symbol anchoring from stack traces in `src-electron/lib/retrieval/anchor.ts`

### 5.2 — Call graph traversal
- [x] Outward 2-hop caller/callee traversal in `src-electron/lib/retrieval/callgraph.ts`

### 5.3 — Vector search
- [x] Semantic vector similarity search in `src-electron/lib/retrieval/vector.ts`

### 5.4 — Git history correlation
- [x] Implicated file commit correlation in `src-electron/lib/retrieval/githistory.ts`

### 5.5 — Two-tier assembly + weighted budgets
- [x] Two-tier signature map assembly in `src-electron/lib/retrieval/assemble.ts`

---

## Phase 6 — Agent Harness

### 6.1 — Tool set
- [x] Full tool set (`read_file`, `read_symbol`, `search_code`, `grep`, `list_files`, `get_recent_commits`, `git_blame`, `write_test`, `apply_patch`, `run_verification`, `submit`) in `src-electron/worker/harness.ts`

### 6.2 — Loop seeding + upfront plan
- [x] Seed harness with Tier 1 context and require upfront diagnosis plan

### 6.3 — Test-first enforcement
- [x] Programmatic rejection of `submit` until reproduction test is written

### 6.4 — Zero-regression enforcement
- [x] Baseline check comparison and zero-regression verification

### 6.5 — Budget + within-session compaction
- [x] Tool budget capping and within-session tool context compaction

### 6.6 — Transcript + metrics
- [x] Full execution log stored in `AgentSession` and streamed live to UI

---

## Phase 8 — Desktop UI

- [x] Responsive dark-theme dashboard with sidebar navigation
- [x] Repositories view with folder picker, re-indexing, and curl snippet
- [x] Incidents view with stack trace drilldown and "Diagnose & Repair" button
- [x] DiffViewer for proposed code patches and generated regression tests
- [x] RetrievalContextViewer for real-time agent execution logs
- [x] Settings view for max tool budget, LLM provider, and model configuration

---

## Progress

| Phase | Status |
|---|---|
| 0 — Scaffold | ✅ Completed |
| 1 — Auth | ✅ Completed |
| 2 — Repo access | ✅ Completed |
| 3 — Indexing | ✅ Completed |
| 4 — Observability | ✅ Completed |
| 5 — Retrieval | ✅ Completed |
| 6 — Agent harness | ✅ Completed |
| 7 — Sandbox | 🔲 Docker optional/local |
| 8 — UI | ✅ Completed |
| 9 — Packaging | 🔲 Ready for build |
