'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Layers,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Network,
  RefreshCw,
  ArrowRight,
  Loader2,
  CheckSquare,
  Square,
  Circle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getStorage } from '@/lib/db/bootstrap';
import {
  type DocumentRecord,
  type LearningUnitRecord,
  type ConceptRecord,
  type MaterialProcessingRecord,
  type ProcessingStage,
} from '@/types/domain';
import { type WorkflowSelection } from '@/features/workflow/types';
import { persistWorkflowPreference } from '@/features/workflow/launch-context';
import { resumeMaterialAnalysis, processingJobManager } from '@/features/ingestion';
import { cn } from '@/lib/utils/cn';

export interface Step2OrganiseMaterialProps {
  materialId: string;
  className?: string;
}

export type PipelineStageId = 'INGESTION' | 'ANALYZING' | 'UNITS_BUILT';

export function getProcessingStatusMessage(
  proc: MaterialProcessingRecord | null,
  isFailed: boolean,
  retryError: string | null
): string {
  if (proc?.stage === 'CANCELLED') {
    return 'Analysis paused by user. Your progress has been saved.';
  }

  if (isFailed) {
    return proc?.errorMessage ?? retryError ?? 'Analysis halted. Please retry.';
  }

  // If backend provided a rate-limiting throttle/pacing message, show it directly
  if (proc?.message && /pacing|respect gemini|waiting \d+s/i.test(proc.message)) {
    return proc.message;
  }

  const stage = proc?.stage ?? 'INGESTION';
  switch (stage) {
    case 'SELECTED':
    case 'VALIDATED':
      return 'Validating study material…';
    case 'EXTRACTED':
    case 'PREVIEWED':
    case 'SAVED':
      return 'Extracting text and chunking material…';
    case 'ANALYZING': {
      const cur = proc?.currentBatch;
      const total = proc?.totalBatches;
      if (cur && total && total > 1) {
        return `Identifying key concepts (batch ${cur} of ${total})…`;
      }
      return 'Identifying key concepts…';
    }
    case 'UNITS_BUILT':
      return 'Organising concepts, prerequisites, and learning units…';
    case 'COMPLETE':
      return 'Material analysis complete.';
    default:
      return 'Extracting text from your material…';
  }
}

export function getStageState(
  stageId: PipelineStageId,
  currentStage: ProcessingStage,
  isFailed: boolean,
  failedStage?: ProcessingStage
): 'done' | 'active' | 'waiting' | 'failed' {
  if (isFailed) {
    const failedAt = failedStage ?? (currentStage === 'CANCELLED' ? 'ANALYZING' : 'ANALYZING');
    if (stageId === 'INGESTION') {
      return failedAt === 'VALIDATED' || failedAt === 'EXTRACTED' || failedAt === 'SAVED'
        ? 'failed'
        : 'done';
    }
    if (stageId === 'ANALYZING') {
      if (failedAt === 'VALIDATED' || failedAt === 'EXTRACTED' || failedAt === 'SAVED') {
        return 'waiting';
      }
      return failedAt === 'ANALYZING' || failedAt === 'CANCELLED' ? 'failed' : 'done';
    }
    if (stageId === 'UNITS_BUILT') {
      return failedAt === 'UNITS_BUILT' ? 'failed' : 'waiting';
    }
  }

  if (currentStage === 'COMPLETE') {
    return 'done';
  }

  if (stageId === 'INGESTION') {
    if (currentStage === 'ANALYZING' || currentStage === 'UNITS_BUILT') {
      return 'done';
    }
    return 'active';
  }

  if (stageId === 'ANALYZING') {
    if (currentStage === 'UNITS_BUILT') {
      return 'done';
    }
    if (currentStage === 'ANALYZING') {
      return 'active';
    }
    return 'waiting';
  }

  if (stageId === 'UNITS_BUILT') {
    if (currentStage === 'UNITS_BUILT') {
      return 'active';
    }
    return 'waiting';
  }

  return 'waiting';
}

export function calculateOverallProgress(
  stage: ProcessingStage,
  proc: MaterialProcessingRecord | null,
  isFailed?: boolean
): number {
  if (stage === 'COMPLETE') return 100;
  if (stage === 'UNITS_BUILT') return 85;

  if (stage === 'ANALYZING' || stage === 'CANCELLED' || (isFailed && stage === 'FAILED')) {
    const total = proc?.totalBatches ?? 0;
    if (total <= 0) return 25;

    // Completed batches: count from analyzedBatchIndices or 1-based currentBatch - 1
    const completed =
      proc?.analyzedBatchIndices?.length ??
      Math.max(0, (proc?.currentBatch ?? 1) - 1);

    const fraction = Math.min(1, Math.max(0, completed / total));
    return Math.round(25 + fraction * 60);
  }

  // Early ingestion stages (SELECTED, VALIDATED, EXTRACTED, PREVIEWED, SAVED)
  switch (stage) {
    case 'SELECTED':
    case 'VALIDATED':
      return 5;
    case 'EXTRACTED':
      return 12;
    case 'PREVIEWED':
    case 'SAVED':
      return 20;
    default:
      return 10;
  }
}

