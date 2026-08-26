# Local GitHub App setup

Tracer uses a GitHub App rather than a personal access token. The App gives each installation tightly scoped, short-lived read access to only the repositories its installer selects.

## 1. Start Tracer and expose it temporarily

Run Tracer locally:

```bash
pnpm dev
```

Use a tunnel only while testing GitHub redirects or webhooks:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated HTTPS URL into `LOCAL_TUNNEL_URL` in `.env.local`. Do not commit this file.

## 2. Register the GitHub App

In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App**. Configure:

| Setting | Local value |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Setup URL | `<LOCAL_TUNNEL_URL>/api/github/setup` |
| Webhook URL | `<LOCAL_TUNNEL_URL>/api/webhooks/github` |
| Webhook secret | A newly generated random secret |
| Repository access | Only selected repositories |

Grant these initial read-only permissions:

- Repository contents
- Metadata
- Commit statuses

Subscribe to the `push` webhook event. Download the generated private key immediately and keep it outside version control.

## 3. Configure `.env.local`

Fill the following values from the GitHub App registration:

```dotenv
GITHUB_APP_ID=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_SLUG=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_WEBHOOK_SECRET=""
APP_URL="http://localhost:3000"
LOCAL_TUNNEL_URL="https://example.trycloudflare.com"
```

When the connection flow is implemented, the setup route will validate the installation, store its ID against the signed-in user, and enumerate only the repositories granted to that installation. GitHub's push webhook will later trigger a local re-index.
