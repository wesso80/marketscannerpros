'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // TODO: Send to error reporting service (Sentry, etc.) in production
    // if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    //   reportError({ error, errorInfo });
    // }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '50vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          background: '#0f172a'
        }}>
          <div style={{
            maxWidth: '500px',
            textAlign: 'center',
            padding: '40px',
            background: 'var(--msp-card)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ 
              color: '#f1f5f9', 
              fontSize: '24px', 
              fontWeight: '700', 
              marginBottom: '12px' 
            }}>
              Something went wrong
            </h2>
            <p style={{ 
              color: '#94a3b8', 
              fontSize: '14px', 
              lineHeight: '1.6',
              marginBottom: '24px' 
            }}>
              We encountered an unexpected error. This has been logged and we'll look into it.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div style={{
                textAlign: 'left',
                padding: '12px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                marginBottom: '20px',
                maxHeight: '150px',
                overflow: 'auto'
              }}>
                <code style={{ 
                  color: '#ef4444', 
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack && (
                    <div style={{ color: '#64748b', marginTop: '8px' }}>
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </code>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  background: 'var(--msp-accent)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(16,185,129,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#10b981';
                  e.currentTarget.style.color = '#10b981';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#334155';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
