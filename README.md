# Tracer

Tracer is an autonomous, local-first production debugging platform. It ingests runtime errors and stack traces, indexes local codebases using AST analysis and vector search, and deploys an agentic repair loop to reproduce, patch, and verify bugs locally on your machine with zero cloud data leakage.

---

## How to Run

### 1. Prerequisites
- **Node.js** (v18+) & **npm**
- **OpenAI** or **OpenRouter API Key** (set in app Settings or as an environment variable)

---

### 2. Run the Desktop App (Electron)

```bash
# Navigate to the desktop directory
cd desktop

# Install dependencies
npm install

# Launch the app in development mode
npm run dev
```

To create a production build:
```bash
npm run build
```

---

### 3. (Optional) Run the GitHub OAuth Backend
If you use GitHub authentication:

```bash
# From the project root
npm install
npm run dev
```
*(Make sure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are configured in `.env`)*

---

### 4. Ingesting Test Errors
While Tracer is running, the local ingest server listens on port `47821`. You can post an error from any terminal or webhook:

```bash
curl -X POST http://localhost:47821/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "message": "TypeError: Cannot read properties of undefined (reading '\''token'\'')",
    "stackTrace": "TypeError: Cannot read properties of undefined (reading '\''token'\'')\n    at processOrder (src/services/order.ts:42:15)\n    at handleCheckout (src/controllers/checkout.ts:18:9)"
  }'
```