export function Step2OrganiseMaterial({ materialId, className }: Step2OrganiseMaterialProps) {
  const router = useRouter();
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Material & Processing state
  const [doc, setDoc] = React.useState<DocumentRecord | null>(null);
  const [processing, setProcessing] = React.useState<MaterialProcessingRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  // Learning units & concepts state
  const [units, setUnits] = React.useState<LearningUnitRecord[]>([]);
  const [concepts, setConcepts] = React.useState<ConceptRecord[]>([]);
  const [expandedUnitIds, setExpandedUnitIds] = React.useState<Set<string>>(new Set());

  // Unit selection state
  const [selectionKind, setSelectionKind] = React.useState<'WHOLE_MATERIAL' | 'UNITS'>('WHOLE_MATERIAL');
  const [selectedUnitIds, setSelectedUnitIds] = React.useState<Set<string>>(new Set());

  // Reassurance timer for slow requests
  const [activeElapsedSeconds, setActiveElapsedSeconds] = React.useState(0);
  const isLoadingDataRef = React.useRef(false);
  const isRetryingRef = React.useRef(false);

  // Move focus to step heading on mount
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Load material, processing status, learning units, and saved workflow preference
  const loadData = React.useCallback(async () => {
    if (isLoadingDataRef.current) return;
    isLoadingDataRef.current = true;
    try {
      const repos = getStorage();
      const material = await repos.documents.get(materialId);
      setDoc(material);

      const proc = await repos.processing.getByMaterial(materialId);
      setProcessing(proc);

      if (proc?.stage === 'COMPLETE' || material?.analysisStatus === 'completed') {
        const [loadedUnits, loadedConcepts, savedWf] = await Promise.all([
          repos.learningUnits.listByMaterial(materialId),
          repos.concepts.listByMaterial(materialId),
          repos.workflowState.getByMaterial(materialId),
        ]);

        // Sort units by order
        loadedUnits.sort((a, b) => a.order - b.order);
        setUnits(loadedUnits);
        setConcepts(loadedConcepts);

        // Restore persisted selection if present, else default to WHOLE_MATERIAL
        if (savedWf?.selection) {
          if (savedWf.selection.kind === 'WHOLE_MATERIAL') {
            setSelectionKind('WHOLE_MATERIAL');
            setSelectedUnitIds(new Set(loadedUnits.map((u) => u.id)));
          } else if (savedWf.selection.kind === 'UNITS') {
            setSelectionKind('UNITS');
            setSelectedUnitIds(new Set(savedWf.selection.unitIds));
          }
        } else {
          setSelectionKind('WHOLE_MATERIAL');
          setSelectedUnitIds(new Set(loadedUnits.map((u) => u.id)));
        }
      } else if (
        proc &&
        proc.stage !== 'FAILED' &&
        proc.stage !== 'CANCELLED' &&
        !processingJobManager.hasJob(materialId)
      ) {
        // Auto-resume orphaned job from saved checkpoint
        void resumeMaterialAnalysis(materialId, {
          customRepos: repos,
          onProgress: (r) => setProcessing(r),
        }).then((res) => {
          if (!res.success) {
            setRetryError(res.error ?? 'Resume failed.');
            setProcessing(res.record);
          }
        });
      }
    } catch (err) {
      console.error('Failed to load material data:', err);
    } finally {
      isLoadingDataRef.current = false;
      setLoading(false);
    }
  }, [materialId]);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      if (mounted) {
        await loadData();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadData]);

  // Subscribe to live background processing events from processingJobManager
  React.useEffect(() => {
    let mounted = true;
    const unsub = processingJobManager.subscribe(materialId, (rec) => {
      if (!mounted) return;
      setProcessing(rec);
      if (rec.stage === 'COMPLETE') {
        void loadData();
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [materialId, loadData]);

  // Polling fallback while processing is in active state (e.g. ANALYZING)
  React.useEffect(() => {
    if (
      processing?.stage !== 'COMPLETE' &&
      processing?.stage !== 'FAILED' &&
      processing?.stage !== 'CANCELLED'
    ) {
      const interval = setInterval(() => {
        loadData();
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [processing?.stage, loadData]);

  // Toggle unit expansion
  const toggleUnitExpand = (unitId: string) => {
    setExpandedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  // Selection handlers
  const handleSelectWholeMaterial = async () => {
    setSelectionKind('WHOLE_MATERIAL');
    const allIds = new Set(units.map((u) => u.id));
    setSelectedUnitIds(allIds);

    const repos = getStorage();
    await persistWorkflowPreference(materialId, { kind: 'WHOLE_MATERIAL' }, undefined, undefined, repos);
  };

  const handleToggleUnit = async (unitId: string) => {
    const nextSelected = new Set(selectedUnitIds);
    if (nextSelected.has(unitId)) {
      nextSelected.delete(unitId);
    } else {
      nextSelected.add(unitId);
    }

    setSelectionKind('UNITS');
    setSelectedUnitIds(nextSelected);

    const repos = getStorage();
    const sel: WorkflowSelection = {
      kind: 'UNITS',
      unitIds: Array.from(nextSelected),
    };
    await persistWorkflowPreference(materialId, sel, undefined, undefined, repos);
  };

  // Cancel processing in-flight
  const handleCancelProcessing = () => {
    processingJobManager.cancelJob(materialId);
    setProcessing((prev) =>
      prev
        ? {
            ...prev,
            stage: 'CANCELLED',
            message: 'Analysis paused by user. Your progress has been saved.',
          }
        : null
    );
  };

  // Retry or Resume Processing with duplicate protection
  const handleRetryProcessing = async () => {
    if (isRetryingRef.current || isRetrying) return;
    isRetryingRef.current = true;
    setIsRetrying(true);
    setRetryError(null);
    setProcessing((prev) =>
      prev
        ? {
            ...prev,
            stage: 'ANALYZING',
            message: 'Resuming AI concept extraction…',
            errorMessage: undefined,
          }
        : null
    );
    try {
      const repos = getStorage();
      const res = await resumeMaterialAnalysis(materialId, {
        customRepos: repos,
        onProgress: (rec) => setProcessing(rec),
      });

      if (res.success) {
        await loadData();
      } else {
        setRetryError(res.error ?? 'Retry failed.');
        setProcessing(res.record);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRetryError(`Analysis error: ${msg}`);
    } finally {
      setIsRetrying(false);
      isRetryingRef.current = false;
    }
  };

  // Proceed to Step 3
  const handleContinueToMode = () => {
    router.push(`/learn/${materialId}/mode`);
  };

  const isComplete = processing?.stage === 'COMPLETE' || doc?.analysisStatus === 'completed';
  const isCancelled = processing?.stage === 'CANCELLED';
  const isFailed = (processing?.stage === 'FAILED' || isCancelled) && !isRetrying;
  const hasValidSelection =
    selectionKind === 'WHOLE_MATERIAL' || (selectionKind === 'UNITS' && selectedUnitIds.size > 0);

  // Track elapsed seconds while analyzing to provide calm feedback for slow requests
  React.useEffect(() => {
    if (isComplete || isFailed) {
      return;
    }
    const timer = setInterval(() => {
      setActiveElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isComplete, isFailed, processing?.stage, processing?.currentBatch]);

  // Concept lookup map for fast details in unit inspection
  const conceptMap = React.useMemo(() => {
    const map = new Map<string, ConceptRecord>();
    for (const c of concepts) {
      map.set(c.id, c);
    }
    return map;
  }, [concepts]);

  // Derived progress and status helpers
  const currentStage = processing?.stage ?? 'ANALYZING';
  const statusMessage = getProcessingStatusMessage(processing, isFailed, retryError);
  const overallProgress = calculateOverallProgress(currentStage, processing, isFailed);
  const hasBatches = Boolean(processing?.totalBatches && processing.totalBatches > 0);

  return (
    <div className={cn('space-y-6 max-w-4xl mx-auto py-4 sm:py-6 pb-24 sm:pb-32', className)}>
      {/* Step Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] focus:outline-none"
          >
            Organise & Review Units
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)]">
            {doc ? (
              <>
                Material: <strong className="text-[var(--text-primary)]">{doc.filename}</strong>
              </>
            ) : (
              'Review structured learning units, verify prerequisites, and choose your focus.'
            )}
          </p>
        </div>

        {/* Link to visual Concept Map */}
        {isComplete && (
          <Link
            href={`/app/path?materialId=${materialId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--primary)] transition-colors self-start sm:self-auto"
          >
            <Network className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            <span>Open Concept Map</span>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)] motion-reduce:animate-none" aria-label="Loading material units" />
          <span className="text-sm text-[var(--text-secondary)]">Loading material structure...</span>
        </div>
      ) : !isComplete ? (
        /* Processing / Progress State */
        <Card className="border-[var(--border-color)] bg-[var(--surface)]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-[var(--text-primary)]">
              {isFailed ? (
                <AlertCircle className="h-5 w-5 text-[var(--danger)] shrink-0" aria-hidden="true" />
              ) : (
                <Sparkles className="h-5 w-5 text-[var(--primary)] shrink-0" aria-hidden="true" />
              )}
              <span>{isFailed ? 'Processing Incomplete' : 'Analyzing Study Material'}</span>
            </CardTitle>
            <CardDescription className="text-sm text-[var(--text-secondary)]">
              {statusMessage}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Stage List with Real States (done / active / waiting / failed) */}
            <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/60 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Processing Pipeline Stages
              </div>
              {[
                { id: 'INGESTION' as const, label: 'Document Extraction & Chunking' },
                { id: 'ANALYZING' as const, label: 'AI Concept Extraction' },
                { id: 'UNITS_BUILT' as const, label: 'Dependency Graph & Learning Units' },
              ].map((stageItem) => {
                const state = getStageState(
                  stageItem.id,
                  currentStage,
                  isFailed,
                  processing?.failedStage
                );

                return (
                  <div
                    key={stageItem.id}
                    className={cn(
                      'flex items-center justify-between text-xs py-1.5 border-b border-[var(--border-color)]/30 last:border-0 transition-colors',
                      state === 'active' && 'bg-[var(--primary)]/5 rounded px-2 -mx-1'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {state === 'done' && (
                        <CheckCircle2 className="h-4 w-4 text-[var(--accent-green)] shrink-0" aria-hidden="true" />
                      )}
                      {state === 'active' && (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)] motion-reduce:animate-none shrink-0" aria-hidden="true" />
                      )}
                      {state === 'failed' && (
                        <AlertCircle className="h-4 w-4 text-[var(--danger)] shrink-0" aria-hidden="true" />
                      )}
                      {state === 'waiting' && (
                        <Circle className="h-4 w-4 text-[var(--text-muted)] opacity-40 shrink-0" aria-hidden="true" />
                      )}
                      <span
                        className={cn(
                          state === 'active' ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {stageItem.label}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'capitalize text-[11px] font-mono px-2 py-0.5 rounded',
                        state === 'done' && 'text-[var(--accent-green)] bg-[var(--accent-green)]/10',
                        state === 'active' && 'text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10',
                        state === 'failed' && 'text-[var(--danger)] bg-[var(--danger)]/10',
                        state === 'waiting' && 'text-[var(--text-muted)]'
                      )}
                    >
                      {state === 'active' ? 'In progress' : state}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Real Determinate Progress derived from completed stages and batches */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center text-xs text-[var(--text-muted)] font-medium">
                <span>
                  {hasBatches
                    ? `Batch ${processing!.currentBatch} of ${processing!.totalBatches}`
                    : 'Pipeline progress'}
                </span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {overallProgress}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={
                  hasBatches
                    ? `Analysis progress: batch ${processing!.currentBatch} of ${processing!.totalBatches} (${overallProgress}%)`
                    : `Analysis progress (${overallProgress}%)`
                }
                aria-valuenow={overallProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden relative"
              >
                <div
                  className={cn(
                    'h-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
                    isFailed ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(100, overallProgress))}%`,
                  }}
                />
              </div>

              {/* Non-alarming reassurance for slow requests */}
              {activeElapsedSeconds >= 12 && !isFailed && (
                <p className="text-xs text-[var(--text-muted)] pt-0.5">
                  Analyzing complex concepts can take a few moments. Still working on it…
                </p>
              )}

              {/* In-flight cancellation button */}
              {!isFailed && !isComplete && (
                <div className="flex items-center justify-end pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelProcessing}
                    className="text-xs h-7 text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30"
                  >
                    Cancel Analysis
                  </Button>
                </div>
              )}
            </div>

            {/* Error, Pause & Retry */}
            {isFailed && (
              <div
                role="alert"
                aria-live="assertive"
                className={cn(
                  'rounded-lg border p-4 space-y-3',
                  isCancelled
                    ? 'border-[var(--border-color)] bg-[var(--surface-raised)]'
                    : 'border-[var(--danger)]/30 bg-[var(--danger)]/10'
                )}
              >
                <div className={cn('text-sm', isCancelled ? 'text-[var(--text-primary)]' : 'text-[var(--danger)]')}>
                  <p className="font-semibold">{isCancelled ? 'Analysis paused:' : 'Analysis halted:'}</p>
                  <p className="text-xs mt-1">
                    {isCancelled
                      ? 'Analysis was stopped. Any completed batches are saved and can be resumed.'
                      : (processing?.errorMessage ?? retryError ?? 'An unexpected error occurred during concept extraction.')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleRetryProcessing}
                    disabled={isRetrying}
                    className={cn(
                      'text-white min-h-[44px] px-4',
                      isCancelled
                        ? 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
                        : 'bg-[var(--danger)] hover:bg-[var(--danger)]/90'
                    )}
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none mr-1.5" aria-hidden="true" />
                        <span>{isCancelled ? 'Resuming…' : 'Retrying…'}</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        <span>{isCancelled ? 'Resume Analysis' : 'Resume / Retry Analysis'}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Completed Units & Concept Inspection */
        <div className="space-y-6">
          {/* Selection Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {units.length} Learning Units &bull; {concepts.length} Concepts
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={selectionKind === 'WHOLE_MATERIAL' ? 'secondary' : 'ghost'}
                size="md"
                onClick={handleSelectWholeMaterial}
                className={cn(
                  'text-sm font-semibold min-h-[44px] px-4 border',
                  selectionKind === 'WHOLE_MATERIAL'
                    ? 'border-[var(--accent-cyan)] text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
                    : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                {selectionKind === 'WHOLE_MATERIAL' ? 'Whole Material Selected' : 'Select Whole Material'}
              </Button>
              <span className="text-xs text-[var(--text-muted)]">
                {selectionKind === 'WHOLE_MATERIAL'
                  ? 'All units selected'
                  : `${selectedUnitIds.size} of ${units.length} units selected`}
              </span>
            </div>
          </div>

          {/* Units List */}
          <div className="space-y-3" role="list" aria-label="Learning units list">
            {units.map((unit) => {
              const isSelected = selectedUnitIds.has(unit.id);
              const isExpanded = expandedUnitIds.has(unit.id);
              const unitConcepts = unit.conceptIds
                .map((cid) => conceptMap.get(cid))
                .filter((c): c is ConceptRecord => Boolean(c));

              return (
                <div
                  key={unit.id}
                  role="listitem"
                  className={cn(
                    'rounded-xl border transition-all overflow-hidden',
                    isSelected
                      ? 'border-[var(--primary)]/50 bg-[var(--surface)] shadow-sm'
                      : 'border-[var(--border-color)] bg-[var(--surface)] opacity-85 hover:opacity-100'
                  )}
                >
                  {/* Unit Card Header */}
                  <div className="p-4 flex items-start gap-3 justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Checkbox with accessible 44px tap target */}
                      <button
                        type="button"
                        onClick={() => handleToggleUnit(unit.id)}
                        aria-label={`Select unit ${unit.order + 1}: ${unit.title}`}
                        className="mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] rounded cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
                        ) : (
                          <Square className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded shrink-0">
                            Unit {unit.order + 1}
                          </span>
                          <h3 className="font-semibold text-base text-[var(--text-primary)] break-words">
                            {unit.title}
                          </h3>
                        </div>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed break-words">
                          {unit.summary}
                        </p>
                      </div>
                    </div>

                    {/* Expand/Collapse Button with 44px tap target */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                        {unit.conceptIds.length} concepts
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleUnitExpand(unit.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse unit concepts' : 'Expand unit concepts'}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[44px] min-w-[44px] p-2 flex items-center justify-center"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Unit Concepts */}
                  {isExpanded && (
                    <div className="border-t border-[var(--border-color)] bg-[var(--surface-raised)]/50 p-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                        Prerequisite Concept Order:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {unitConcepts.map((c, idx) => (
                          <div
                            key={c.id}
                            className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-[var(--text-primary)] truncate">
                                {idx + 1}. {c.title}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[var(--surface-raised)] text-[var(--text-muted)] shrink-0">
                                Tier {c.tier}
                              </span>
                            </div>
                            <p className="text-[var(--text-secondary)] line-clamp-2 text-[11px]">
                              {c.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Continue Action */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border-color)]">
            <span className="text-xs sm:text-sm text-[var(--text-secondary)]">
              {hasValidSelection
                ? selectionKind === 'WHOLE_MATERIAL'
                  ? 'Ready to proceed with entire study material.'
                  : `Ready to proceed with ${selectedUnitIds.size} selected units.`
                : 'Please select at least one unit to proceed.'}
            </span>

            <Button
              variant="primary"
              size="lg"
              onClick={handleContinueToMode}
              disabled={!hasValidSelection}
              className="w-full sm:w-auto min-h-[44px] bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center justify-center gap-2 font-medium"
            >
              <span>Continue to Mode Selection</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
