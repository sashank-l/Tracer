import React, { useState } from 'react'

export function RetrievalContextViewer({
  transcript,
}: {
  transcript?: any[]
}) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'summary'>('timeline')

  if (!transcript || transcript.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.muted}>No agent transcript recorded for this incident.</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.tabBar}>
        <button
          style={activeTab === 'timeline' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('timeline')}
        >
          Agent Tool Execution Log ({transcript.length} steps)
        </button>
      </div>

      <div style={styles.feed}>
        {transcript.map((item, idx) => (
          <div key={idx} style={styles.step}>
            <div style={styles.stepHeader}>
              <span style={styles.stepBadge}>Step {idx + 1}</span>
              <span style={styles.toolName}>🔧 {item.toolName}</span>
              <span style={styles.timestamp}>
                {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>

            {item.args && Object.keys(item.args).length > 0 && (
              <div style={styles.argsBlock}>
                <span style={styles.muted}>Arguments: </span>
                <code>{JSON.stringify(item.args)}</code>
              </div>
            )}

            {item.result && (
              <pre style={styles.resultBlock}>{item.result.slice(0, 1500)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 12,
  },
  empty: {
    padding: 24,
    background: '#161b22',
    borderRadius: 8,
    border: '1px solid #30363d',
    textAlign: 'center',
  },
  tabBar: {
    display: 'flex',
    gap: 8,
    borderBottom: '1px solid #30363d',
    paddingBottom: 4,
  },
  tab: {
    background: 'none',
    border: 'none',
    color: '#8b949e',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 12px',
  },
  tabActive: {
    background: '#21262d',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#e6edf3',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 12px',
  },
  feed: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 400,
    overflowY: 'auto',
  },
  step: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  stepBadge: {
    background: '#1f6feb',
    color: '#fff',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 11,
    fontWeight: 700,
  },
  toolName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e6edf3',
  },
  timestamp: {
    marginLeft: 'auto',
    fontSize: 11,
    color: '#8b949e',
  },
  argsBlock: {
    fontSize: 12,
    color: '#c9d1d9',
  },
  resultBlock: {
    background: '#161b22',
    padding: 8,
    borderRadius: 4,
    margin: 0,
    fontSize: 11,
    color: '#8b949e',
    fontFamily: 'ui-monospace, monospace',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
  },
  muted: {
    color: '#8b949e',
    fontSize: 12,
  },
}
