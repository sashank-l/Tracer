# Tracer implementation tracker

This checklist follows `tracer-implementation-plan.md` in order. Commit hashes record completed implementation steps.

## Phase 0 — Project scaffolding

- [x] 0.1 Initialize Next.js, TypeScript, ESLint, Prettier, and environment template (`dbaa1c5`)
- [x] 0.2 Add Prisma schema, client, and initial PostgreSQL migration (`ecf3da6`)
- [x] 0.3 Add Clerk authentication structure, protected dashboard, and user-sync webhook (`24447f3`)
- [x] 0.4 Wire up tRPC client and server (`704b9a3`)
- [ ] 0.5 Deploy skeleton to Vercel and verify the live login/dashboard
  - [ ] Create/link the Vercel project
  - [ ] Configure production environment variables
  - [ ] Apply the initial PostgreSQL migration to the hosted database
  - [ ] Configure the Clerk webhook URL and verify user sync

## Phase 1 — GitHub connection

- [ ] 1.1 Register and configure GitHub App
- [ ] 1.2 Build GitHub connection and repository selection flow
- [ ] 1.3 Verify installation-token repository read access
- [ ] 1.4 Add cloning and push-webhook-triggered re-sync

## Phase 2 — Code indexing

- [ ] 2.1 Extract TypeScript and Python symbols with tree-sitter
- [ ] 2.2 Build and persist call graph edges
- [ ] 2.3 Add symbol embeddings and full-text index
- [ ] 2.4 Index git history with embeddings
- [ ] 2.5 Verify indexing against a sample repository

## Phase 3 — Observability ingestion

- [ ] 3.1 Record the selected ingestion strategy
- [ ] 3.2 Add OTLP endpoint with API-key authentication
- [ ] 3.3 Correlate errors into deduplicated incidents
- [ ] 3.4 Add OTel setup guide and instrumented sample app

## Phase 4 — Retrieval engine

- [ ] 4.1 Add stack-trace symbol anchoring
- [ ] 4.2 Add call graph traversal
- [ ] 4.3 Add vector similarity search
- [ ] 4.4 Add regression-window git-history correlation
- [ ] 4.5 Add reranking and context size capping
- [ ] 4.6 Validate retrieval quality with seeded bugs

## Phase 5 — Root cause diagnosis

- [ ] 5.1 Build structured diagnosis prompt/output
- [ ] 5.2 Add on-demand context expansion
- [ ] 5.3 Store and display diagnoses

## Phase 6 — Patch/test/repair loop

- [ ] 6.1 Add isolated Docker sandbox
- [ ] 6.2 Generate and apply patches
- [ ] 6.3 Run checks and test suite in sandbox
- [ ] 6.4 Add bounded repair loop
- [ ] 6.5 Present verified diffs for approval

## Phase 7 — Real-time dashboard

- [ ] 7.1 Build incident list dashboard
- [ ] 7.2 Add live status updates
- [ ] 7.3 Add diff and retrieval-context viewers

## Phase 8 — Deployment and demo

- [ ] 8.1 Deploy worker service and production configuration
- [ ] 8.2 Add seeded demo repository and trigger script
- [ ] 8.3 Add backup demo recording and final README
