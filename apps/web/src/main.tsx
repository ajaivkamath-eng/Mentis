import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { log } from './lib/telemetry';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error) { log.error('web crash', { message: e.message, stack: e.stack }); }
  render() {
    if (this.state.error) return <div className="p-8">Something went wrong: {this.state.error}</div>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
