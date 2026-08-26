import simpleGit, { SimpleGit } from 'simple-git'

export interface LocalCommit {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  diff?: string
  filesChanged?: string[]
}

/**
 * Get a simpleGit instance for a local repo path.
 */
export function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath)
}

/**
 * Get recent commit history with diffs and changed files for indexing and retrieval.
 */
export async function getRecentCommits(
  repoPath: string,
  maxCount: number = 200,
): Promise<LocalCommit[]> {
  const git = getGit(repoPath)
  try {
    const log = await git.log({ maxCount })
    const commits: LocalCommit[] = []

    for (const item of log.all) {
      let diff = ''
      let filesChanged: string[] = []

      try {
        // Show commit diff and file summary
        const showResult = await git.show([item.hash, '--stat', '--patch'])
        diff = showResult
        const summary = await git.show([item.hash, '--name-only', '--format='])
        filesChanged = summary
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
      } catch {
        // Fall back to just commit metadata if diff fails
      }

      commits.push({
        sha: item.hash,
        message: item.message,
        authorName: item.author_name,
        authorEmail: item.author_email,
        date: item.date,
        diff,
        filesChanged,
      })
    }

    return commits
  } catch (err) {
    console.error(`[git] Failed to get commits for ${repoPath}:`, err)
    return []
  }
}

/**
 * Get file content at a specific commit SHA.
 */
export async function getFileAtCommit(
  repoPath: string,
  sha: string,
  filePath: string,
): Promise<string | null> {
  const git = getGit(repoPath)
  try {
    const content = await git.show([`${sha}:${filePath}`])
    return content
  } catch {
    return null
  }
}

/**
 * Run git blame on a specific file and line range.
 */
export async function getGitBlame(
  repoPath: string,
  filePath: string,
): Promise<string> {
  const git = getGit(repoPath)
  try {
    const blame = await git.raw(['blame', '-w', filePath])
    return blame
  } catch (err) {
    return `Blame failed: ${String(err)}`
  }
}
