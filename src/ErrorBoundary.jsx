import { Component } from 'react';

let lastReport = 0;
export function reportClientError(code) {
  if (Date.now() - lastReport < 60000) return;
  lastReport = Date.now();
  // Fixed codes only: never transmit the exception text, URL, profile or media.
  void fetch('/api/client-errors', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => {});
}

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { reportClientError('render_failed'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="auth-page"><section className="auth-card" role="alert">
      <div className="auth-brand">common ground.</div>
      <h1>Let’s get you back.</h1>
      <p className="auth-intro">The workspace ran into a problem. Reload to reconnect. You may need to rejoin your table.</p>
      <button className="auth-submit" onClick={() => window.location.reload()}>Reload workspace</button>
    </section></main>;
  }
}
