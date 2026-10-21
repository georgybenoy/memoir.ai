'use client';

import * as React from 'react';
import {
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Wifi,
  WifiOff,
  HardDrive,
  Sparkles,
  BookMarked,
} from 'lucide-react';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { useSaveStatusStore } from '@/lib/state/save-status-store';
import { Button } from '@/components/ui/button';

export interface WorkspaceHeaderProps {
  onMobileNavToggle?: () => void;
}

const emptySubscribe = () => () => {};

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ onMobileNavToggle }) => {
  const { isOnline, rightPanelOpen, toggleRightPanel, activeNoteId } = useWorkspaceStore();
  const { status: saveStatus, persistenceMode, lastSavedAt } = useSaveStatusStore();
  const isClient = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const online = isClient ? isOnline : true;

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-[var(--border-color)] bg-[var(--surface)]/95 px-4 backdrop-blur-xs sm:px-6">
      {/* Left side: hamburger (mobile) + brand */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMobileNavToggle}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-xs">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
            EduMentor
          </span>
        </div>

        {/* Note / Subject selector placeholder */}
        <div className="hidden sm:flex items-center ml-4 pl-4 border-l border-[var(--border-color)]">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors border border-transparent hover:border-[var(--border-color)]"
            aria-label={activeNoteId ? `Material #${activeNoteId}` : 'All Study Notes'}
          >
            <BookMarked className="h-3.5 w-3.5 text-[var(--accent-blue)]" aria-hidden="true" />
            <span>{activeNoteId ? `Material #${activeNoteId}` : 'All Study Notes'}</span>
          </button>
        </div>
      </div>

      {/* Right side: status indicators + controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Storage status badge (DESIGN_DOC §11 & PRD §1.3) */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
          title={
            persistenceMode === 'memory'
              ? 'Storage is in-memory only. Progress will not persist across browser restarts.'
              : saveStatus === 'error'
                ? 'Failed to save to local IndexedDB.'
                : lastSavedAt
                  ? `Saved locally at ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : 'Saved on this device'
          }
          role="status"
          aria-label={
            persistenceMode === 'memory'
              ? 'Storage status: Memory only'
              : saveStatus === 'saving'
                ? 'Storage status: Saving'
                : saveStatus === 'error'
                  ? 'Storage status: Save failed'
                  : 'Storage status: Saved on this device'
          }
        >
          {persistenceMode === 'memory' ? (
            <>
              <HardDrive className="h-3 w-3 text-[var(--warning)]" aria-hidden="true" />
              <span className="text-[var(--warning)]">Memory only</span>
            </>
          ) : saveStatus === 'saving' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-[var(--accent-blue)] animate-ping" aria-hidden="true" />
              <span>Saving...</span>
            </>
          ) : saveStatus === 'error' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-[var(--danger)]" aria-hidden="true" />
              <span className="text-[var(--danger)]">Save failed</span>
            </>
          ) : (
            <>
              <HardDrive className="h-3 w-3 text-[var(--success)]" aria-hidden="true" />
              <span>Saved on this device</span>
            </>
          )}
        </div>

        {/* Online/Offline status */}
        <div
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
          role="status"
          aria-label={`Connection status: ${online ? 'Online' : 'Offline'}`}
        >
          {online ? (
            <>
              <span
                className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse"
                aria-hidden="true"
              />
              <Wifi className="h-3 w-3 text-[var(--success)]" aria-hidden="true" />
              <span className="hidden md:inline">Online</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-[var(--warning)]" aria-hidden="true" />
              <WifiOff className="h-3 w-3 text-[var(--warning)]" aria-hidden="true" />
              <span className="hidden md:inline">Offline</span>
            </>
          )}
        </div>

        {/* Theme badge (locked Dark per DESIGN_DOC §4.1) */}
        <span
          className="hidden lg:inline-flex items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
          aria-label="Theme: Dark mode active"
        >
          Dark
        </span>

        {/* Assistant panel toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRightPanel}
          aria-label={rightPanelOpen ? 'Collapse assistant panel' : 'Expand assistant panel'}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {rightPanelOpen ? (
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  );
};
