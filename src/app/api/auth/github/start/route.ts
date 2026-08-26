import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state') ?? ''
  const clientId = process.env.GITHUB_CLIENT_ID!
  const callbackUrl = `${process.env.APP_URL}/api/auth/github/callback`
  const scope = 'repo read:user user:email'

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)

  redirect(url.toString())
}
