// This Next.js backend handles auth only.
// The full dashboard lives in the Electron desktop app (desktop/).
export default function BackendPage() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Tracer auth backend — deploy to Vercel</h1>
    </main>
  )
}
