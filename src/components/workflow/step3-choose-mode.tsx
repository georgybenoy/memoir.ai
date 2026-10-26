'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { getStorage } from '@/lib/db/bootstrap';
import { generateId } from '@/lib/utils/id';
import { nowISO } from '@/lib/utils/clock';
import {
  type DocumentRecord,
  type LearningUnitRecord,
  type ConceptRecord,
  type StudySessionRecord,
} from '@/types/domain';
import {
  type LearningMode,
  type WorkflowSelection,
  type LearningLaunchContext,
} from '@/features/workflow/types';
import {
  validateLaunchContext,
  persistWorkflowPreference,
} from '@/features/workflow/launch-context';
import { getDueReviewQueue } from '@/features/spaced-repetition/queue';
import { cn } from '@/lib/utils/cn';

export interface Step3ChooseModeProps {
  materialId: string;
  className?: string;
}

export function Step3ChooseMode({ materialId, className }: Step3ChooseModeProps) {
  const router = useRouter();
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Focus heading on mount for accessibility
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Material & Workflow state
  const [doc, setDoc] = React.useState<DocumentRecord | null>(null);
  const [units, setUnits] = React.useState<LearningUnitRecord[]>([]);
  const [concepts, setConcepts] = React.useState<ConceptRecord[]>([]);
  const [selection, setSelection] = React.useState<WorkflowSelection>({ kind: 'WHOLE_MATERIAL' });
  const [lastSession, setLastSession] = React.useState<StudySessionRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Due Review state for Revision
  const [dueConceptsCount, setDueConceptsCount] = React.useState<number>(0);
  const [nextDueText, setNextDueText] = React.useState<string | null>(null);
  const [firstDueConceptId, setFirstDueConceptId] = React.useState<string | null>(null);

  // Launching state
  const [launchingMode, setLaunchingMode] = React.useState<LearningMode | null>(null);
  const [launchError, setLaunchError] = React.useState<string | null>(null);

  // Load data from DB
  React.useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const repos = getStorage();
        const [material, materialUnits, materialConcepts, wfState, sessions] =
          await Promise.all([
            repos.documents.get(materialId),
            repos.learningUnits.listByMaterial(materialId),
            repos.concepts.listByMaterial(materialId),
            repos.workflowState.getByMaterial(materialId),
            repos.sessions.listByMaterial(materialId),
          ]);

        if (!mounted) return;
        setDoc(material);
        setUnits(materialUnits);
        setConcepts(materialConcepts);

        // Determine selection
        const activeSel: WorkflowSelection =
          wfState?.selection ?? { kind: 'WHOLE_MATERIAL' };
        setSelection(activeSel);

        // Determine relevant concepts for the active selection
        let selectedConceptIds: Set<string>;
        if (activeSel.kind === 'UNITS' && activeSel.unitIds.length > 0) {
          const selectedUnits = materialUnits.filter((u) =>
            activeSel.unitIds.includes(u.id)
          );
          selectedConceptIds = new Set(selectedUnits.flatMap((u) => u.conceptIds));
        } else {
          selectedConceptIds = new Set(materialConcepts.map((c) => c.id));
        }

        // Find last session
        if (sessions && sessions.length > 0) {
          // Sort descending by startedAt
          sessions.sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
          setLastSession(sessions[0]);
        }

        // Fetch real Spaced Revision queue filtered by active selection
        const queue = await getDueReviewQueue();
        const dueItems = queue.allItemsOrdered.filter((item) =>
          selectedConceptIds.has(item.concept.id)
        );
        const upcomingItems = queue.upcoming.filter((item) =>
          selectedConceptIds.has(item.concept.id)
        );

        setDueConceptsCount(dueItems.length);
        if (dueItems.length > 0) {
          setFirstDueConceptId(dueItems[0].concept.id);
        } else if (upcomingItems.length > 0) {
          setNextDueText(upcomingItems[0].humanDueText);
        } else {
          setNextDueText(null);
        }
      } catch (err) {
        console.error('Failed to load mode readiness data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [materialId]);

  // Handle launch of chosen mode
  const handleLaunchMode = async (chosenMode: LearningMode) => {
    setLaunchingMode(chosenMode);
    setLaunchError(null);

    try {
      const repos = getStorage();

      // Determine initial concept
      let targetConceptId: string | undefined;
      if (chosenMode === 'revision' && firstDueConceptId) {
        targetConceptId = firstDueConceptId;
      } else if (selection.kind === 'UNITS' && selection.unitIds.length > 0) {
        const firstSelectedUnit = units.find((u) => selection.unitIds.includes(u.id));
        targetConceptId = firstSelectedUnit?.conceptIds[0] ?? concepts[0]?.id;
      } else {
        targetConceptId = concepts[0]?.id;
      }

      const sessionId = generateId();
      const newSession: StudySessionRecord = {
        id: sessionId,
        materialId,
        currentConceptId: targetConceptId ?? 'default',
        machineState: chosenMode === 'study' ? 'IDLE' : 'WAITING_FOR_RECALL',
        sourceMode: 'document',
        startedAt: nowISO(),
        updatedAt: nowISO(),
      };

      // Put session into storage
      await repos.sessions.put(newSession);

      // Validate launch contract at the boundary
      const candidate: LearningLaunchContext = {
        materialId,
        selection,
        mode: chosenMode,
        sessionId,
      };

      const validation = await validateLaunchContext(candidate, repos);
      if (!validation.valid) {
        setLaunchError(validation.reason ?? 'Launch contract validation failed.');
        setLaunchingMode(null);
        return;
      }

      // Persist workflow state
      await persistWorkflowPreference(
        materialId,
        selection,
        chosenMode,
        sessionId,
        repos
      );

      // Route to Step 4
      router.push(`/learn/${materialId}/session/${sessionId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLaunchError(`Failed to launch session: ${msg}`);
      setLaunchingMode(null);
    }
  };

  const selectedConceptsCount =
    selection.kind === 'UNITS'
      ? units
          .filter((u) => selection.unitIds.includes(u.id))
          .flatMap((u) => u.conceptIds).length
      : concepts.length;

  return (
    <div className={cn('space-y-8 max-w-5xl mx-auto py-4 sm:py-6 pb-24 sm:pb-32', className)}>
      {/* Step Heading */}
      <div className="space-y-1">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] focus:outline-none"
        >
          Choose Learning Mode
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          {doc ? (
            <>
              Material: <strong className="text-[var(--text-primary)]">{doc.filename}</strong> &bull; {selectedConceptsCount} concepts in active focus.
            </>
          ) : (
            'Select how you want to interact with your study material today.'
          )}
        </p>
      </div>

      {/* Launch Error Notice */}
      {launchError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 flex items-start gap-3 text-sm text-[var(--danger)]"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <span className="font-semibold">Launch error: </span>
            {launchError}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Checking mode readiness" />
          <span className="text-sm text-[var(--text-secondary)]">Analyzing learning readiness...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Socratic Study */}
          <Card className="flex flex-col justify-between border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary)]/50 transition-all rounded-xl shadow-sm">
            <CardHeader className="space-y-3 pb-3">
              <div className="p-3 w-fit rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                <BookOpen className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">
                  Socratic Study
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Guided conversational dialogue that explores concepts step-by-step with adaptive AI questions and analogies.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3 space-y-2">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Scope:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {selectedConceptsCount} concepts available
                  </span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Focus:</span>
                  <span className="font-medium text-[var(--accent-cyan)]">Conceptual Depth</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Last Studied:</span>
                  <span className="font-medium text-[var(--text-muted)]">
                    {lastSession ? new Date(lastSession.startedAt).toLocaleDateString() : 'No sessions yet'}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t border-[var(--border-color)]">
              <Button
                variant="primary"
                onClick={() => handleLaunchMode('study')}
                disabled={launchingMode !== null}
                isLoading={launchingMode === 'study'}
                loadingText="Launching Study Mode…"
                className="w-full min-h-[44px] bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center justify-center gap-2 font-medium"
              >
                <span>Start Socratic Study</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>

          {/* Card 2: Active Recall */}
          <Card className="flex flex-col justify-between border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary)]/50 transition-all rounded-xl shadow-sm">
            <CardHeader className="space-y-3 pb-3">
              <div className="p-3 w-fit rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
                <Brain className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">
                  Active Recall Practice
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Test your retrieval strength with open questions, calibrated confidence ratings, and rubric evaluations.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3 space-y-2">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Scope:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {selectedConceptsCount} concepts ready
                  </span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Evaluation:</span>
                  <span className="font-medium text-[var(--accent-cyan)]">Hybrid Judge + ONNX</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Last Practiced:</span>
                  <span className="font-medium text-[var(--text-muted)]">
                    {lastSession ? new Date(lastSession.startedAt).toLocaleDateString() : 'No sessions yet'}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t border-[var(--border-color)]">
              <Button
                variant="secondary"
                onClick={() => handleLaunchMode('recall')}
                disabled={launchingMode !== null}
                isLoading={launchingMode === 'recall'}
                loadingText="Launching Recall Practice…"
                className="w-full min-h-[44px] border-[var(--border-color)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] flex items-center justify-center gap-2 font-medium"
              >
                <span>Start Active Recall</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>

          {/* Card 3: Spaced Revision (SM-2 retention with Calendar icon and Honest 0-due state) */}
          <Card className="flex flex-col justify-between border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary)]/50 transition-all rounded-xl shadow-sm">
            <CardHeader className="space-y-3 pb-3">
              <div className="p-3 w-fit rounded-xl bg-[var(--warning)]/10 text-[var(--warning)]">
                <Calendar className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">
                  Spaced Revision
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Retention reinforcement scheduled by SM-2 to review concepts right before forgetting occurs.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 py-2 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] p-3 space-y-2">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Scheduled Reviews:</span>
                  <span className={cn('font-semibold', dueConceptsCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]')}>
                    {dueConceptsCount} due today
                  </span>
                </div>

                {/* Honest 0-Due State */}
                {dueConceptsCount === 0 ? (
                  <div className="pt-2 border-t border-[var(--border-color)] space-y-2">
                    <div className="flex items-start gap-1.5 text-[var(--text-muted)]">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-[var(--text-muted)]" aria-hidden="true" />
                      <span>
                        {nextDueText ? (
                          <>Next review due: <strong className="text-[var(--text-primary)]">{nextDueText}</strong></>
                        ) : (
                          'No concepts are currently due for spaced review in this selection.'
                        )}
                      </span>
                    </div>

                    <div className="text-[11px] text-[var(--text-secondary)] font-medium pt-1">
                      Explore another mode instead:
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLaunchMode('study')}
                        disabled={launchingMode !== null}
                        className="flex-1 min-h-[44px] text-xs bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--primary)] font-medium"
                      >
                        Study Instead
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLaunchMode('recall')}
                        disabled={launchingMode !== null}
                        className="flex-1 min-h-[44px] text-xs bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--primary)] font-medium"
                      >
                        Recall Instead
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[var(--accent-green)] pt-1">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Ready for retention review</span>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t border-[var(--border-color)]">
              {dueConceptsCount > 0 ? (
                <Button
                  variant="primary"
                  onClick={() => handleLaunchMode('revision')}
                  disabled={launchingMode !== null}
                  isLoading={launchingMode === 'revision'}
                  loadingText="Launching Spaced Revision…"
                  className="w-full min-h-[44px] bg-[var(--warning)] text-black hover:bg-[var(--warning)]/90 flex items-center justify-center gap-2 font-semibold"
                >
                  <span>Start Spaced Revision</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <div className="w-full py-2.5 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] text-center text-xs text-[var(--text-muted)] font-medium">
                  0 items due &bull; Ready when reviews are scheduled
                </div>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
