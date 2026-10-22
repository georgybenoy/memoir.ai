'use client';

import * as React from 'react';
import { Sparkles, X, MessageSquare } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TeacherAvatar } from '@/components/avatar';
import { cn } from '@/lib/utils/cn';

export interface WorkspaceAssistantProps {
  className?: string;
  isMobileDrawer?: boolean;
}

export const WorkspaceAssistant: React.FC<WorkspaceAssistantProps> = ({
  className,
}) => {
  const { rightPanelOpen } = useWorkspaceStore();
  const [isExpanded, setIsExpanded] = React.useState(false);

  // If assistant panel is toggled off from topbar, render nothing
  if (!rightPanelOpen) {
    return null;
  }

  // 1. Collapsed State: Hovering Small Tab in bottom-right corner
  if (!isExpanded) {
    return (
      <aside
        aria-label="AI Tutor Assistant"
        role="complementary"
        className="fixed bottom-6 right-6 z-40"
      >
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="group flex items-center gap-2.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)]/95 px-4 py-2.5 shadow-xl hover:shadow-2xl hover:border-[var(--primary)]/60 hover:bg-[var(--surface-hover)] transition-all duration-200 cursor-pointer backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <div className="relative flex items-center justify-center" aria-hidden="true">
            <TeacherAvatar expression="Greeting" size="sm" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
            </span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
              Tutor Assistant
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Hovering tab • Ready</span>
          </div>
          <Sparkles className="h-3.5 w-3.5 text-[var(--primary)] shrink-0 ml-1 group-hover:rotate-12 transition-transform" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  // 2. Expanded State: Floating Assistant Card / Bottom Sheet
  return (
    <>
      {/* Mobile backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 sm:hidden"
        onClick={() => setIsExpanded(false)}
        aria-hidden="true"
      />

      {/* Floating Assistant Card */}
      <aside
        aria-label="AI Tutor Assistant"
        role="complementary"
        className={cn(
          'fixed z-50 flex flex-col bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border-color)] shadow-2xl transition-all duration-200',
          // Mobile: bottom drawer sheet
          // Desktop: floating card hovering in bottom right
          'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 sm:h-[580px] sm:max-h-[85vh] sm:rounded-2xl',
          className,
        )}
      >
        {/* Assistant Header */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-4 bg-[var(--surface-raised)]/50 sm:rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <TeacherAvatar expression="Greeting" size="sm" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Tutor Assistant</h2>
              <span className="text-[10px] text-[var(--success)] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                Ready to guide your study
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              aria-label="Close assistant panel"
              className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Assistant Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <EmptyState
            icon={Sparkles}
            title="Ready to guide your study"
            description="Import study notes or choose a concept from your concept map to start a Socratic inquiry session."
            action={
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Grounded directly in your notes</span>
              </div>
            }
          />
        </div>

        {/* Prompt composer */}
        <div className="border-t border-[var(--border-color)] p-3 bg-[var(--surface-raised)]/50 sm:rounded-b-2xl shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="Ask your tutor a question..."
              disabled
              className="w-full rounded-[10px] border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] opacity-70 cursor-not-allowed"
              aria-label="Ask your tutor a question (disabled until material is selected)"
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)] text-center">
            Tutor requires selected study notes
          </p>
        </div>
      </aside>
    </>
  );
};
