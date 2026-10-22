'use client';

import * as React from 'react';
import { type MachineState } from '@/features/conversation/types';
import { Button } from '@/components/ui/button';
import { ArrowRight, RotateCcw, Clock, Sparkles, BookOpen } from 'lucide-react';

export interface ContextActionBarProps {
  machineState: MachineState;
  onReadyForRecall: () => void;
  onRequestQuestion: () => void;
  onContinue: () => void;
  onTryAgain: () => void;
  onRevise: () => void;
  onReviewLater: () => void;
  isLoading?: boolean;
}

export const ContextActionBar: React.FC<ContextActionBarProps> = ({
  machineState,
  onReadyForRecall,
  onRequestQuestion,
  onContinue,
  onTryAgain,
  onRevise,
  onReviewLater,
  isLoading = false,
}) => {
  return (
    <nav
      aria-label="Tutor contextual actions"
      className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/90 backdrop-blur-xs flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onReviewLater}
          disabled={isLoading}
          className="text-xs h-9 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <Clock className="h-4 w-4 mr-1.5" aria-hidden="true" />
          <span>Review later</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {machineState === 'STUDYING_CONCEPT' && (
          <Button
            variant="primary"
            onClick={onReadyForRecall}
            disabled={isLoading}
            className="text-xs sm:text-sm h-9 px-4"
          >
            <span>I&apos;m ready to test recall</span>
            <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
          </Button>
        )}

        {machineState === 'WAITING_FOR_RECALL' && (
          <Button
            variant="primary"
            onClick={onRequestQuestion}
            disabled={isLoading}
            isLoading={isLoading}
            loadingText="Generating…"
            className="text-xs sm:text-sm h-9 px-4"
          >
            <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>Generate recall question</span>
          </Button>
        )}

        {machineState === 'FEEDBACK' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onTryAgain}
              disabled={isLoading}
              className="text-xs h-9"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
              <span>Try again</span>
            </Button>
            <Button
              variant="primary"
              onClick={onContinue}
              disabled={isLoading}
              className="text-xs sm:text-sm h-9 px-4"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
            </Button>
          </>
        )}

        {machineState === 'REVISION_DUE' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onTryAgain}
              disabled={isLoading}
              className="text-xs h-9"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
              <span>Retry question</span>
            </Button>
            <Button
              variant="primary"
              onClick={onRevise}
              disabled={isLoading}
              className="text-xs sm:text-sm h-9 px-4"
            >
              <BookOpen className="h-4 w-4 mr-2" aria-hidden="true" />
              <span>Review explanation</span>
            </Button>
          </>
        )}

        {machineState === 'NEXT_CONCEPT' && (
          <Button
            variant="primary"
            onClick={onContinue}
            disabled={isLoading}
            className="text-xs sm:text-sm h-9 px-4"
          >
            <span>Proceed to next concept</span>
            <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
          </Button>
        )}
      </div>
    </nav>
  );
};
