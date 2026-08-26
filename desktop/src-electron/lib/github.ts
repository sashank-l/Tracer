import { Octokit } from '@octokit/rest'
import { getStoredToken } from '../ipc/auth'

export interface GitHubRepo {
  id: number
  owner: string
  name: string
  fullName: string
  description: string | null
  private: boolean
  defaultBranch: string
  htmlUrl: string
}

export interface GitHubCommit {
  sha: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  htmlUrl: string
}

function getOctokit(): Octokit | null {
  const token = getStoredToken()
  if (!token) return null
  return new Octokit({ auth: token })
}

/**
 * List all repositories accessible by the user's stored OAuth token.
 * Returns empty array if not signed in.
 */
export async function listUserRepos(): Promise<GitHubRepo[]> {
  const octokit = getOctokit()
  if (!octokit) return []

  const response = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 50,
  })

  return response.data.map((repo) => ({
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    private: repo.private,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
  }))
}

/**
 * Fetch raw file content from GitHub for a repository path.
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const octokit = getOctokit()
  if (!octokit) return null

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    })

    if ('content' in response.data && response.data.encoding === 'base64') {
      return Buffer.from(response.data.content, 'base64').toString('utf-8')
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fetch commit history from GitHub API (useful for remote comparisons).
 */
export async function listRemoteCommits(
  owner: string,
  repo: string,
  since?: string,
): Promise<GitHubCommit[]> {
  const octokit = getOctokit()
  if (!octokit) return []

  try {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      since,
      per_page: 50,
    })

    return response.data.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
      authorName: item.commit.author?.name ?? 'Unknown',
      authorEmail: item.commit.author?.email ?? '',
      date: item.commit.author?.date ?? '',
      htmlUrl: item.html_url,
    }))
  } catch {
    return []
  }
}
