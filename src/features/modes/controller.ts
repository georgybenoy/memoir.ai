/**
 * Shared Learning Session Controller (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4
 *
 * Owns session lifecycle, concept progression, state persistence,
 * recoverable draft answers, and stale-request protection across Study, Recall, and Revision.
 *
 * Guarantees:
 * 1. Every attempt, message, and review record carries sessionId + materialId + conceptId.
 * 2. Paused sessions restore cleanly without data loss.
 * 3. Abandoned sessions keep all created learning records.
 * 4. Stale async responses from prior concepts or sessions are safely discarded.
 */

import * as React from 'react';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import {
  type StudySessionRecord,
  type ConceptRecord,
  type LearningUnitRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
  type SessionStatus,
} from '@/types/domain';
import { type LearningMode, type WorkflowSelection } from '@/features/workflow/types';
import {
  type ModeModule,
  type ModeContext,
  type ModeProgress,
  type SessionSummary,
} from './types';
import { studyMode } from './study-mode';
import { recallMode } from './recall-mode';
import { revisionMode } from './revision-mode';
import { buildSessionSummaryFromDatabase } from './summary-service';

export function getModeModule(mode: LearningMode): ModeModule {
  switch (mode) {
    case 'study':
      return studyMode;
    case 'recall':
      return recallMode;
    case 'revision':
      return revisionMode;
    default:
      return studyMode;
  }
}

export interface UseSessionControllerOptions {
  materialId: string;
  sessionId: string;
  initialMode?: LearningMode;
  dbName?: string;
}

export interface SessionControllerState {
  sessionId: string;
  materialId: string;
  mode: LearningMode;
  status: SessionStatus;
  currentConcept: ConceptRecord | null;
  currentUnit: LearningUnitRecord | null;
  currentQuestion: RecallQuestionRecord | null;
  orderedConcepts: ConceptRecord[];
  progress: ModeProgress;
  draftAnswer: string;
  selectedConfidence: number | null;
  summary: SessionSummary | null;
  isLoading: boolean;
  error: string | null;
  isCompleted: boolean;
}

