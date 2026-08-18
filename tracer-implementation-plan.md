# Tracer — Implementation Plan

### AI-Powered Production Debugging Platform

This plan is organized into phases. Each phase is broken into numbered steps. Each step ends with a **commit point** — finish the step, verify it works, commit with the suggested message, then move to the next step. No code is included here; this is a build sequence and set of decisions, not an implementation.

Retrieval strategy locked in for this plan: **stack trace anchoring → call graph traversal → vector search → git history correlation → rerank**, using tree-sitter for parsing and a call graph (not full Microsoft-style GraphRAG).

---

## Phase 0 — Project Scaffolding

**Goal:** a running skeleton with auth, database, and empty pages — nothing functional yet, but deployable.

### Step 0.1 — Initialize the repo and frontend

- Create a new Next.js project with TypeScript and the App Router.
- Set up ESLint, Prettier, and a `.env.example` file listing every environment variable you'll eventually need (fill in real values in `.env.local`, never commit it).
- Push the empty project to a new GitHub repo (this becomes your _own_ project repo — separate from the repos users will later connect for debugging).
- **Commit:** `chore: initialize Next.js + TypeScript project scaffold`

### Step 0.2 — Set up the database and ORM

- Provision a hosted PostgreSQL instance (Supabase, Railway, or Neon — pick one now, don't self-host during development).
- Install and initialize Prisma, pointed at that database.
- Define the initial schema: `User`, `Repository`, `Incident` — just the three core tables for now, expand later.
- Run the first migration and confirm tables exist in the hosted DB.
- **Commit:** `feat: add Prisma schema and initial database migration`

### Step 0.3 — Add authentication

- Integrate Clerk (or NextAuth) for user sign-up/login.
- Protect a placeholder `/dashboard` route so only logged-in users can reach it.
- Confirm a user record is created in your `User` table on first login.
- **Commit:** `feat: add authentication and protected dashboard route`

### Step 0.4 — Set up tRPC

- Wire up tRPC end-to-end (server router, client provider, one test procedure).
- Confirm a call from the dashboard page to a tRPC procedure round-trips correctly.
- **Commit:** `feat: wire up tRPC client and server`

### Step 0.5 — Deploy the skeleton

- Deploy the current state to Vercel.
- Confirm login and the protected dashboard work on the live URL.
- **Commit:** `chore: initial deployment to Vercel`

---

## Phase 1 — GitHub Connection (GitHub App)

**Goal:** a logged-in user can connect a GitHub repository and you can programmatically read its contents.

Note on terminology: a "GitHub App" is not something the user installs separately — it's a registration you create once on GitHub's developer settings, and it powers a "Connect GitHub" button inside your own Next.js app. The user experience is just a button and a redirect, identical to OAuth from their side. The difference is that a GitHub App lets the user pick specific repos to share (rather than granting blanket account access), issues short-lived tokens instead of a long-lived personal token, and can act as its own bot identity — all of which matters here because users are trusting you with private code.

### Step 1.1 — Register the GitHub App

- In GitHub Developer Settings, create a new GitHub App for Tracer.
- Set permissions to read-only on contents, metadata, and commit statuses to start (add write/PR permissions later only if you build the auto-PR feature).
- Set the callback URL to your Next.js app.
- Store the App ID, private key, and webhook secret as environment variables — never in code.
- **Commit:** `chore: add GitHub App configuration (env only, no logic yet)`

### Step 1.2 — Build the "Connect GitHub" flow

- Add a "Connect GitHub" button on the dashboard that starts the GitHub App installation flow.
- On successful install, capture the installation ID GitHub sends back and store it against the logged-in user in the database.
- Add a `Repository` record for each repo the user grants access to during install (GitHub sends this list back via the installation callback/API).
- **Commit:** `feat: add GitHub App connection flow and repository selection`

### Step 1.3 — Verify programmatic repo access

- Using the stored installation ID, generate a short-lived installation access token server-side.
- Confirm you can list files and fetch file contents from a connected repo using that token.
- Confirm you can list recent commits for that repo.
- **Commit:** `feat: verify installation-token-based repo read access`

### Step 1.4 — Clone repos for local processing

- Add a background job (a simple queue or even a cron-triggered route to start) that does a shallow clone of a connected repo into temporary storage whenever it's connected or updated (triggered by a push webhook).
- Set up the GitHub push webhook so the app is notified when a connected repo changes, and re-clones/re-indexes on that event.
- **Commit:** `feat: add repo cloning and push-webhook-triggered re-sync`

---

## Phase 2 — Code Indexing (tree-sitter + Call Graph)

**Goal:** every connected repo is parsed into function/class-level symbols, and a call graph connecting them is stored in the database. This is the foundation the whole retrieval system sits on — take the time to get it right here.

### Step 2.1 — Symbol extraction with tree-sitter

- Set up tree-sitter with parsers for the languages you'll support (start with just one or two — e.g., TypeScript and Python — you can add more later).
- Walk the cloned repo's file tree and parse each source file.
- Extract each function and class as a discrete "symbol": file path, symbol name, start/end line, and the raw source text of just that symbol (not the whole file).
- Store each symbol as a row in a new `Symbol` table, linked to its `Repository`.
- **Commit:** `feat: add tree-sitter symbol extraction for TS and Python`

### Step 2.2 — Build the call graph

- For each symbol, statically analyze its body to find which other symbols it calls (function calls it references) and which symbols call it.
- Also capture import/export relationships between files and type/interface usage where the language supports it.
- Store these as edges in a new `SymbolEdge` table (`fromSymbolId`, `toSymbolId`, `edgeType` — e.g., "calls", "imports", "uses-type").
- Keep this as a plain edge table in Postgres rather than standing up a separate graph database — it's simpler infrastructure and perfectly sufficient at this scale.
- **Commit:** `feat: build call graph edges between symbols`

### Step 2.3 — Embed symbols for vector search

- Generate an embedding for each symbol's source text (plus a short docstring/comment if present) using an embedding model.
- Store embeddings using pgvector as a column on the `Symbol` table (or a linked table) — keeping this in the same Postgres instance avoids adding a separate vector database.
- Build a basic keyword/full-text index on symbol names and source text too — you'll want this for exact-match lookups (Layer 1 of retrieval) alongside the embeddings.
- **Commit:** `feat: add symbol embeddings and full-text index`

### Step 2.4 — Index git history

- Pull commit history for the repo (message, author, timestamp, changed files, diff).
- Embed commit messages + diffs the same way, and store them linked to the files/symbols they touched.
- This lets you later ask "what changed recently in the files implicated by this error."
- **Commit:** `feat: index git commit history with embeddings`

### Step 2.5 — Test the indexing pipeline end-to-end

- Connect a real (or sample) repo, trigger indexing, and manually verify in the database that symbols, edges, embeddings, and commit history all populated correctly.
- Fix any parsing gaps before moving on — this step is worth being thorough about, since every later phase depends on this data being accurate.
- **Commit:** `test: verify indexing pipeline against sample repository`

---

## Phase 3 — Observability Ingestion (OpenTelemetry)

**Goal:** errors from a user's live application arrive in Tracer as structured incidents, with full trace/log context attached.

### Step 3.1 — Decide the ingestion path

- Primary path: accept OpenTelemetry data (OTLP over HTTP) — this is the "correct" architecture and the better resume story.
- Optional fast path for demo purposes: also support Sentry's webhook (issues arrive pre-parsed with a stack trace, which is faster to get working end-to-end while you build the OTel path properly).
- Decide now whether you'll build both or just OTel — building just OTel is more defensible if you're time-constrained, since it avoids a "fake" secondary integration.
- **Commit:** _(no code — decision only, note it in your README)_

### Step 3.2 — Stand up an ingestion endpoint

- Add a dedicated ingestion route (not a tRPC procedure, since external applications will POST to it directly) that accepts OTLP-formatted data.
- Authenticate incoming requests with a per-repository API key you generate and show the user in the dashboard.
- Parse incoming spans for exception events, and pull out `exception.stacktrace`, `exception.type`, `exception.message`, plus `code.filepath`/`code.function`/`code.lineno` where present.
- **Commit:** `feat: add OTLP ingestion endpoint with API key auth`

### Step 3.3 — Store and correlate incoming errors

- On receiving an exception span, create or update an `Incident` record.
- Fingerprint incidents by a hash of the stack trace (normalized) so repeat occurrences of the same error update one incident rather than creating duplicates.
- Store the full trace and any accompanying log lines as `Trace`/`LogEntry` records linked to the incident.
- **Commit:** `feat: correlate incoming errors into deduplicated incidents`

### Step 3.4 — Provide a drop-in SDK snippet

- Write a short setup guide (and, if time allows, a thin wrapper package) showing users how to configure their app's OTel SDK exporter to point at your ingestion endpoint.
- Test this against a small sample app that intentionally throws an error, and confirm the incident appears in your dashboard.
- **Commit:** `docs: add OTel setup guide and sample instrumented app`

---

## Phase 4 — Retrieval Engine

**Goal:** given an incident, retrieve the exact code context needed for root-cause diagnosis — layered, so each stage narrows and adds signal rather than dumping everything into one prompt.

### Step 4.1 — Layer 1: Stack trace anchoring

- Parse the incident's stack trace to extract file paths and function/method names.
- Do a direct, deterministic lookup against the `Symbol` table for exact matches — this is your highest-confidence, zero-noise starting point, and should always run before anything semantic.
- **Commit:** `feat: add stack-trace-based exact symbol anchoring`

### Step 4.2 — Layer 2: Call graph traversal

- Starting from the anchored symbol(s), traverse the `SymbolEdge` table outward: direct callers, direct callees, and referenced types/interfaces.
- Limit traversal to a small hop count (start with 1–2 hops) to avoid pulling in the entire codebase — tune this based on how much noise vs. missing context you observe in testing.
- This is the step that catches bugs caused by something upstream of the failing line — e.g., a caller passing a bad argument — which pure similarity search would miss.
- **Commit:** `feat: add call graph traversal for structural context`

### Step 4.3 — Layer 3: Vector search

- Run a semantic similarity search over symbol embeddings using the incident's error message and stack trace as the query.
- This catches conceptually related code that isn't structurally connected via the call graph (e.g., a similar bug pattern elsewhere, or a shared utility used indirectly).
- **Commit:** `feat: add vector similarity search over symbols`

### Step 4.4 — Layer 4: Git history correlation

- Look up commits touching the files implicated by Layers 1–3, filtered to the window between the last known-good deploy and when the error was first seen.
- Surface these as candidate "what changed recently" context — often the actual root cause.
- **Commit:** `feat: add regression-window git history correlation`

### Step 4.5 — Merge and rerank

- Combine the candidate set from all four layers into one deduplicated list.
- Run a cross-encoder reranking pass over the merged set, scored against the incident's error message, to cut the list down to the highest-signal items before they go to the LLM.
- Cap the final context size explicitly (pick a token budget) so you have a hard ceiling on prompt size regardless of how much the earlier layers surface.
- **Commit:** `feat: add cross-encoder reranking and context size capping`

### Step 4.6 — Test retrieval quality in isolation

- Before wiring this into the LLM diagnosis step, manually test retrieval against a handful of known bugs in a sample repo (seed 3–5 intentional bugs).
- For each, check whether the top-ranked context actually contains the real root cause. This is worth doing carefully — a bad diagnosis downstream is almost always a retrieval problem, not a prompting problem.
- **Commit:** `test: validate retrieval quality against seeded sample bugs`

---

## Phase 5 — Root Cause Diagnosis (LLM)

**Goal:** turn retrieved context into a structured, explainable diagnosis.

### Step 5.1 — Build the diagnosis prompt

- Assemble a structured prompt: incident details (error message, stack trace) + the merged/reranked context from Phase 4, organized by layer (anchored code, related callers/callees, similar code, recent commits) so the model can weigh sources appropriately.
- Ask for a structured JSON response: root cause explanation, confidence level, list of affected files, and a suggested fix description (not code yet — that's Phase 6).
- **Commit:** `feat: add root cause diagnosis prompt and structured output`

### Step 5.2 — Add tool-based context expansion

- Give the model a tool it can call mid-diagnosis to request additional context it wasn't given up front (e.g., "show me symbol X" or "show me the full file for Y").
- This keeps your initial context small by default and lets the model pull more only when genuinely uncertain — a meaningfully more "agentic" retrieval story than a single fixed-context prompt.
- **Commit:** `feat: add on-demand context expansion tool for diagnosis`

### Step 5.3 — Store and display the diagnosis

- Save the diagnosis output linked to the `Incident`.
- Add a basic incident detail page in the dashboard showing the error, the retrieved context (worth showing explicitly — this is your retrieval work made visible), and the diagnosis.
- **Commit:** `feat: display diagnosis and retrieved context in incident detail view`

---

## Phase 6 — Agentic Patch → Test → Repair Loop

**Goal:** given a diagnosis, generate an actual code fix, verify it in isolation, and retry on failure.

### Step 6.1 — Set up the sandbox environment

- Set up Docker-based sandboxing: given a repo and a commit, spin up a container that clones the repo at that commit.
- Ensure the container has no network access and a hard timeout — this is a genuine security requirement, not just a nice-to-have, since you're executing untrusted/generated code.
- **Commit:** `feat: add isolated Docker sandbox for patch verification`

### Step 6.2 — Generate the patch

- Prompt the LLM with the diagnosis and the relevant source files to produce a patch (a diff), not full rewritten files.
- Apply the generated patch to a fresh sandbox clone.
- **Commit:** `feat: add patch generation and application in sandbox`

### Step 6.3 — Run verification checks

- In the sandbox, run the project's TypeScript check (or equivalent for the language) and its test suite.
- Capture exit codes, stdout/stderr, and store this as a `TestRun` record linked to the patch attempt.
- **Commit:** `feat: run TypeScript checks and test suite in sandbox`

### Step 6.4 — Build the repair loop

- If verification fails, feed the failure output back to the LLM as additional context and prompt it to generate a revised patch.
- Cap retries at a fixed maximum (e.g., 3 attempts) to bound cost and time.
- Orchestrate this diagnose → patch → test → (repeat on failure) sequence as an explicit state machine (LangGraph is a good fit here) rather than ad hoc control flow — this is also easier to reason about and debug.
- **Commit:** `feat: add repair loop with bounded retries`

### Step 6.5 — Present the verified diff for approval

- On a passing test run, mark the patch as verified and surface it in the dashboard as a diff for the user to review.
- Explicitly do not auto-merge — the user approves and applies it manually (or, as a stretch goal in Phase 8, you open a PR for them).
- **Commit:** `feat: present verified diffs for user approval`

---

## Phase 7 — Real-Time Dashboard

**Goal:** the full pipeline is visible and demoable end-to-end from the UI.

### Step 7.1 — Incident list view

- Build the main dashboard view listing incidents per connected repository, with status (new, diagnosing, patching, verified, failed).
- **Commit:** `feat: add incident list dashboard`

### Step 7.2 — Live status updates

- Add real-time status updates on the incident detail page as it moves through diagnose → patch → test → repair (polling is fine to start; upgrade to SSE or a subscription later if time allows).
- **Commit:** `feat: add live status updates on incident detail page`

### Step 7.3 — Diff viewer and context viewer

- Add a diff viewer component for the verified patch.
- Add a clear visual breakdown of what context was retrieved and used for diagnosis (grouped by the four retrieval layers) — this is one of the most interview-relevant parts of the UI, so don't leave it as a raw text dump.
- **Commit:** `feat: add diff viewer and retrieval context breakdown`

---

## Phase 8 — Deployment and Demo Prep

### Step 8.1 — Deploy all services

- Deploy the Next.js app to Vercel.
- Deploy the sandbox/worker service (needs Docker access, so it won't run on Vercel's serverless functions) to a small VM on Fly.io or DigitalOcean.
- **Commit:** `chore: deploy worker service and finalize production config`

### Step 8.2 — Seed a demo repository

- Create or fork a small sample repo with 2–3 intentionally seeded bugs of varying difficulty.
- Wire it up so you can trigger the full pipeline live without depending on a real bug occurring during a demo.
- **Commit:** `chore: add seeded demo repository and trigger script`

### Step 8.3 — Record a backup demo

- Record a 60–90 second screen capture walking through: error occurs → retrieval → diagnosis → patch → test → verified diff.
- Keep this as a fallback for interviews where live demos are risky.
- **Commit:** `docs: add demo recording and final README`

---

## Notes on scope

- If time is tight, the safest phases to cut down are: OTel (fall back to Sentry webhook only), auto-PR creation (skip entirely, stretch goal only), and multi-language support in tree-sitter (ship with just TypeScript first).
- Do not cut down Phase 4 (retrieval) or Phase 2.2 (call graph) — these are the core differentiators for this project and the parts most likely to come up in a technical interview.
- Keep your resume bullets honest against what's actually built at each point — in particular, don't claim the repair loop (Step 6.4) until it's actually re-prompting on real test failures, not just retrying blindly.
