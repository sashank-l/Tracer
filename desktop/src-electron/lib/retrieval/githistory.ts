import { getDb } from '../../db/client'

export interface CorrelatedCommit {
  sha: string
  message: string
  authorEmail: string
  committedAt: Date
  filesChanged: string[]
  diffSnippet: string
  implicatedFile: string
}

/**
 * Surface recent commits that modified the files implicated by Layers 1, 2, or 3.
 * Recent modifications to these files are often the direct root cause of the regression.
 */
export async function correlateGitHistory(
  repoId: string,
  implicatedFiles: string[],
  limit: number = 5,
): Promise<CorrelatedCommit[]> {
  if (!implicatedFiles.length) return []

  const db = getDb()
  const commits = await db.commitRecord.findMany({
    where: { repositoryId: repoId },
    orderBy: { committedAt: 'desc' },
    take: 50,
  })

  const results: CorrelatedCommit[] = []
  const seenShas = new Set<string>()

  for (const commit of commits) {
    let files: string[] = []
    try {
      files = JSON.parse(commit.filesChanged)
    } catch {
      files = []
    }

    for (const targetFile of implicatedFiles) {
      const isMatch = files.some(
        (f) =>
          f.endsWith(targetFile) ||
          targetFile.endsWith(f) ||
          f.toLowerCase() === targetFile.toLowerCase(),
      )

      if (isMatch && !seenShas.has(commit.sha)) {
        seenShas.add(commit.sha)
        results.push({
          sha: commit.sha,
          message: commit.message,
          authorEmail: commit.authorEmail,
          committedAt: commit.committedAt,
          filesChanged: files,
          diffSnippet: commit.diffText ? commit.diffText.slice(0, 1500) : '',
          implicatedFile: targetFile,
        })
        break
      }
    }

    if (results.length >= limit) break
  }

  return results
}
