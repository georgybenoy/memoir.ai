'use client';

import * as React from 'react';
import { type RecallQuestionRecord } from '@/types/domain';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfidenceSelector } from './ConfidenceSelector';
import { SafeMarkdown } from './SafeMarkdown';
import { HelpCircle, Send, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface QuestionCardProps {
  question: RecallQuestionRecord;
  draftAnswer: string;
  selectedConfidence: 1 | 2 | 3 | null;
  onAnswerChange: (text: string) => void;
  onConfidenceChange: (conf: 1 | 2 | 3) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  isFallback?: boolean;
  onTryAnotherQuestion?: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  draftAnswer,
  selectedConfidence,
  onAnswerChange,
  onConfidenceChange,
  onSubmit,
  isLoading = false,
  isFallback = false,
  onTryAnotherQuestion,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const canSubmit = draftAnswer.trim().length > 0 && selectedConfidence !== null && !isLoading;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter or Cmd+Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  const styleLabel = (question.questionStyle || 'recall').replace(/_/g, ' ');

  return (
    <Card className="border-[var(--border-color)] bg-[var(--surface-raised)]/70 shadow-lg relative overflow-hidden">
      <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30">
              <HelpCircle className="h-3 w-3" aria-hidden="true" />
              <span>{styleLabel}</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              <span>Difficulty Level {question.difficulty} of 5</span>
            </span>
          </div>

          {onTryAnotherQuestion && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTryAnotherQuestion}
              disabled={isLoading}
              className="text-xs h-7 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Try another question
            </Button>
          )}
        </div>

        {isFallback && (
          <div
            role="note"
            className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] text-xs border border-[var(--warning)]/30"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Generated using deterministic offline template while AI connection is unavailable.
            </span>
          </div>
        )}

        <CardTitle className="text-base sm:text-lg font-semibold text-[var(--text-primary)] pt-2 leading-relaxed">
          <SafeMarkdown content={question.prompt} />
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Answer Textarea */}
        <div className="space-y-1.5">
          <label
            htmlFor="recall-answer-input"
            className="block text-xs font-semibold text-[var(--text-primary)]"
          >
            Your Explanation:
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="recall-answer-input"
              value={draftAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={5}
              placeholder="Explain this concept in your own words. Focus on core mechanisms, steps, or principles..."
              className={cn(
                'w-full p-3.5 rounded-xl text-xs sm:text-sm leading-relaxed font-sans',
                'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-all',
                'resize-y min-h-[120px]',
                isLoading && 'opacity-60 cursor-not-allowed',
              )}
            />
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 pt-1">
              <span>{draftAnswer.length} characters</span>
              <span className="hidden sm:inline">Press Ctrl+Enter or Cmd+Enter to submit</span>
            </div>
          </div>
        </div>

        {/* Confidence Rating Selection */}
        <ConfidenceSelector
          value={selectedConfidence}
          onChange={onConfidenceChange}
          disabled={isLoading}
        />
      </CardContent>

      <CardFooter className="pt-2 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border-color)]/60">
        <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
          <span>Draft answer automatically saved on this device.</span>
        </div>

        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit}
          isLoading={isLoading}
          loadingText="Evaluating answer…"
          className="w-full sm:w-auto px-6"
        >
          <span>Check answer</span>
          <Send className="h-4 w-4 ml-2" aria-hidden="true" />
        </Button>
      </CardFooter>
    </Card>
  );
};
