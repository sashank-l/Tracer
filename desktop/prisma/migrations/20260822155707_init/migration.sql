-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "maxToolCalls" INTEGER NOT NULL DEFAULT 25,
    "reposDir" TEXT,
    "llmProvider" TEXT NOT NULL DEFAULT 'openai',
    "llmModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubId" BIGINT,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "localPath" TEXT,
    "apiKey" TEXT NOT NULL,
    "cloneStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "testCommand" TEXT,
    "buildCommand" TEXT,
    "lintCommand" TEXT,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "stackTrace" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Symbol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "signature" TEXT,
    "embedding" BLOB,
    CONSTRAINT "Symbol_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SymbolEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromSymbolId" TEXT NOT NULL,
    "toSymbolId" TEXT NOT NULL,
    "edgeType" TEXT NOT NULL,
    CONSTRAINT "SymbolEdge_fromSymbolId_fkey" FOREIGN KEY ("fromSymbolId") REFERENCES "Symbol" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SymbolEdge_toSymbolId_fkey" FOREIGN KEY ("toSymbolId") REFERENCES "Symbol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "committedAt" DATETIME NOT NULL,
    "filesChanged" TEXT NOT NULL,
    "diffText" TEXT NOT NULL,
    "embedding" BLOB,
    CONSTRAINT "CommitRecord_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "totalToolCalls" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "patchAttempts" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "transcript" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatchAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "diffText" TEXT NOT NULL,
    "testDiff" TEXT,
    "status" TEXT NOT NULL,
    "verifyOutput" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatchAttempt_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatchAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubId_key" ON "Repository"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_apiKey_key" ON "Repository"("apiKey");

-- CreateIndex
CREATE INDEX "Repository_cloneStatus_idx" ON "Repository"("cloneStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_key" ON "Repository"("owner", "name");

-- CreateIndex
CREATE INDEX "Incident_repositoryId_status_idx" ON "Incident"("repositoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_repositoryId_fingerprint_key" ON "Incident"("repositoryId", "fingerprint");

-- CreateIndex
CREATE INDEX "Symbol_repositoryId_filePath_idx" ON "Symbol"("repositoryId", "filePath");

-- CreateIndex
CREATE INDEX "Symbol_repositoryId_name_idx" ON "Symbol"("repositoryId", "name");

-- CreateIndex
CREATE INDEX "SymbolEdge_fromSymbolId_idx" ON "SymbolEdge"("fromSymbolId");

-- CreateIndex
CREATE INDEX "SymbolEdge_toSymbolId_idx" ON "SymbolEdge"("toSymbolId");

-- CreateIndex
CREATE UNIQUE INDEX "SymbolEdge_fromSymbolId_toSymbolId_edgeType_key" ON "SymbolEdge"("fromSymbolId", "toSymbolId", "edgeType");

-- CreateIndex
CREATE INDEX "CommitRecord_repositoryId_committedAt_idx" ON "CommitRecord"("repositoryId", "committedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommitRecord_repositoryId_sha_key" ON "CommitRecord"("repositoryId", "sha");

-- CreateIndex
CREATE INDEX "PatchAttempt_incidentId_attempt_idx" ON "PatchAttempt"("incidentId", "attempt");
