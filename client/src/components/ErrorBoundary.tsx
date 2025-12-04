import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div 
          className="h-screen w-full flex items-center justify-center p-6"
          style={{ backgroundColor: 'hsl(var(--surface))' }}
        >
          <div className="max-w-md w-full text-center">
            <div 
              className="inline-flex items-center justify-center w-16 h-16 mb-6"
              style={{ 
                backgroundColor: 'hsl(0 65% 55% / 0.1)',
                border: '1px solid hsl(0 65% 55% / 0.3)'
              }}
            >
              <AlertTriangle size={32} style={{ color: 'hsl(0 65% 55%)' }} />
            </div>
            
            <h1 
              className="text-lg tracking-wider mb-2"
              style={{ color: 'hsl(var(--text-primary))' }}
            >
              SOMETHING WENT WRONG
            </h1>
            
            <p 
              className="text-sm mb-6"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              An unexpected error occurred. Please try refreshing the page.
            </p>

            {this.state.error && (
              <div 
                className="mb-6 p-3 text-left overflow-auto max-h-32"
                style={{ 
                  backgroundColor: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border-dim))'
                }}
              >
                <code 
                  className="text-[10px] font-mono break-all"
                  style={{ color: 'hsl(0 65% 55%)' }}
                >
                  {this.state.error.message}
                </code>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm tracking-wider transition-all"
              style={{ 
                backgroundColor: 'transparent',
                border: '1px solid hsl(var(--accent) / 0.5)',
                color: 'hsl(var(--accent))'
              }}
              data-testid="button-refresh"
            >
              <RefreshCw size={14} />
              REFRESH PAGE
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
