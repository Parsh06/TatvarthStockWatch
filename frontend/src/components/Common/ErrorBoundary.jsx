import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 text-center shadow-lg">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex/items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-textPrimary mb-2">Something went wrong</h1>
            <p className="text-sm text-textMuted mb-6">
              An unexpected error occurred in the application. Our team has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-6 text-left bg-black/50 p-4 rounded-xl border border-red-500/30 overflow-auto max-h-40">
                <p className="text-red-400 font-mono text-xs whitespace-pre-wrap">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;