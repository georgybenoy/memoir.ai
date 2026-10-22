'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  RotateCcw,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { getDueReviewQueue, type ReviewQueueGroups, type ReviewQueueItem } from '@/features/spaced-repetition/queue';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { type StudySessionRecord } from '@/types/domain';
import { cn } from '@/lib/utils/cn';

export default function ReviewQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = React.useState<ReviewQueueGroups | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    getDueReviewQueue()
      .then((data) => {
        if (mounted) {
          setQueue(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to load review queue:', err);
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Start review session for a concept
  const handleStartReview = async (item: ReviewQueueItem) => {
    try {
      const db = await openDatabase(DB_NAME);
      const newSession: StudySessionRecord = {
        id: generateId(),
        machineState: item.category === 'weak' ? 'REVISION_DUE' : 'WAITING_FOR_RECALL',
        currentConceptId: item.concept.id,
        sourceMode: 'document',
        startedAt: nowIso(),
        updatedAt: nowIso(),
      };
      await db.put('studySessions', newSession);
      router.push(`/app/tutor?session=${newSession.id}`);
    } catch (err) {
      console.error('Failed to initialize review session:', err);
      router.push('/app/tutor');
    }
  };

  const renderQueueItem = (item: ReviewQueueItem) => {
    const isWeak = item.category === 'weak';
    const isOverdue = item.category === 'overdue';

    return (
      <div
        key={item.concept.id}
        className={cn(
          'p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3',
          isWeak
            ? 'border-[var(--danger)]/30 bg-[var(--danger)]/5'
            : isOverdue
              ? 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
              : 'border-[var(--border-color)] bg-[var(--surface-raised)]',
        )}
      >
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate">
              {item.concept.title}
            </h4>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] font-medium border flex items-center gap-1',
                isWeak
                  ? 'bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/30'
                  : isOverdue
                    ? 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
                    : 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/30',
              )}
            >
              {isWeak ? (
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{item.humanDueText}</span>
            </span>
          </div>

          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {item.concept.summary}
          </p>

          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-3 pt-1">
            <span>Interval: {item.spacedRepetition.intervalDays}d</span>
            <span>Repetitions: {item.spacedRepetition.repetitions}</span>
            <span>EF: {item.spacedRepetition.easinessFactor.toFixed(2)}</span>
            {item.mastery && <span>Mastery: {item.mastery.percentage}%</span>}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Button
            variant={isWeak ? 'destructive' : 'primary'}
            size="sm"
            onClick={() => handleStartReview(item)}
            className="text-xs h-9 px-3.5"
          >
            {isWeak ? (
              <>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                <span>Revise now</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                <span>Start review</span>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-2 sm:py-4 space-y-6">
        {/* Header section */}
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Spaced Review Queue
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            SM-2 spaced repetition scheduled to maximize long-term retention.
          </p>
        </header>

        {/* Stats summary bar */}
        {queue && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-[var(--border-color)] bg-[var(--surface-raised)] p-3">
              <span className="text-xs text-[var(--text-muted)] font-medium">Ready Today</span>
              <p className="text-xl font-bold text-[var(--primary)]">{queue.totalDueCount}</p>
            </Card>
            <Card className="border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3">
              <span className="text-xs text-[var(--danger)] font-medium">Needs Revision</span>
              <p className="text-xl font-bold text-[var(--danger)]">{queue.weak.length}</p>
            </Card>
            <Card className="border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3">
              <span className="text-xs text-[var(--warning)] font-medium">Overdue</span>
              <p className="text-xl font-bold text-[var(--warning)]">{queue.overdue.length}</p>
            </Card>
            <Card className="border-[var(--border-color)] bg-[var(--surface)] p-3">
              <span className="text-xs text-[var(--text-muted)] font-medium">Upcoming (7d)</span>
              <p className="text-xl font-bold text-[var(--text-primary)]">{queue.upcoming.length}</p>
            </Card>
          </div>
        )}

        {/* Main Content */}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            Checking scheduled reviews…
          </div>
        ) : !queue || queue.totalDueCount === 0 && queue.upcoming.length === 0 ? (
          /* Empty state */
          <Card className="border-[var(--border-color)] bg-[var(--surface-raised)] p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-[var(--success)]/15 text-[var(--success)] flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-[var(--text-primary)]">
                You&apos;re up to date!
              </CardTitle>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                No reviews are currently due. You can continue learning new concepts or revisit any concept from your study path.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <Button variant="primary" onClick={() => router.push('/app/path')}>
                <span>View Study Path</span>
                <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Weak Concepts Group */}
            {queue.weak.length > 0 && (
              <section aria-labelledby="weak-concepts-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[var(--danger)]" aria-hidden="true" />
                  <h2
                    id="weak-concepts-heading"
                    className="text-base font-bold text-[var(--danger)]"
                  >
                    Concepts Flagged for Revision ({queue.weak.length})
                  </h2>
                </div>
                <div className="space-y-2">{queue.weak.map(renderQueueItem)}</div>
              </section>
            )}

            {/* Overdue Concepts Group */}
            {queue.overdue.length > 0 && (
              <section aria-labelledby="overdue-concepts-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--warning)]" aria-hidden="true" />
                  <h2
                    id="overdue-concepts-heading"
                    className="text-base font-bold text-[var(--warning)]"
                  >
                    Overdue Reviews ({queue.overdue.length})
                  </h2>
                </div>
                <div className="space-y-2">{queue.overdue.map(renderQueueItem)}</div>
              </section>
            )}

            {/* Due Today Concepts Group */}
            {queue.dueToday.length > 0 && (
              <section aria-labelledby="today-concepts-heading" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--accent-blue)]" aria-hidden="true" />
                  <h2
                    id="today-concepts-heading"
                    className="text-base font-bold text-[var(--text-primary)]"
                  >
                    Due Today ({queue.dueToday.length})
                  </h2>
                </div>
                <div className="space-y-2">{queue.dueToday.map(renderQueueItem)}</div>
              </section>
            )}

            {/* Upcoming Concepts Group */}
            {queue.upcoming.length > 0 && (
              <section aria-labelledby="upcoming-concepts-heading" className="space-y-3 pt-4 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                  <h2
                    id="upcoming-concepts-heading"
                    className="text-sm font-semibold text-[var(--text-muted)]"
                  >
                    Upcoming Reviews (Next 7 Days) ({queue.upcoming.length})
                  </h2>
                </div>
                <div className="space-y-2">{queue.upcoming.map(renderQueueItem)}</div>
              </section>
            )}
          </div>
        )}
      </Container>
    </WorkspaceLayout>
  );
}
