'use client';

import * as React from 'react';
import {
  Sparkles,
  ArrowRight,
  Brain,
  RotateCcw,
  BookOpen,
  Send,
  AlertCircle,
  Lightbulb,
  FileCode,
  Compass,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SafeMarkdown } from '@/components/tutor/SafeMarkdown';
import { TeacherAvatar } from '@/components/avatar';
import {
  type ConceptRecord,
  type LearningUnitRecord,
  type ConversationMessageRecord,
} from '@/types/domain';
import { type AvatarExpression } from '@/components/avatar/types';
import { cn } from '@/lib/utils/cn';

export interface StudySessionViewProps {
  concept: ConceptRecord | null;
  unit: LearningUnitRecord | null;
  messages: ConversationMessageRecord[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (text: string) => Promise<void>;
  onExplainDifferently: (mode: 'analogy' | 'example' | 'simplify') => Promise<void>;
  onReadyForRecall: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onCancelRequest?: () => void;
  onExit: () => void | Promise<void>;
  onReturnToStep2?: () => void;
  className?: string;
}

export function StudySessionView({
  concept,
  unit,
  messages,
  isLoading,
  error,
  onSendMessage,
  onExplainDifferently,
  onReadyForRecall,
  onContinue,
  onRetry,
  onCancelRequest,
  onExit,
  onReturnToStep2,
  className,
}: StudySessionViewProps) {
  const [learnerInput, setLearnerInput] = React.useState('');
  const [showDifferentOptions, setShowDifferentOptions] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  React.useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = learnerInput.trim();
    if (!trimmed || isLoading) return;
    setLearnerInput('');
    await onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // 1. NOTHING IN SCOPE STATE
  if (!concept) {
    return (
      <div className={cn('space-y-6', className)}>
        <Card className="border-[var(--border-color)] bg-[var(--surface)] p-8 text-center rounded-2xl shadow-xs">
          <CardContent className="space-y-4 pt-4 max-w-md mx-auto">
            <div className="p-3 w-fit mx-auto rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-muted)]">
              <Compass className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              No Concepts in Active Scope
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              The selected learning units contain no eligible concepts for Socratic Study. You can adjust your unit selection or review your study plan.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {onReturnToStep2 && (
                <Button variant="primary" onClick={onReturnToStep2} className="min-h-[44px] text-xs">
                  <span>Organise Units & Scope &rarr;</span>
                </Button>
              )}
              <Button variant="secondary" onClick={onExit} className="min-h-[44px] text-xs">
                <span>Return to Library</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Concept Header & Canonical Grounded Baseline */}
      <section aria-labelledby="lesson-concept-title" className="space-y-4">
        <div className="space-y-1">
          {unit?.title && (
            <span className="text-xs font-semibold text-[var(--primary)] uppercase tracking-wider">
              {unit.title}
            </span>
          )}
          <h2
            id="lesson-concept-title"
            className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]"
          >
            {concept.title}
          </h2>
        </div>

        {/* Foundational Explanation Card */}
        {(concept.canonicalExplanation || concept.summary) && (
          <Card className="border-[var(--border-color)] bg-[var(--surface)] rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="py-3 px-4 sm:px-5 border-b border-[var(--border-color)]/60 bg-[var(--surface-raised)]/40 flex flex-row items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Core Mechanism & Explanation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <SafeMarkdown
                content={concept.canonicalExplanation || concept.summary}
                className="text-sm leading-relaxed text-[var(--text-primary)]"
              />
            </CardContent>
          </Card>
        )}
      </section>

      {/* Socratic Dialogue / Conversation Feed */}
      <section aria-label="Tutor lesson dialogue" className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-color)]/60 pb-2">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Socratic Dialogue
          </span>
          {messages.length > 0 && (
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {messages.length} {messages.length === 1 ? 'exchange' : 'exchanges'}
            </span>
          )}
        </div>

        {/* Messages List */}
        <div className="space-y-4 min-h-[140px]">
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';
            const expr = (msg.expressionState || 'Explaining') as AvatarExpression;

            return (
              <div
                key={msg.id}
                className={cn(
                  'flex items-start gap-3 text-xs sm:text-sm',
                  isAssistant ? 'justify-start' : 'justify-end',
                )}
              >
                {isAssistant && (
                  <div className="shrink-0 mt-1">
                    <TeacherAvatar expression={expr} size="sm" showBadge={false} />
                  </div>
                )}

                <div
                  className={cn(
                    'p-4 rounded-2xl max-w-[85%] leading-relaxed shadow-xs',
                    isAssistant
                      ? 'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)]'
                      : 'bg-[var(--primary)] text-white font-medium rounded-tr-xs',
                  )}
                >
                  {isAssistant ? (
                    <SafeMarkdown content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Real In-Flight Loading Skeleton */}
          {isLoading && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] animate-pulse max-w-[85%]"
            >
              <div className="shrink-0 mt-1">
                <TeacherAvatar expression="Thinking" size="sm" showBadge={false} />
              </div>
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-semibold">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>The tutor is preparing a tailored Socratic explanation…</span>
                  </div>
                  {onCancelRequest && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelRequest}
                      className="h-6 px-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                      aria-label="Cancel in-flight tutor request"
                    >
                      <X className="h-3 w-3 mr-1" aria-hidden="true" />
                      <span>Cancel</span>
                    </Button>
                  )}
                </div>
                <div className="h-3 bg-[var(--surface-raised)] rounded-md w-4/5" />
                <div className="h-3 bg-[var(--surface-raised)] rounded-md w-3/5" />
              </div>
            </div>
          )}

          {/* Recoverable Error / Offline Fallback Notice */}
          {error && (
            <div
              role="alert"
              className="p-4 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 space-y-3 text-xs sm:text-sm text-[var(--text-primary)]"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-[var(--danger)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <span className="font-semibold text-[var(--danger)]">
                    Tutor explanation unavailable
                  </span>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {/offline|network|connect|timeout/i.test(error)
                      ? 'The AI tutor couldn’t connect right now. Your learning data is safe. Below is the stored canonical explanation from your study notes.'
                      : error}
                  </p>
                </div>
              </div>

              {/* Action buttons on error */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onRetry}
                  disabled={isLoading}
                  className="text-xs h-9"
                  aria-label="Retry Tutor: Re-request interactive explanation"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  <span>Retry Tutor</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onExit}
                  className="text-xs h-9"
                  aria-label="Save & Exit: Return to materials safely"
                >
                  <span>Save & Exit</span>
                </Button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Answer / Socratic Response Composer */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="relative rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)] transition-all">
            <textarea
              id="study-learner-composer"
              value={learnerInput}
              onChange={(e) => setLearnerInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={3}
              placeholder="Respond to the tutor's question or ask for clarification in your own words (Enter to send, Shift+Enter for new line)..."
              className="w-full resize-none p-3.5 text-xs sm:text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              aria-label="Learner Socratic response"
            />

            <div className="flex items-center justify-between p-2.5 border-t border-[var(--border-color)]/60 bg-[var(--surface-raised)]/20">
              <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                Press <kbd className="px-1 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-color)] font-mono text-[10px]">Enter</kbd> to send
              </span>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!learnerInput.trim() || isLoading}
                className="text-xs min-h-[38px] px-3.5 font-medium ml-auto"
                aria-label="Send response to AI tutor"
              >
                <span>Send</span>
                <Send className="h-3 w-3 ml-1.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </form>

        {/* Socratic Navigation & "Explain Differently" Toolbar */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)]/60">
          {/* Explain Differently Button & Popover */}
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowDifferentOptions((prev) => !prev)}
              disabled={isLoading}
              className="text-xs min-h-[40px] px-3 border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-expanded={showDifferentOptions}
              aria-haspopup="true"
            >
              <Lightbulb className="h-3.5 w-3.5 mr-1.5 text-[var(--accent-cyan)]" aria-hidden="true" />
              <span>Explain differently</span>
            </Button>

            {showDifferentOptions && (
              <div className="absolute bottom-full left-0 mb-2 w-64 p-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] shadow-lg space-y-1 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setShowDifferentOptions(false);
                    void onExplainDifferently('analogy');
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] flex items-center gap-2"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-[var(--accent-cyan)] shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold block">Everyday Analogy</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Relate to a familiar real-world model</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowDifferentOptions(false);
                    void onExplainDifferently('example');
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] flex items-center gap-2"
                >
                  <FileCode className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold block">Concrete Walkthrough</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Step-by-step case study demonstration</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowDifferentOptions(false);
                    void onExplainDifferently('simplify');
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] flex items-center gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold block">Simpler Terms</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Strip away dense jargon</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Ready to Test Recall & Continue */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onReadyForRecall}
              disabled={isLoading}
              className="text-xs min-h-[40px] px-3.5 border-[var(--border-color)] bg-[var(--surface)] text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/50 font-medium"
              aria-label="Test Recall: Transition to active recall practice"
            >
              <Brain className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              <span>Test Recall</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onContinue}
              disabled={isLoading}
              className="text-xs min-h-[40px] px-4 font-semibold"
              aria-label="Continue: Advance to next concept"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
