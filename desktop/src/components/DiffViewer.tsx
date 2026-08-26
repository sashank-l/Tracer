import React from 'react'

export function DiffViewer({
  codeDiff,
  testDiff,
  onApply,
}: {
  codeDiff?: string
  testDiff?: string
  onApply?: () => void
}) {
  if (!codeDiff && !testDiff) {
    return (
      <div style={styles.empty}>
        <p style={styles.muted}>No verified diff generated yet.</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {codeDiff && (
        <div style={styles.diffBlock}>
          <div style={styles.blockHeader}>
            <span style={styles.headerTitle}>🛠️ Proposed Code Patch</span>
            {onApply && (
              <button style={styles.applyButton} onClick={onApply}>
                ✓ Apply to Working Directory
              </button>
            )}
          </div>
          <pre style={styles.code}>
            {codeDiff.split('\n').map((line, idx) => {
              const isAdd = line.startsWith('+')
              const isDel = line.startsWith('-')
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: isAdd
                      ? 'rgba(46, 160, 67, 0.15)'
                      : isDel
                        ? 'rgba(248, 81, 73, 0.15)'
                        : 'transparent',
                    color: isAdd ? '#7ee787' : isDel ? '#ff7b72' : '#e6edf3',
                    padding: '2px 8px',
                  }}
                >
                  {line}
                </div>
              )
            })}
          </pre>
        </div>
      )}

      {testDiff && (
        <div style={styles.diffBlock}>
          <div style={styles.blockHeader}>
            <span style={styles.headerTitle}>🧪 Generated Regression Test</span>
          </div>
          <pre style={styles.code}>
            <div style={{ color: '#7ee787', padding: '4px 8px' }}>{testDiff}</div>
          </pre>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 12,
  },
  empty: {
    padding: 24,
    background: '#161b22',
    borderRadius: 8,
    border: '1px solid #30363d',
    textAlign: 'center',
  },
  diffBlock: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 8,
    overflow: 'hidden',
  },
  blockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e6edf3',
  },
  applyButton: {
    padding: '4px 12px',
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  code: {
    margin: 0,
    padding: '8px 0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: 'auto',
  },
  muted: {
    color: '#8b949e',
    fontSize: 13,
  },
}
