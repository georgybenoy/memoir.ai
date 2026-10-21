import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ui/error-boundary';

// Component designed to throw during render
const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Explosion during render');
  }
  return <div>Clean render output</div>;
};

describe('ErrorBoundary Component', () => {
  // Suppress console.error in test output for intentional errors
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('catches render error and displays safe fallback UI with Try Again button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Explosion during render')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('supports custom fallback render prop and reset callback', async () => {
    const user = userEvent.setup();
    const handleReset = vi.fn();

    const { rerender } = render(
      <ErrorBoundary
        onReset={handleReset}
        fallback={(error, reset) => (
          <div>
            <p>Custom Error: {error.message}</p>
            <button onClick={reset}>Recover</button>
          </div>
        )}
      >
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom Error: Explosion during render')).toBeInTheDocument();
    const recoverBtn = screen.getByRole('button', { name: /recover/i });

    // Now change shouldThrow to false so it succeeds on reset
    rerender(
      <ErrorBoundary
        onReset={handleReset}
        fallback={(error, reset) => (
          <div>
            <p>Custom Error: {error.message}</p>
            <button onClick={reset}>Recover</button>
          </div>
        )}
      >
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    await user.click(recoverBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Clean render output')).toBeInTheDocument();
  });
});
