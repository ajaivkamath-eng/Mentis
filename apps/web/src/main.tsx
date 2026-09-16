import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { log } from './lib/telemetry';
import { ThemeProvider } from './lib/theme';
import { Toaster } from './components/ui/toast';
import { TooltipProvider } from './components/ui/menu';

/**
 * Error boundary — now a designed dead-end instead of raw text, with the two
 * things a user actually needs: a way back and a way to report.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };

  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }

  componentDidCatch(e: Error) {
    log.error('web crash', { message: e.message, stack: e.stack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-dvh place-items-center bg-bg px-4">
          <div className="card aurora w-full max-w-lg p-6 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-danger-soft text-danger">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="mt-3 font-display text-xl font-extrabold tracking-[-0.02em]">Something went wrong</h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              The console hit an unexpected error. Your data is safe — nothing was lost.
            </p>
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-line bg-surface-inset p-3 text-left text-2xs text-ink-faint">
              {this.state.error}
            </pre>
            <div className="mt-4 flex justify-center gap-2">
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload the console
              </button>
              <a className="btn btn-ghost" href="/">
                Back to dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Fade the first-paint splash out once React has taken over. */
const boot = document.getElementById('boot');
if (boot) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    boot.remove();
  } else {
    boot.style.transition = 'opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    requestAnimationFrame(() => {
      boot.style.opacity = '0';
      window.setTimeout(() => boot.remove(), 240);
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={280} skipDelayDuration={400}>
          <App />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
