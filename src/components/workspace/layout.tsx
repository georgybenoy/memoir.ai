'use client';

import * as React from 'react';
import { WorkspaceHeader } from './header';
import { WorkspaceSidebar } from './sidebar';
import { WorkspaceAssistant } from './assistant';
import { ToastViewport } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
import { bootstrapStorage } from '@/lib/db/bootstrap';
import { X, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme';
import { useReviewStore } from '@/lib/state/review-store';

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ children }) => {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { setIsOnline } = useWorkspaceStore();
  const { totalDueCount, weakCount, bannerDismissed, dismissBanner, refreshDueCounts } =
    useReviewStore();

  // Network listener
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);

  // On mobile screens, ensure assistant panel starts closed so canvas and hamburger are interactive
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      useWorkspaceStore.getState().setRightPanelOpen(false);
    }
  }, []);

  // Bootstrap IndexedDB storage and refresh review counts on mount
  React.useEffect(() => {
    void (async () => {
      await bootstrapStorage();
      await refreshDueCounts();
    })();
  }, [refreshDueCounts]);

  const {
    localDataNoticeDismissed,
    dismissLocalDataNotice,
    persistenceMode,
    status: saveStatus,
    errorMessage: saveErrorMessage,
  } = useSaveStatusStore();
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--text-primary)]">
      {/* Accessible skip link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Top Bar */}
      <WorkspaceHeader onMobileNavToggle={() => setMobileNavOpen(true)} />

      {/* Storage Quota / Save Failure Alert Banner (PRD §1.3, PRD §8, Task 1) */}
      {saveStatus === 'error' && (
        <aside
          role="alert"
          aria-live="assertive"
          className="flex items-center justify-between gap-3 border-b border-[var(--danger)]/60 bg-[var(--danger)]/15 px-4 py-2.5 text-xs text-[var(--text-primary)] sm:px-6"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--danger)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Storage Limit / Save Failed:
            </span>
            <span>
              {saveErrorMessage ||
                'Storage quota reached. Your recent progress was NOT saved to local storage.'}
            </span>
            <Link
              href="/app/settings"
              className="font-medium text-[var(--accent-blue)] underline hover:no-underline cursor-pointer"
            >
              Export backup & cleanup &rarr;
            </Link>
          </div>
        </aside>
      )}

      {/* In-app due reviews banner (PRD FR-11, FR-16, Phase 8) */}
      {totalDueCount > 0 && !bannerDismissed && (
        <aside
          aria-label="Spaced review due reminder"
          className="flex items-center justify-between gap-3 border-b border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/10 px-4 py-2 text-xs text-[var(--text-primary)] sm:px-6"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-orange)]">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Due for Spaced Review ({totalDueCount})
            </span>
            <span>
              You have {totalDueCount} concept{totalDueCount > 1 ? 's' : ''} scheduled for review today{weakCount > 0 ? ` (including ${weakCount} marked weak)` : ''}.
            </span>
            <Link
              href="/app/review"
              className="font-medium text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Review now &rarr;
            </Link>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] cursor-pointer"
            aria-label="Dismiss review reminder"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </aside>
      )}

      {/* Dismissible-but-reachable local data notice (PRD §1.3, FR-01, DESIGN_DOC §11) */}
      {!localDataNoticeDismissed && (
        <aside
          aria-label="Local storage information"
          className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--surface-raised)]/90 px-4 py-2 text-xs text-[var(--text-secondary)] sm:px-6"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="font-semibold text-[var(--accent-blue)]">
              {persistenceMode === 'memory' ? 'In-memory session:' : 'Browser-local data:'}
            </span>
            <span>
              {persistenceMode === 'memory'
                ? 'IndexedDB is blocked. Your progress will not persist across browser restarts.'
                : 'Your learning records stay on this device and are not automatically synced.'}
            </span>
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className="font-medium text-[var(--accent-blue)] hover:underline cursor-pointer"
            >
              Data settings
            </button>
          </div>
          <button
            type="button"
            onClick={dismissLocalDataNotice}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] cursor-pointer"
            aria-label="Dismiss local data notice"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </aside>
      )}

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop / Tablet Sidebar (hidden on mobile) */}
        <WorkspaceSidebar className="hidden md:flex shrink-0" />

        {/* Mobile Navigation Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer content */}
            <div className="relative z-50 flex w-72 flex-col bg-[var(--surface)] shadow-2xl">
              <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-4">
                <span className="font-bold text-[var(--text-primary)]">Navigation</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <WorkspaceSidebar
                isMobileDrawer
                onMobileItemClick={() => setMobileNavOpen(false)}
                className="w-full flex-1 border-r-0"
              />
              <div className="p-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}

        {/* Center: Main Workspace Canvas */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto focus-visible:outline-none"
        >
          <ErrorBoundary>
            <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-28">{children}</div>
          </ErrorBoundary>
        </main>

        {/* Hovering AI Assistant Tab & Floating Panel */}
        <WorkspaceAssistant />
      </div>

      {/* Accessible Toast Notifications */}
      <ToastViewport />
    </div>
  );
};
