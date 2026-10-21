'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onReset?: () => void;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV !== 'production';

      return (
        <div className="flex min-h-[300px] w-full items-center justify-center p-6">
          <Card className="max-w-md w-full border-[var(--danger)]/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--danger)]/15 text-[var(--danger)]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Something went wrong</CardTitle>
                <CardDescription>
                  An unexpected error occurred while rendering this component.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--text-secondary)]">
                {this.state.error.message || 'An unknown error occurred.'}
              </p>
              {isDev && this.state.error.stack && (
                <details className="mt-4 rounded bg-[var(--surface)] p-2 text-xs font-mono text-[var(--text-muted)] overflow-auto max-h-32">
                  <summary className="cursor-pointer font-medium text-[var(--text-secondary)]">
                    Stack trace (dev only)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap">{this.state.error.stack}</pre>
                </details>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="primary" onClick={this.reset} className="w-full sm:w-auto">
                <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                Try again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