export function useSessionController({
  materialId,
  sessionId,
  initialMode,
  dbName = DB_NAME,
}: UseSessionControllerOptions) {
  const [mode, setMode] = React.useState<LearningMode>(initialMode ?? 'study');
  const [status, setStatus] = React.useState<SessionStatus>('active');
  const [currentConcept, setCurrentConcept] = React.useState<ConceptRecord | null>(null);
  const [currentUnit, setCurrentUnit] = React.useState<LearningUnitRecord | null>(null);
  const [currentQuestion, setCurrentQuestion] = React.useState<RecallQuestionRecord | null>(null);
  const [orderedConcepts, setOrderedConcepts] = React.useState<ConceptRecord[]>([]);
  const [progress, setProgress] = React.useState<ModeProgress>({
    total: 1,
    completed: 0,
    percent: 0,
    stageLabel: 'Initializing session...',
  });
  const [draftAnswer, setDraftAnswer] = React.useState<string>('');
  const [selectedConfidence, setSelectedConfidence] = React.useState<number | null>(null);
  const [summary, setSummary] = React.useState<SessionSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Stale Request Guard
  const activeRequestIdRef = React.useRef<string>(generateId());
  const draftTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Initialize or restore session context
  const loadController = React.useCallback(async () => {
    const requestId = generateId();
    activeRequestIdRef.current = requestId;

    try {
      const db = await openDatabase(dbName);
      const session = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
      const wfState = await db.get('workflowState', materialId);

      const effectiveMode: LearningMode =
        session?.mode ??
        (session?.machineState === 'WAITING_FOR_RECALL'
          ? 'recall'
          : session?.machineState === 'REVISION_DUE'
          ? 'revision'
          : wfState?.lastChosenMode ?? initialMode ?? 'study');

      setMode(effectiveMode);

      // Load material bundle
      const allConcepts = (await db.getAllFromIndex('concepts', 'by-material', materialId)) as ConceptRecord[];
      const allUnits = (await db.getAllFromIndex('learningUnits', 'by-material', materialId)) as LearningUnitRecord[];
      const allDeps = (await db.getAll('conceptDependencies')) as ConceptDependencyRecord[];
      const allChunks = (await db.getAllFromIndex('documentChunks', 'by-material', materialId)) as DocumentChunkRecord[];

      const selection: WorkflowSelection =
        wfState?.selection ??
        (session?.unitIds && session.unitIds.length > 0
          ? { kind: 'UNITS', unitIds: session.unitIds }
          : { kind: 'WHOLE_MATERIAL' });

      const ctx: ModeContext = {
        materialId,
        sessionId,
        selection,
        mode: effectiveMode,
        concepts: allConcepts,
        units: allUnits,
        dependencies: allDeps,
        chunks: allChunks,
      };

      const modeModule = getModeModule(effectiveMode);
      let activeSession: StudySessionRecord;

      if (!session) {
        activeSession = await modeModule.start(ctx);
      } else {
        activeSession = await modeModule.resume(session, ctx);
      }

      // Stale request guard check
      if (activeRequestIdRef.current !== requestId) return;

      const ordered =
        effectiveMode === 'revision' && 'getDueConcepts' in modeModule
          ? await (modeModule as { getDueConcepts: (ctx: ModeContext) => Promise<ConceptRecord[]> }).getDueConcepts(ctx)
          : modeModule.getOrderedConcepts(ctx);

      setOrderedConcepts(ordered);

      // Resolve current concept
      let targetConcept: ConceptRecord | null = null;
      if (activeSession.currentConceptId) {
        targetConcept = ordered.find((c) => c.id === activeSession.currentConceptId) ?? null;
      }
      if (!targetConcept && ordered.length > 0) {
        targetConcept = ordered[0];
      }
      setCurrentConcept(targetConcept);

      const targetUnit = allUnits.find((u) => u.conceptIds.includes(targetConcept?.id ?? '')) ?? null;
      setCurrentUnit(targetUnit);

      // Restore draft answer and confidence
      setDraftAnswer(activeSession.draftAnswer ?? '');
      setSelectedConfidence(activeSession.selectedConfidence ?? null);
      setStatus(activeSession.status ?? 'active');

      // Update progress
      const prog = modeModule.getProgress(activeSession, ctx);
      setProgress(prog);

      // If already ended, generate summary
      if (activeSession.endedAt || activeSession.status === 'completed' || activeSession.status === 'abandoned') {
        const sum = await buildSessionSummaryFromDatabase(sessionId, materialId, dbName);
        setSummary(sum);
      }
    } catch (err) {
      console.error('Failed to load session controller context:', err);
      setError('Unable to load learning session.');
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [materialId, sessionId, initialMode, dbName]);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      if (mounted) {
        await loadController();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadController]);

  // Handle draft answer change with debounced persistence
  const updateDraftAnswer = React.useCallback(
    (text: string) => {
      setDraftAnswer(text);
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
      draftTimerRef.current = setTimeout(async () => {
        try {
          const db = await openDatabase(dbName);
          const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
          if (s) {
            s.draftAnswer = text;
            s.updatedAt = nowIso();
            await db.put('studySessions', s);
          }
        } catch (err) {
          console.warn('Failed to persist draft answer:', err);
        }
      }, 350);
    },
    [sessionId, dbName],
  );

  // Handle confidence change with persistence
  const updateConfidence = React.useCallback(
    async (confidence: number) => {
      setSelectedConfidence(confidence);
      try {
        const db = await openDatabase(dbName);
        const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
        if (s) {
          s.selectedConfidence = confidence;
          s.updatedAt = nowIso();
          await db.put('studySessions', s);
        }
      } catch (err) {
        console.warn('Failed to persist selected confidence:', err);
      }
    },
    [sessionId, dbName],
  );

  // Pause session action
  const pauseSession = React.useCallback(async () => {
    try {
      const db = await openDatabase(dbName);
      const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
      if (s) {
        s.status = 'paused';
        s.updatedAt = nowIso();
        s.draftAnswer = draftAnswer;
        await db.put('studySessions', s);
      }
      setStatus('paused');
    } catch (err) {
      console.error('Failed to pause session:', err);
    }
  }, [sessionId, draftAnswer, dbName]);

  // Complete session action
  const completeSession = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await openDatabase(dbName);
      const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
      if (s) {
        s.status = 'completed';
        s.endedAt = nowIso();
        s.updatedAt = nowIso();
        await db.put('studySessions', s);
      }
      setStatus('completed');

      const sum = await buildSessionSummaryFromDatabase(sessionId, materialId, dbName);
      setSummary(sum);
    } catch (err) {
      console.error('Failed to complete session:', err);
      setError('Failed to record session completion.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, materialId, dbName]);

  // Abandon session action (marks abandoned but preserves records)
  const abandonSession = React.useCallback(async () => {
    try {
      const db = await openDatabase(dbName);
      const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
      if (s) {
        s.status = 'abandoned';
        s.endedAt = nowIso();
        s.updatedAt = nowIso();
        await db.put('studySessions', s);
      }
      setStatus('abandoned');
    } catch (err) {
      console.error('Failed to record abandoned session:', err);
    }
  }, [sessionId, dbName]);

  // Advance to next concept
  const advanceToNextConcept = React.useCallback(async () => {
    if (!currentConcept) return;

    const currIdx = orderedConcepts.findIndex((c) => c.id === currentConcept.id);
    if (currIdx >= 0 && currIdx < orderedConcepts.length - 1) {
      const nextConcept = orderedConcepts[currIdx + 1];
      setCurrentConcept(nextConcept);
      setDraftAnswer('');
      setSelectedConfidence(null);
      setCurrentQuestion(null);

      try {
        const db = await openDatabase(dbName);
        const s = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
        if (s) {
          s.currentConceptId = nextConcept.id;
          s.draftAnswer = '';
          s.selectedConfidence = undefined;
          s.updatedAt = nowIso();
          await db.put('studySessions', s);
        }
      } catch (err) {
        console.warn('Failed to update session concept advancement:', err);
      }
    } else {
      // Reached end of in-scope concepts -> complete session
      await completeSession();
    }
  }, [currentConcept, orderedConcepts, sessionId, completeSession, dbName]);

  return {
    sessionId,
    materialId,
    mode,
    status,
    currentConcept,
    currentUnit,
    currentQuestion,
    orderedConcepts,
    progress,
    draftAnswer,
    selectedConfidence,
    summary,
    isLoading,
    error,
    isCompleted: status === 'completed',
    updateDraftAnswer,
    updateConfidence,
    pauseSession,
    completeSession,
    abandonSession,
    advanceToNextConcept,
    setCurrentQuestion,
  };
}
