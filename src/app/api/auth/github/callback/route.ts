import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') ?? ''

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  // Exchange code for access token server-side (secret never leaves backend)
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }

  if (!tokenData.access_token) {
    return NextResponse.json({ error: tokenData.error ?? 'Token exchange failed' }, { status: 400 })
  }

  // Get user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'Tracer-App' },
  })
  const user = await userRes.json() as { id: number; login: string; email?: string }

  // In v1, we issue the token directly back to the Electron app via deep-link.
  // The token is the GitHub OAuth token itself, encrypted by the desktop app via safeStorage.
  // Production: sign a short-lived JWT here instead.
  const deepLinkUrl = new URL('tracer://auth-callback')
  deepLinkUrl.searchParams.set('token', tokenData.access_token)
  deepLinkUrl.searchParams.set('state', state)
  deepLinkUrl.searchParams.set('login', user.login)

  // Redirect browser to the Electron deep-link
  return NextResponse.redirect(deepLinkUrl.toString())
}
