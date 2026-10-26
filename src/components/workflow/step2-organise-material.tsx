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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getStorage } from '@/lib/db/bootstrap';
import {
  type DocumentRecord,
  type LearningUnitRecord,
  type ConceptRecord,
  type MaterialProcessingRecord,
} from '@/types/domain';
import { type WorkflowSelection } from '@/features/workflow/types';
import { persistWorkflowPreference } from '@/features/workflow/launch-context';
import { resumeMaterialAnalysis } from '@/features/ingestion/processing-service';
import { cn } from '@/lib/utils/cn';

export interface Step2OrganiseMaterialProps {
  materialId: string;
  className?: string;
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

  // Move focus to step heading on mount
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Load material, processing status, learning units, and saved workflow preference
  const loadData = React.useCallback(async () => {
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
      }
    } catch (err) {
      console.error('Failed to load material data:', err);
    } finally {
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

  // Polling while processing is in active state (e.g. ANALYZING)
  React.useEffect(() => {
    if (processing?.stage !== 'COMPLETE' && processing?.stage !== 'FAILED') {
      const interval = setInterval(() => {
        loadData();
      }, 1000);
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

  // Retry or Resume Processing
  const handleRetryProcessing = async () => {
    setIsRetrying(true);
    setRetryError(null);
    setProcessing((prev) =>
      prev
        ? {
            ...prev,
            stage: 'ANALYZING',
            message: 'Resuming AI concept extraction...',
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
    }
  };

  // Proceed to Step 3
  const handleContinueToMode = () => {
    router.push(`/learn/${materialId}/mode`);
  };

  const isComplete = processing?.stage === 'COMPLETE' || doc?.analysisStatus === 'completed';
  const isFailed = processing?.stage === 'FAILED' && !isRetrying;
  const hasValidSelection =
    selectionKind === 'WHOLE_MATERIAL' || (selectionKind === 'UNITS' && selectedUnitIds.size > 0);

  // Concept lookup map for fast details in unit inspection
  const conceptMap = React.useMemo(() => {
    const map = new Map<string, ConceptRecord>();
    for (const c of concepts) {
      map.set(c.id, c);
    }
    return map;
  }, [concepts]);

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
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Loading material units" />
          <span className="text-sm text-[var(--text-secondary)]">Loading material structure...</span>
        </div>
      ) : !isComplete ? (
        /* Processing / Progress State */
        <Card className="border-[var(--border-color)] bg-[var(--surface)]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-[var(--text-primary)]">
              {isFailed ? (
                <AlertCircle className="h-5 w-5 text-[var(--danger)]" aria-hidden="true" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" aria-hidden="true" />
              )}
              <span>{isFailed ? 'Processing Incomplete' : 'Analyzing Study Material'}</span>
            </CardTitle>
            <CardDescription className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
              {!isFailed && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)] shrink-0" aria-hidden="true" />
              )}
              <span>{processing?.message ?? 'Extracting key concepts, dependencies, and learning units.'}</span>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Stage List with Real States (done / active / waiting / failed) */}
            <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/60 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Processing Pipeline Stages
              </div>
              {[
                { id: 'INGESTION', label: 'Document Extraction & Chunking' },
                { id: 'ANALYZING', label: 'AI Concept Extraction' },
                { id: 'UNITS_BUILT', label: 'Dependency Graph & Learning Units' },
              ].map((stageItem) => {
                const currentStage = processing?.stage ?? 'ANALYZING';
                let state: 'done' | 'active' | 'waiting' | 'failed' = 'waiting';

                if (isFailed) {
                  if (stageItem.id === 'ANALYZING') state = 'failed';
                  else if (stageItem.id === 'INGESTION') state = 'done';
                  else state = 'waiting';
                } else if (currentStage === 'COMPLETE') {
                  state = 'done';
                } else if (currentStage === 'UNITS_BUILT') {
                  if (stageItem.id === 'INGESTION' || stageItem.id === 'ANALYZING') state = 'done';
                  else state = 'active';
                } else if (currentStage === 'ANALYZING') {
                  if (stageItem.id === 'INGESTION') state = 'done';
                  else if (stageItem.id === 'ANALYZING') state = 'active';
                  else state = 'waiting';
                } else {
                  if (stageItem.id === 'INGESTION') state = 'active';
                  else state = 'waiting';
                }

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
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)] shrink-0" aria-hidden="true" />
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
                        'capitalize text-[11px] font-mono px-2 py-0.5 rounded flex items-center gap-1.5',
                        state === 'done' && 'text-[var(--accent-green)] bg-[var(--accent-green)]/10',
                        state === 'active' && 'text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10',
                        state === 'failed' && 'text-[var(--danger)] bg-[var(--danger)]/10',
                        state === 'waiting' && 'text-[var(--text-muted)]'
                      )}
                    >
                      {state === 'active' && (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-cyan)] shrink-0" aria-hidden="true" />
                      )}
                      <span>{state}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Real Determinate Progress ONLY for real counts */}
            {processing?.currentBatch && processing?.totalBatches ? (
              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs text-[var(--text-muted)] font-medium">
                  <span className="flex items-center gap-1.5">
                    {!isFailed && <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)] shrink-0" aria-hidden="true" />}
                    <span>
                      Batch {processing.currentBatch} of {processing.totalBatches}
                    </span>
                  </span>
                  <span className="font-mono">{Math.round((processing.currentBatch / processing.totalBatches) * 100)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Analysis progress: batch ${processing.currentBatch} of ${processing.totalBatches}`}
                  aria-valuenow={processing.currentBatch}
                  aria-valuemin={0}
                  aria-valuemax={processing.totalBatches}
                  className="h-2 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden relative"
                >
                  <div
                    className="h-full bg-[var(--primary)] transition-all duration-300 relative overflow-hidden"
                    style={{
                      width: `${Math.min(100, Math.round((processing.currentBatch / processing.totalBatches) * 100))}%`,
                    }}
                  >
                    {!isFailed && (
                      <span className="absolute inset-0 bg-white/20 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Error & Retry */}
            {isFailed && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-4 space-y-3"
              >
                <div className="text-sm text-[var(--danger)]">
                  <p className="font-semibold">Analysis halted:</p>
                  <p className="text-xs mt-1">{processing?.errorMessage ?? retryError ?? 'An unexpected error occurred during concept extraction.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRetryProcessing}
                    disabled={isRetrying}
                    className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90 min-h-[44px] px-4"
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />
                        <span>Retrying...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        <span>Resume / Retry Analysis</span>
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
