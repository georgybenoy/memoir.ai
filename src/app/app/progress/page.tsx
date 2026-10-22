'use client';

import * as React from 'react';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import {
  type ConceptRecord,
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type StudySessionRecord,
} from '@/types/domain';
import {
  BarChart3,
  Calendar,
  Trash2,
  Clock,
  Award,
} from 'lucide-react';
import { evaluateAllPendingAttempts } from '@/features/evaluation';

export default function ProgressPage() {
  const { addToast } = useWorkspaceStore();
  const [loading, setLoading] = React.useState(true);
  const [concepts, setConcepts] = React.useState<ConceptRecord[]>([]);
  const [masteryList, setMasteryList] = React.useState<MasteryStateRecord[]>([]);
  const [attempts, setAttempts] = React.useState<RecallAttemptRecord[]>([]);
  const [sessions, setSessions] = React.useState<StudySessionRecord[]>([]);
  const [selectedAttempt, setSelectedAttempt] = React.useState<RecallAttemptRecord | null>(null);
  const [isEvaluatingPending, setIsEvaluatingPending] = React.useState(false);
  const [evaluatingProgressText, setEvaluatingProgressText] = React.useState<string | null>(null);

  const handleEvaluatePending = async () => {
    setIsEvaluatingPending(true);
    setEvaluatingProgressText('Preparing evaluations...');
    try {
      const res = await evaluateAllPendingAttempts({
        onProgress: (p) => {
          setEvaluatingProgressText(`Evaluating ${p.current} of ${p.total}: "${p.conceptName}"...`);
        },
      });

      if (res.evaluated > 0) {
        addToast({
          type: 'success',
          title: 'Evaluation Complete',
          description: `Successfully evaluated ${res.evaluated} pending answer${res.evaluated > 1 ? 's' : ''}.`,
        });
        const db = await openDatabase(DB_NAME);
        const [a, m] = await Promise.all([
          db.getAll('recallAttempts'),
          db.getAll('masteryStates'),
        ]);
        setAttempts(a.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()));
        setMasteryList(m);
      } else {
        addToast({
          type: 'warning',
          title: 'Evaluation Incomplete',
          description: 'The tutor couldn’t connect right now. Your saved learning data is still available.',
        });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Evaluation Error',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsEvaluatingPending(false);
      setEvaluatingProgressText(null);
    }
  };

  React.useEffect(() => {
    let mounted = true;
    openDatabase(DB_NAME)
      .then(async (db) => {
        const [c, m, a, s] = await Promise.all([
          db.getAll('concepts'),
          db.getAll('masteryStates'),
          db.getAll('recallAttempts'),
          db.getAll('studySessions'),
        ]);
        if (mounted) {
          setConcepts(c);
          setMasteryList(m);
          setAttempts(
            a.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()),
          );
          setSessions(
            s.sort((x, y) => new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime()),
          );
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Failed to load progress data:', err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Delete a specific attempt from local history
  const handleDeleteAttempt = async (attemptId: string) => {
    try {
      const db = await openDatabase(DB_NAME);
      await db.delete('recallAttempts', attemptId);
      setAttempts((prev) => prev.filter((a) => a.id !== attemptId));
      if (selectedAttempt?.id === attemptId) {
        setSelectedAttempt(null);
      }
      addToast({
        type: 'info',
        title: 'Attempt Removed',
        description: 'Selected recall attempt was deleted from local history.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Delete a specific session from local history
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const db = await openDatabase(DB_NAME);
      await db.delete('studySessions', sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      addToast({
        type: 'info',
        title: 'Session Removed',
        description: 'Selected study session record was deleted.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const conceptMap = React.useMemo(() => {
    return new Map(concepts.map((c) => [c.id, c]));
  }, [concepts]);

  // Genuine computed summary
  const totalAttemptsCount = attempts.length;
  const passingAttemptsCount = attempts.filter((a) => a.qualityGrade >= 3).length;
  const overallPassingRate =
    totalAttemptsCount > 0 ? Math.round((passingAttemptsCount / totalAttemptsCount) * 100) : 0;
  const pendingAttempts = attempts.filter(
    (a) => a.pendingEvaluation || a.evaluationMode === 'pending',
  );

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-4 sm:py-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-[var(--accent-blue)]" aria-hidden="true" />
              <span>Progress & Study History</span>
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              Grounded analytics, concept mastery levels, and recall attempt records saved locally on this device.
            </p>
          </div>
        </div>

        {/* Pending Offline Evaluations Alert & Action (PRD FR-10, FR-15, Task 2) */}
        {pendingAttempts.length > 0 && (
          <aside
            role="region"
            aria-label="Pending evaluations"
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--accent-orange)]/50 bg-[var(--accent-orange)]/10"
          >
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-[var(--accent-orange)] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Pending Answer Evaluations ({pendingAttempts.length})
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  You have {pendingAttempts.length} answer{pendingAttempts.length > 1 ? 's' : ''} saved locally while offline or when the tutor was disconnected.
                  {evaluatingProgressText && (
                    <span className="block text-[var(--accent-blue)] font-medium mt-1">
                      {evaluatingProgressText}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={isEvaluatingPending}
              isLoading={isEvaluatingPending}
              loadingText="Evaluating..."
              onClick={handleEvaluatePending}
              className="shrink-0"
            >
              Evaluate pending answers
            </Button>
          </aside>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
            <span className="text-xs text-[var(--text-muted)] block">Total Attempts</span>
            <span className="text-2xl font-bold text-[var(--text-primary)] block mt-0.5">
              {totalAttemptsCount}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Active recall tests</span>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
            <span className="text-xs text-[var(--text-muted)] block">Passing Rate</span>
            <span className="text-2xl font-bold text-[var(--success)] block mt-0.5">
              {totalAttemptsCount > 0 ? `${overallPassingRate}%` : '—'}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Quality grade ≥ 3</span>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
            <span className="text-xs text-[var(--text-muted)] block">Mastered Concepts</span>
            <span className="text-2xl font-bold text-[var(--primary)] block mt-0.5">
              {masteryList.filter((m) => m.level >= 4).length}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Verified across sessions</span>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
            <span className="text-xs text-[var(--text-muted)] block">Study Sessions</span>
            <span className="text-2xl font-bold text-[var(--accent-cyan)] block mt-0.5">
              {sessions.length}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Local sessions logged</span>
          </div>
        </div>

        {/* No Data State */}
        {!loading && totalAttemptsCount === 0 && (
          <EmptyState
            icon={BarChart3}
            title="No recall history yet"
            description="Start practicing recall with your AI tutor to generate grounded performance charts and mastery progress."
          />
        )}

        {totalAttemptsCount > 0 && (
          <>
            {/* 1. Mastery Breakdown by Concept */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[var(--text-primary)] flex items-center gap-2">
                  <Award className="h-4 w-4 text-[var(--accent-blue)]" aria-hidden="true" />
                  <span>Concept Mastery Distribution</span>
                </CardTitle>
                <CardDescription>
                  Mastery percentages computed via recency-weighted exponential decay.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {masteryList.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No mastery records available yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {masteryList.map((m) => {
                      const c = conceptMap.get(m.conceptId);
                      const levelName =
                        m.level === 4
                          ? 'Mastered'
                          : m.level === 3
                            ? 'Proficient'
                            : m.level === 2
                              ? 'Familiar'
                              : m.level === 1
                                ? 'Learning'
                                : 'New';

                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {c ? c.title : `Concept ${m.conceptId.slice(0, 8)}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                {m.percentage}%
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-blue)]">
                                {levelName}
                              </span>
                            </div>
                          </div>

                          {/* Accessible SVG Progress Bar with label */}
                          <div className="w-full bg-[var(--surface-raised)] rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[var(--primary)] h-2 rounded-full transition-all"
                              style={{ width: `${Math.max(4, Math.min(100, m.percentage))}%` }}
                              role="progressbar"
                              aria-valuenow={m.percentage}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${c?.title ?? 'Concept'} mastery progress`}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                            <span>Attempts: {m.attemptCount}</span>
                            <span>Best score: {m.bestScore}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Recall Attempt History (with inspect & delete) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[var(--text-primary)] flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
                  <span>Recall Practice History</span>
                </CardTitle>
                <CardDescription>
                  Inspect individual answer attempts or delete records from your local device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-[var(--text-secondary)]">
                    <caption className="sr-only">Recall practice attempt history</caption>
                    <thead className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                      <tr>
                        <th scope="col" className="pb-2 font-medium">Concept</th>
                        <th scope="col" className="pb-2 font-medium">Quality</th>
                        <th scope="col" className="pb-2 font-medium">Score</th>
                        <th scope="col" className="pb-2 font-medium">Mode</th>
                        <th scope="col" className="pb-2 font-medium">Date</th>
                        <th scope="col" className="pb-2 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {attempts.slice(0, 20).map((att) => {
                        const c = conceptMap.get(att.conceptId);
                        const isPassing = att.qualityGrade >= 3;

                        return (
                          <tr key={att.id} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 pr-2 font-medium text-[var(--text-primary)]">
                              {c ? c.title : 'Concept recall'}
                            </td>
                            <td className="py-2.5 pr-2">
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  isPassing ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                                }`}
                              >
                                {att.qualityGrade} / 5
                              </span>
                            </td>
                            <td className="py-2.5 pr-2 font-mono">
                              {att.compositeScore !== undefined
                                ? `${att.compositeScore}%`
                                : att.judgeScore !== undefined
                                  ? `${att.judgeScore}%`
                                  : '—'}
                            </td>
                            <td className="py-2.5 pr-2 capitalize text-[var(--text-muted)]">
                              {att.evaluationMode}
                            </td>
                            <td className="py-2.5 pr-2 text-[var(--text-muted)] whitespace-nowrap">
                              {new Date(att.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAttempt(att.id)}
                                aria-label={`Delete attempt for ${c?.title ?? 'concept'}`}
                                className="h-6 w-6 p-0 text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 3. Recent Sessions List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[var(--text-primary)] flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[var(--accent-orange)]" aria-hidden="true" />
                  <span>Recent Study Sessions</span>
                </CardTitle>
                <CardDescription>
                  Sessions stored in browser memory or IndexedDB.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No sessions logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.slice(0, 10).map((sess) => (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] text-xs"
                      >
                        <div>
                          <strong className="text-[var(--text-primary)]">
                            State: {sess.machineState}
                          </strong>
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            {new Date(sess.startedAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSession(sess.id)}
                          aria-label={`Delete session ${sess.id.slice(0, 8)}`}
                          className="h-6 w-6 p-0 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Container>
    </WorkspaceLayout>
  );
}
