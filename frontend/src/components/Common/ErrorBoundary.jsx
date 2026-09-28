import React from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught runtime error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleCopy = () => {
    const text = `Error: ${this.state.error?.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 transition-colors selection:bg-primary/20">
          <div className="max-w-lg w-full bg-surface border border-border rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden backdrop-blur-xl">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

            {/* Icon Pod */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-rose-500/20 to-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-rose-500/30 shadow-inner">
              <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500 animate-pulse" />
            </div>

            {/* Title & Subtitle */}
            <h1 className="text-xl sm:text-2xl font-bold font-display text-textPrimary mb-2 tracking-tight">
              Something went wrong
            </h1>
            <p className="text-sm text-textMuted mb-6 leading-relaxed">
              An unexpected application error occurred. You can retry loading this view or return safely to the dashboard.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
              <button
                onClick={this.handleReset}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard'; }}
                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-surface hover:bg-surfaceHover border border-border text-textPrimary rounded-xl font-semibold transition-all hover:-translate-y-0.5"
              >
                <Home className="w-4 h-4 text-textMuted" />
                Dashboard
              </button>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="text-xs text-textMuted hover:text-textPrimary transition-colors inline-block py-1"
            >
              Force Reload Page
            </button>

            {/* Diagnostics Details Accordion */}
            {this.state.error && (
              <div className="mt-6 border-t border-border pt-4 text-left">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-textMuted hover:text-textPrimary transition"
                  >
                    {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {this.state.showDetails ? 'Hide technical details' : 'Show technical details'}
                  </button>
                  {this.state.showDetails && (
                    <button
                      onClick={this.handleCopy}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-textMuted hover:text-primary transition px-2 py-0.5 rounded hover:bg-primary/10"
                    >
                      {this.state.copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {this.state.copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>

                {this.state.showDetails && (
                  <div className="bg-black/40 border border-border rounded-xl p-3.5 overflow-auto max-h-48 text-[11px] font-mono text-rose-400 leading-relaxed shadow-inner">
                    <p className="font-semibold mb-1 text-rose-300">
                      {this.state.error?.toString()}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-textMuted/80 text-[10px] whitespace-pre-wrap mt-2 opacity-80">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
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