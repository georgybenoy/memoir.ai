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
  isMobileDrawer = false,
}) => {
  const { rightPanelOpen, setRightPanelOpen } = useWorkspaceStore();

  if (!rightPanelOpen && !isMobileDrawer) {
    return null;
  }

  return (
    <aside
      aria-label="AI Tutor Assistant"
      className={cn(
        'flex flex-col border-l border-[var(--border-color)] bg-[var(--surface)] transition-all duration-200',
        isMobileDrawer ? 'w-full h-full' : 'w-80 lg:w-96',
        className,
      )}
    >
      {/* Assistant Header */}
      <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-4">
        <div className="flex items-center gap-2.5">
          <TeacherAvatar expression="Greeting" size="sm" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Tutor Assistant</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRightPanelOpen(false)}
          aria-label="Close assistant panel"
          className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
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

      {/* Prompt composer placeholder */}
      <div className="border-t border-[var(--border-color)] p-3 bg-[var(--surface-raised)]/50">
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
  );
};
