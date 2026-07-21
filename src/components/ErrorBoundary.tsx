import { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * WHY THIS EXISTS: every "blank page, just the background" report so far has
 * had the same root cause — a render-time crash (e.g. reading `.full_name`
 * off a `null` embedded Supabase join) with no React error boundary anywhere
 * in the tree. React unmounts the entire app on an uncaught render error by
 * default, which looks exactly like "nothing loaded" with zero clues in the
 * UI. This component is the systemic fix: it can't prevent a bug from
 * existing, but it guarantees a crash is now visible and recoverable instead
 * of silently blanking the screen.
 *
 * This does NOT replace fixing the underlying null-safety bugs (optional
 * chaining, fallback values) — it's the safety net for whatever the next one
 * turns out to be.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[CPVS] Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-status-expired/10 text-status-expired">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Something went wrong loading this page.</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">{this.state.error.message}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={this.handleReset} className="btn-primary">
              <RotateCcw size={14} /> Try again
            </button>
            <button onClick={() => (window.location.href = '/')} className="btn-secondary">
              Go to dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
