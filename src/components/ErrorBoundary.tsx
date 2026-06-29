import { Component, ReactNode } from 'react'

// Catches render/runtime crashes so a failing screen shows the error instead of a
// blank white page — and gives us the message to debug.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('App crashed:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
        fontFamily: 'system-ui, sans-serif', background: '#f4f1ea', color: '#14181b', direction: 'ltr',
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>⚠ Something broke on this screen</h1>
          <p style={{ color: '#6c747a', marginBottom: 16 }}>
            Send this message to your developer:
          </p>
          <pre style={{
            background: '#fff', border: '1px solid #e4e8e1', borderRadius: 10, padding: 16,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, maxHeight: 320, overflow: 'auto',
          }}>{error.name}: {error.message}{'\n\n'}{error.stack}</pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            style={{
              marginTop: 16, padding: '10px 18px', borderRadius: 8, border: 'none',
              background: '#3aaa35', color: '#fff', fontWeight: 700, cursor: 'pointer',
            }}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
