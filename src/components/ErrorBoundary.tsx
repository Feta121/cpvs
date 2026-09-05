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
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="glass-card animate-fadeUp relative w-full max-w-md overflow-hidden p-8 text-center">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-status-expired via-status-late to-status-expired" />
            <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-status-expired/12 blur-3xl" />

            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-xl3 bg-gradient-to-br from-status-expired/25 to-status-expired/5 text-status-expired ring-1 ring-inset ring-status-expired/30">
              <AlertTriangle size={24} strokeWidth={2.25} />
            </div>
            <h1 className="relative mt-5 font-display text-lg font-semibold tracking-[-0.01em] text-ink-900">
              Something went wrong loading this page.
            </h1>
            <div className="inset-panel relative mt-4 p-3.5">
              <p className="break-words font-mono text-xs leading-relaxed text-ink-500">{this.state.error.message}</p>
            </div>
            <div className="relative mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <button onClick={this.handleReset} className="btn-primary">
                <RotateCcw size={14} /> Try again
              </button>
              <button onClick={() => (window.location.href = '/')} className="btn-secondary">
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
