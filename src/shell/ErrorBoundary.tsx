import { Component, type ReactNode } from "react";

type State = { error: Error | null };

// Shows the cause instead of a blank window when a screen crashes (PRD: errors give the cause and the fix).
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page page-narrow">
        <div className="callout callout-err" role="alert">
          <span className="callout-title">This screen stopped working</span>
          <span>Reconio hit an error while drawing it. Your data is not affected. Reload to try again, and send the details below if it happens again.</span>
          <pre className="well data-sm" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{error.message}</pre>
          <div className="callout-actions">
            <button type="button" className="btn btn-sm" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
