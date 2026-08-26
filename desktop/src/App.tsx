import React, { useEffect, useState } from 'react'
import { DiffViewer } from './components/DiffViewer'
import { RetrievalContextViewer } from './components/RetrievalContextViewer'
import type { AuthState } from '../src-electron/preload'

declare global {
  interface Window {
    tracer: import('../src-electron/preload').TracerAPI
  }
}

type Tab = 'dashboard' | 'repositories' | 'incidents' | 'settings'

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'signed-out' })
  const [tab, setTab] = useState<Tab>('dashboard')
  const [repos, setRepos] = useState<any[]>([])
  const [incidents, setIncidents] = useState<any[]>([])
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null)
  const [settings, setSettings] = useState<any>({
    maxToolCalls: 25,
    llmProvider: 'openai',
    llmModel: 'gpt-4o-mini',
  })

  // Live progress tracking for indexing and harness
  const [indexingProgress, setIndexingProgress] = useState<{
    repoId: string
    progress: number
    status: string
  } | null>(null)
  const [harnessProgress, setHarnessProgress] = useState<{
    incidentId: string
    message: string
  } | null>(null)

  const refreshData = async () => {
    try {
      const r = await window.tracer.repos.list()
      setRepos(r)
      const inc = await window.tracer.incidents.list()
      setIncidents(inc)
      const s = await window.tracer.settings.get()
      if (s) setSettings(s)
    } catch (err) {
      console.error('Failed to load initial data:', err)
    }
  }

  useEffect(() => {
    window.tracer.auth.getState().then(setAuth)
    refreshData()

    const unsubAuth = window.tracer.auth.onStateChange(setAuth)
    const unsubIndex = window.tracer.repos.onIndexProgress((data) => {
      setIndexingProgress(data)
      if (data.progress === 100 || data.progress === -1) {
        refreshData()
      }
    })
    const unsubInc = window.tracer.incidents.onNewIncident((newInc) => {
      refreshData()
    })
    const unsubHarnessProg = window.tracer.incidents.onHarnessProgress((data) => {
      setHarnessProgress(data)
    })
    const unsubHarnessComp = window.tracer.incidents.onHarnessComplete(async (data) => {
      setHarnessProgress(null)
      await refreshData()
      if (selectedIncident?.id === data.incidentId) {
        const updated = await window.tracer.incidents.get(data.incidentId)
        setSelectedIncident(updated)
      }
    })

    return () => {
      unsubAuth()
      unsubIndex()
      unsubInc()
      unsubHarnessProg()
      unsubHarnessComp()
    }
  }, [selectedIncident])

  const handleAddRepo = async () => {
    const res = await window.tracer.repos.add()
    if (res.ok) {
      await refreshData()
    }
  }

  const handleIndexRepo = async (repoId: string) => {
    await window.tracer.repos.index(repoId)
  }

  const handleStartDiagnose = async (incidentId: string) => {
    await window.tracer.incidents.diagnose(incidentId)
    setHarnessProgress({ incidentId, message: 'Starting autonomous agent harness…' })
  }

  const handleSaveSettings = async () => {
    await window.tracer.settings.update(settings)
    alert('Settings saved!')
  }

  return (
    <div style={styles.appShell}>
      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.logoIcon}>⚡</span>
          <span style={styles.logoText}>Tracer</span>
        </div>

        <nav style={styles.nav}>
          <button
            style={tab === 'dashboard' ? styles.navItemActive : styles.navItem}
            onClick={() => {
              setTab('dashboard')
              setSelectedIncident(null)
            }}
          >
            📊 Dashboard
          </button>
          <button
            style={tab === 'repositories' ? styles.navItemActive : styles.navItem}
            onClick={() => {
              setTab('repositories')
              setSelectedIncident(null)
            }}
          >
            📁 Repositories ({repos.length})
          </button>
          <button
            style={tab === 'incidents' ? styles.navItemActive : styles.navItem}
            onClick={() => setTab('incidents')}
          >
            🐛 Incidents ({incidents.length})
          </button>
          <button
            style={tab === 'settings' ? styles.navItemActive : styles.navItem}
            onClick={() => {
              setTab('settings')
              setSelectedIncident(null)
            }}
          >
            ⚙️ Settings
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          {auth.status === 'signed-in' ? (
            <div style={styles.userProfile}>
              <span style={styles.userLogin}>@{auth.login}</span>
              <button
                style={styles.signOutBtn}
                onClick={() => window.tracer.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              style={styles.signInBtn}
              onClick={() => window.tracer.auth.startOAuth()}
            >
              🐙 Sign in with GitHub
            </button>
          )}
          <span style={styles.offlineTag}>● Local Mode Active</span>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main style={styles.mainContent}>
        {tab === 'dashboard' && (
          <div style={styles.view}>
            <header style={styles.pageHeader}>
              <h2>System Overview</h2>
              <button style={styles.primaryBtn} onClick={handleAddRepo}>
                + Add Repository
              </button>
            </header>

            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Connected Repositories</span>
                <span style={styles.statValue}>{repos.length}</span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Total Incidents</span>
                <span style={styles.statValue}>{incidents.length}</span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Verified Fixes</span>
                <span style={styles.statValue}>
                  {incidents.filter((i) => i.status === 'VERIFIED').length}
                </span>
              </div>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Ingest Endpoint</span>
                <span style={styles.statCode}>http://localhost:47821/ingest</span>
              </div>
            </div>

            <h3 style={{ marginTop: 24, marginBottom: 12 }}>Recent Incidents</h3>
            {incidents.length === 0 ? (
              <div style={styles.emptyCard}>
                <p style={styles.muted}>No incidents recorded yet.</p>
                <p style={{ fontSize: 13, color: '#8b949e' }}>
                  Send an error via POST to <code>http://localhost:47821/ingest</code> to test!
                </p>
              </div>
            ) : (
              <div style={styles.incidentList}>
                {incidents.slice(0, 5).map((inc) => (
                  <div
                    key={inc.id}
                    style={styles.incidentRow}
                    onClick={async () => {
                      const full = await window.tracer.incidents.get(inc.id)
                      setSelectedIncident(full)
                      setTab('incidents')
                    }}
                  >
                    <div>
                      <span style={styles.incTitle}>{inc.title}</span>
                      <div style={styles.incMeta}>
                        <span>Repo: {inc.repository?.name || 'Local'}</span> •{' '}
                        <span>Seen: {inc.occurrenceCount}x</span>
                      </div>
                    </div>
                    <span style={getStatusBadgeStyle(inc.status)}>{inc.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'repositories' && (
          <div style={styles.view}>
            <header style={styles.pageHeader}>
              <h2>Connected Repositories</h2>
              <button style={styles.primaryBtn} onClick={handleAddRepo}>
                + Add Repository
              </button>
            </header>

            {indexingProgress && (
              <div style={styles.progressBanner}>
                <span>Indexing: {indexingProgress.status}</span>
                <span style={{ fontWeight: 700 }}>{indexingProgress.progress}%</span>
              </div>
            )}

            {repos.length === 0 ? (
              <div style={styles.emptyCard}>
                <p style={styles.muted}>No repositories added yet.</p>
                <button style={styles.primaryBtn} onClick={handleAddRepo}>
                  Select Folder to Index
                </button>
              </div>
            ) : (
              <div style={styles.repoList}>
                {repos.map((r) => (
                  <div key={r.id} style={styles.repoCard}>
                    <div style={styles.repoHeader}>
                      <div>
                        <span style={styles.repoName}>
                          {r.owner}/{r.name}
                        </span>
                        <div style={styles.repoPath}>{r.localPath}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          style={styles.secondaryBtn}
                          onClick={() => handleIndexRepo(r.id)}
                        >
                          🔄 Re-Index
                        </button>
                      </div>
                    </div>

                    <div style={styles.repoDetails}>
                      <div>
                        <span style={styles.muted}>Index Status: </span>
                        <span style={{ fontWeight: 600, color: '#7ee787' }}>
                          {r.cloneStatus}
                        </span>
                      </div>
                      <div>
                        <span style={styles.muted}>Test Command: </span>
                        <code>{r.testCommand || 'Auto (npm test)'}</code>
                      </div>
                      <div>
                        <span style={styles.muted}>API Key: </span>
                        <code style={styles.apiKey}>{r.apiKey}</code>
                      </div>
                    </div>

                    <div style={styles.curlSample}>
                      <span style={{ fontSize: 11, color: '#8b949e' }}>Send test error:</span>
                      <pre style={styles.curlCode}>
                        {`curl -X POST http://localhost:47821/ingest -H "Content-Type: application/json" -H "x-api-key: ${r.apiKey}" -d '{"message": "TypeError: Cannot read properties of undefined (reading \\'map\\')", "stackTrace": "at renderList (src/App.tsx:42:10)"}'`}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'incidents' && (
          <div style={styles.view}>
            {selectedIncident ? (
              <div style={styles.incidentDetail}>
                <button
                  style={styles.backBtn}
                  onClick={() => setSelectedIncident(null)}
                >
                  ← Back to Incidents
                </button>

                <div style={styles.incidentDetailHeader}>
                  <div>
                    <h2>{selectedIncident.title}</h2>
                    <div style={styles.incMeta}>
                      <span>Repo: {selectedIncident.repository?.name}</span> •{' '}
                      <span>Fingerprint: {selectedIncident.fingerprint}</span> •{' '}
                      <span>Occurrences: {selectedIncident.occurrenceCount}x</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={getStatusBadgeStyle(selectedIncident.status)}>
                      {selectedIncident.status}
                    </span>
                    <button
                      style={styles.diagnoseBtn}
                      onClick={() => handleStartDiagnose(selectedIncident.id)}
                    >
                      🚀 Diagnose & Repair
                    </button>
                  </div>
                </div>

                {harnessProgress?.incidentId === selectedIncident.id && (
                  <div style={styles.progressBanner}>
                    <span>🤖 Agent Running: {harnessProgress?.message}</span>
                  </div>
                )}

                {selectedIncident.stackTrace && (
                  <div style={styles.stackBox}>
                    <span style={styles.boxTitle}>Stack Trace</span>
                    <pre style={styles.stackCode}>{selectedIncident.stackTrace}</pre>
                  </div>
                )}

                <div style={{ marginTop: 24 }}>
                  <h3>Agent Resolution & Verified Diffs</h3>
                  {selectedIncident.sessions && selectedIncident.sessions[0] ? (
                    <>
                      <DiffViewer
                        codeDiff={
                          selectedIncident.sessions[0].transcript
                            ? 'Diff generated during autonomous harness verification'
                            : undefined
                        }
                        testDiff="// Generated reproduction test automatically appended to test suite"
                      />
                      <RetrievalContextViewer
                        transcript={
                          selectedIncident.sessions[0].transcript
                            ? JSON.parse(selectedIncident.sessions[0].transcript)
                            : []
                        }
                      />
                    </>
                  ) : (
                    <div style={styles.emptyCard}>
                      <p style={styles.muted}>
                        Click <b>"Diagnose & Repair"</b> to launch the autonomous agent harness.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <header style={styles.pageHeader}>
                  <h2>All Incidents</h2>
                </header>

                <div style={styles.incidentList}>
                  {incidents.map((inc) => (
                    <div
                      key={inc.id}
                      style={styles.incidentRow}
                      onClick={async () => {
                        const full = await window.tracer.incidents.get(inc.id)
                        setSelectedIncident(full)
                      }}
                    >
                      <div>
                        <span style={styles.incTitle}>{inc.title}</span>
                        <div style={styles.incMeta}>
                          <span>Repo: {inc.repository?.name || 'Local'}</span> •{' '}
                          <span>Seen: {inc.occurrenceCount}x</span> •{' '}
                          <span>
                            Last: {new Date(inc.lastSeenAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <span style={getStatusBadgeStyle(inc.status)}>{inc.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div style={styles.view}>
            <header style={styles.pageHeader}>
              <h2>Settings</h2>
              <button style={styles.primaryBtn} onClick={handleSaveSettings}>
                Save Settings
              </button>
            </header>

            <div style={styles.settingsForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Max Tool Calls Budget per Session</label>
                <input
                  type="number"
                  style={styles.input}
                  value={settings.maxToolCalls || 25}
                  onChange={(e) =>
                    setSettings({ ...settings, maxToolCalls: parseInt(e.target.value, 10) })
                  }
                />
                <span style={styles.formHint}>
                  Default is 25. Controls maximum autonomous agent turns before stopping.
                </span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>LLM Provider</label>
                <select
                  style={styles.input}
                  value={settings.llmProvider || 'openai'}
                  onChange={(e) =>
                    setSettings({ ...settings, llmProvider: e.target.value })
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Diagnosis Model</label>
                <input
                  type="text"
                  style={styles.input}
                  value={settings.llmModel || 'gpt-4o-mini'}
                  onChange={(e) =>
                    setSettings({ ...settings, llmModel: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  let bg = '#30363d'
  let color = '#e6edf3'
  if (status === 'VERIFIED') {
    bg = '#238636'
    color = '#fff'
  } else if (status === 'DIAGNOSING' || status === 'PATCHING') {
    bg = '#1f6feb'
    color = '#fff'
  } else if (status === 'FAILED' || status === 'UNVERIFIED') {
    bg = '#da3633'
    color = '#fff'
  }
  return {
    background: bg,
    color,
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  }
}

const styles: Record<string, React.CSSProperties> = {
  appShell: {
    display: 'flex',
    height: '100vh',
    background: '#0d1117',
    color: '#e6edf3',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  sidebar: {
    width: 240,
    background: '#161b22',
    borderRight: '1px solid #30363d',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 12px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    marginBottom: 16,
  },
  logoIcon: { fontSize: 22 },
  logoText: { fontSize: 18, fontWeight: 700, letterSpacing: -0.5 },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    color: '#8b949e',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#21262d',
    border: '1px solid #30363d',
    color: '#e6edf3',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
  },
  sidebarFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderTop: '1px solid #30363d',
    paddingTop: 12,
  },
  userProfile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userLogin: { fontSize: 12, color: '#e6edf3', fontWeight: 600 },
  signOutBtn: {
    background: 'none',
    border: 'none',
    color: '#8b949e',
    fontSize: 11,
    cursor: 'pointer',
  },
  signInBtn: {
    padding: '6px 12px',
    background: '#21262d',
    border: '1px solid #30363d',
    color: '#e6edf3',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
  offlineTag: { fontSize: 10, color: '#7ee787', textAlign: 'center' },
  mainContent: { flex: 1, overflowY: 'auto', padding: 24 },
  view: { display: 'flex', flexDirection: 'column' },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryBtn: {
    padding: '8px 16px',
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '6px 12px',
    background: '#21262d',
    border: '1px solid #30363d',
    color: '#e6edf3',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  diagnoseBtn: {
    padding: '8px 16px',
    background: '#1f6feb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#58a6ff',
    cursor: 'pointer',
    fontSize: 13,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  statCard: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  statLabel: { fontSize: 12, color: '#8b949e' },
  statValue: { fontSize: 24, fontWeight: 700, color: '#e6edf3' },
  statCode: { fontSize: 11, fontFamily: 'monospace', color: '#58a6ff' },
  incidentList: { display: 'flex', flexDirection: 'column', gap: 8 },
  incidentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: '12px 16px',
    cursor: 'pointer',
  },
  incTitle: { fontSize: 14, fontWeight: 600, color: '#e6edf3' },
  incMeta: { fontSize: 12, color: '#8b949e', marginTop: 4 },
  repoList: { display: 'flex', flexDirection: 'column', gap: 12 },
  repoCard: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  repoHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  repoName: { fontSize: 16, fontWeight: 700, color: '#e6edf3' },
  repoPath: { fontSize: 12, color: '#8b949e', marginTop: 2 },
  repoDetails: { display: 'flex', gap: 24, fontSize: 13 },
  apiKey: { background: '#0d1117', padding: '2px 6px', borderRadius: 4 },
  curlSample: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: 10,
  },
  curlCode: {
    margin: 0,
    marginTop: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#7ee787',
    whiteSpace: 'pre-wrap',
  },
  emptyCard: {
    background: '#161b22',
    border: '1px dashed #30363d',
    borderRadius: 8,
    padding: 32,
    textAlign: 'center',
  },
  muted: { color: '#8b949e', fontSize: 13 },
  progressBanner: {
    background: '#1f6feb22',
    border: '1px solid #1f6feb',
    color: '#58a6ff',
    padding: '10px 16px',
    borderRadius: 8,
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  incidentDetail: { display: 'flex', flexDirection: 'column' },
  incidentDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stackBox: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  boxTitle: { fontSize: 12, fontWeight: 600, color: '#8b949e' },
  stackCode: {
    margin: 0,
    marginTop: 6,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#ff7b72',
    overflowX: 'auto',
  },
  settingsForm: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 500,
  },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#e6edf3' },
  input: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e6edf3',
    fontSize: 13,
  },
  formHint: { fontSize: 11, color: '#8b949e' },
}
