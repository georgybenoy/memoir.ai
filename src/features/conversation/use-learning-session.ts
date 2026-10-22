'use client';

import * as React from 'react';
import { generateId } from '@/lib/utils/id';
import { useSessionStore } from '@/lib/state/session-store';
import {
  type MachineState,
  type MachineEvent,
  type MachineContext,
} from './types';
import { transition } from './machine';
import {
  loadSessionWithContext,
  persistDraftAnswer,
  persistSelectedConfidence,
  persistMachineState,
  logLearningEvent,
} from './learning-session-service';
import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
  type StudySessionRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { calculateAdaptiveDifficulty } from '@/features/recall/difficulty';
import { getOrGenerateRecallQuestion } from '@/features/recall/question-service';
import {
  type AnswerEvaluator,
  type AnswerEvaluationOutput,
  HybridAnswerEvaluator,
} from '@/features/evaluation';

import { getStorage } from '@/lib/db/bootstrap';
import { openDatabase } from '@/lib/db/indexeddb';
import { type DifficultyPreference } from '@/types/domain';
import { type EvaluatedMisconception } from '@/lib/ai/schemas';
import {
  diagnoseRevisionNeeds,
  getRevisionExplanation,
  type RevisionPlan,
} from '@/features/spaced-repetition/revision';

function parseAttemptRubric(rubricObj: unknown): {
  strengths: string[];
  missingKeyPoints: string[];
  misconceptions: string[];
  misconceptionDetails?: EvaluatedMisconception[];
  rationale: string;
  nextAction: string;
  correctionGuidance?: string;
} {
  const rubric =
    rubricObj && typeof rubricObj === 'object'
      ? (rubricObj as Record<string, unknown>)
      : {};
  const rawMisconceptions = Array.isArray(rubric.misconceptions) ? rubric.misconceptions : [];
  const misconceptions = rawMisconceptions
    .map((m) => {
      if (typeof m === 'string') return m;
      if (
        m &&
        typeof m === 'object' &&
        'description' in m &&
        typeof (m as { description: unknown }).description === 'string'
      ) {
        return (m as { description: string }).description;
      }
      return '';
    })
    .filter(Boolean);

  const misconceptionDetails = rawMisconceptions.filter(
    (m): m is EvaluatedMisconception =>
      typeof m === 'object' &&
      m !== null &&
      'description' in m &&
      'severity' in m &&
      'correction' in m,
  );

  return {
    strengths: Array.isArray(rubric.strengths)
      ? rubric.strengths.filter((s): s is string => typeof s === 'string')
      : [],
    missingKeyPoints: Array.isArray(rubric.missingKeyPoints)
      ? rubric.missingKeyPoints.filter((k): k is string => typeof k === 'string')
      : [],
    misconceptions,
    misconceptionDetails: misconceptionDetails.length > 0 ? misconceptionDetails : undefined,
    rationale: typeof rubric.rationale === 'string' ? rubric.rationale : '',
    nextAction:
      typeof rubric.suggestedNextAction === 'string'
        ? rubric.suggestedNextAction
        : 'Ready to continue to the next concept.',
    correctionGuidance:
      typeof rubric.correctionGuidance === 'string' ? rubric.correctionGuidance : undefined,
  };
}

export interface UseLearningSessionOptions {
  sessionId?: string;
  conceptId?: string;
  evaluator?: AnswerEvaluator;
  dbName?: string;
}

export function useLearningSession(options: UseLearningSessionOptions = {}) {
  const storeSessionId = useSessionStore((s) => s.sessionId);
  const storeConceptId = useSessionStore((s) => s.currentConceptId);
  const [difficultyPreference, setDifficultyPreference] = React.useState<DifficultyPreference>('intermediate');

  React.useEffect(() => {
    let mounted = true;
    getStorage()
      .workspace.getOrCreateDefault()
      .then((ws) => {
        if (mounted && ws.preferences?.difficulty) {
          setDifficultyPreference(ws.preferences.difficulty);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const activeSessionId = options.sessionId ?? storeSessionId;
  const activeConceptId = options.conceptId ?? storeConceptId;

  // Session & Domain Entity State
  const [session, setSession] = React.useState<StudySessionRecord | null>(null);
  const [machineState, setMachineState] = React.useState<MachineState>('IDLE');
  const machineStateRef = React.useRef<MachineState>('IDLE');
  const [concept, setConcept] = React.useState<ConceptRecord | null>(null);
  const [document, setDocument] = React.useState<DocumentRecord | null>(null);
  const [sourceChunks, setSourceChunks] = React.useState<DocumentChunkRecord[]>([]);
  const [currentQuestion, setCurrentQuestion] = React.useState<RecallQuestionRecord | null>(null);
  const [draftAnswer, setDraftAnswerState] = React.useState<string>('');
  const [selectedConfidence, setSelectedConfidenceState] = React.useState<1 | 2 | 3 | null>(null);
  const [lastEvaluation, setLastEvaluation] = React.useState<AnswerEvaluationOutput | null>(null);
  const [isFallbackQuestion, setIsFallbackQuestion] = React.useState(false);
  const [revisionPlan, setRevisionPlan] = React.useState<RevisionPlan | null>(null);
  const [revisionExplanation, setRevisionExplanation] = React.useState<string | null>(null);
  const [isRevisionLoading, setIsRevisionLoading] = React.useState(false);

  // Status & Notifications
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = React.useState<string | null>(null);

  // Evaluator Seam
  const evaluator = React.useMemo<AnswerEvaluator>(() => {
    return options.evaluator ?? new HybridAnswerEvaluator({ dbName: options.dbName });
  }, [options.evaluator, options.dbName]);

  // Request ID & Abort Tracking (Stale Response Guard & In-Flight Cancellation)
  const activeRequestIdRef = React.useRef<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Invalidate in-flight operations helper
  const cancelInFlight = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    activeRequestIdRef.current = null;
    setIsLoading(false);
  }, []);

  // Cancel on unmount or concept change
  React.useEffect(() => {
    return () => {
      cancelInFlight();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [cancelInFlight, activeConceptId]);

  // Initial session load on mount or sessionId change
  React.useEffect(() => {
    let isCancelled = false;
    if (!activeSessionId) {
      openDatabase(options.dbName)
        .then(async (db) => {
          const all = (await db.getAll('studySessions')) as StudySessionRecord[];
          if (all.length > 0 && !isCancelled) {
            all.sort((a: StudySessionRecord, b: StudySessionRecord) =>
              (b.updatedAt || '').localeCompare(a.updatedAt || ''),
            );
            const latest = all[0];
            useSessionStore.getState().setSessionId(latest.id);
            if (latest.currentConceptId) {
              useSessionStore.getState().setCurrentConceptId(latest.currentConceptId);
            }
          }
        })
        .catch(() => {});
      return;
    }

    loadSessionWithContext(activeSessionId, options.dbName)
      .then((context) => {
        if (isCancelled || !context) return;
        setSession(context.session);
        const loadedState = context.session.machineState as MachineState;
        machineStateRef.current = loadedState;
        setMachineState(loadedState);
        setConcept(context.concept);
        setDocument(context.document);
        setSourceChunks(context.sourceChunks);
        setCurrentQuestion(context.latestQuestion);
        setDraftAnswerState(context.session.draftAnswer ?? '');
        setSelectedConfidenceState(
          (context.session.selectedConfidence as 1 | 2 | 3) ?? null,
        );

        if (context.latestAttempt) {
          const attempt = context.latestAttempt;
          const parsed = parseAttemptRubric(attempt.rubric);
          setLastEvaluation({
            attemptId: attempt.id,
            qualityGrade: attempt.qualityGrade,
            compositeScore: attempt.compositeScore ?? undefined,
            semanticScore: attempt.semanticScore ?? undefined,
            judgeScore: attempt.judgeScore ?? undefined,
            evaluationMode: attempt.evaluationMode,
            strengths: parsed.strengths,
            missingKeyPoints: parsed.missingKeyPoints,
            misconceptions: parsed.misconceptions,
            misconceptionDetails: parsed.misconceptionDetails,
            rationale: parsed.rationale,
            nextAction: parsed.nextAction,
            pendingEvaluation: attempt.pendingEvaluation,
            confidenceFeedback: '',
            correctionGuidance: parsed.correctionGuidance,
          });
        }

        if (context.wasRecovered) {
          setRestoredNotice(
            `Session restored to ${context.session.machineState}. Prior in-flight operation was rolled back safely.`,
          );
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load session context:', err);
        setError('Unable to load study session.');
      });

    return () => {
      isCancelled = true;
    };
  }, [activeSessionId, options.dbName]);

  // Manual reload session helper
  const reloadSession = React.useCallback(async () => {
    if (!activeSessionId) return;

    setIsLoading(true);
    setError(null);
    try {
      const context = await loadSessionWithContext(activeSessionId, options.dbName);
      if (context) {
        setSession(context.session);
        const loadedState = context.session.machineState as MachineState;
        machineStateRef.current = loadedState;
        setMachineState(loadedState);
        setConcept(context.concept);
        setDocument(context.document);
        setSourceChunks(context.sourceChunks);
        setCurrentQuestion(context.latestQuestion);
        setDraftAnswerState(context.session.draftAnswer ?? '');
        setSelectedConfidenceState(
          (context.session.selectedConfidence as 1 | 2 | 3) ?? null,
        );

        if (context.latestAttempt) {
          const attempt = context.latestAttempt;
          const parsed = parseAttemptRubric(attempt.rubric);
          setLastEvaluation({
            attemptId: attempt.id,
            qualityGrade: attempt.qualityGrade,
            compositeScore: attempt.compositeScore ?? undefined,
            semanticScore: attempt.semanticScore ?? undefined,
            judgeScore: attempt.judgeScore ?? undefined,
            evaluationMode: attempt.evaluationMode,
            strengths: parsed.strengths,
            missingKeyPoints: parsed.missingKeyPoints,
            misconceptions: parsed.misconceptions,
            misconceptionDetails: parsed.misconceptionDetails,
            rationale: parsed.rationale,
            nextAction: parsed.nextAction,
            pendingEvaluation: attempt.pendingEvaluation,
            confidenceFeedback: '',
            correctionGuidance: parsed.correctionGuidance,
          });
        }

        if (context.wasRecovered) {
          setRestoredNotice(
            `Session restored to ${context.session.machineState}. Prior in-flight operation was rolled back safely.`,
          );
        }
      }
    } catch (err) {
      console.error('Failed to load session context:', err);
      setError('Unable to load study session.');
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, options.dbName]);

  // Debounced draft answer change handler
  const setDraftAnswer = React.useCallback(
    (text: string) => {
      setDraftAnswerState(text);
      if (activeSessionId) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          void persistDraftAnswer(activeSessionId, text, options.dbName);
        }, 350);
      }
    },
    [activeSessionId, options.dbName],
  );

  // Selected confidence change handler
  const setSelectedConfidence = React.useCallback(
    (confidence: 1 | 2 | 3) => {
      setSelectedConfidenceState(confidence);
      if (activeSessionId) {
        void persistSelectedConfidence(activeSessionId, confidence, options.dbName);
      }
    },
    [activeSessionId, options.dbName],
  );

  // Core FSM Transition Dispatcher
  const dispatch = React.useCallback(
    async (event: MachineEvent, extraCtx: Partial<MachineContext> = {}): Promise<boolean> => {
      const currentFsmState = machineStateRef.current;
      const ctx: MachineContext = {
        currentConceptId: concept?.id,
        isConceptEligible: true,
        questionPresent: !!currentQuestion,
        answerText: draftAnswer,
        confidenceSelected: selectedConfidence !== null,
        lastQualityGrade: lastEvaluation?.qualityGrade,
        ...extraCtx,
      };

      const result = transition(currentFsmState, event, ctx);

      if (!result.ok) {
        setError(result.error);
        return false;
      }

      setError(null);
      machineStateRef.current = result.next;
      setMachineState(result.next);

      if (activeSessionId) {
        await persistMachineState(activeSessionId, result.next, concept?.id, options.dbName);
      }

      // Process declared side-effects
      for (const effect of result.effects) {
        if (effect.type === 'LOG_LEARNING_EVENT') {
          void logLearningEvent(effect.eventType, effect.payload, options.dbName);
        }
      }

      return true;
    },
    [
      concept,
      currentQuestion,
      draftAnswer,
      selectedConfidence,
      lastEvaluation,
      activeSessionId,
      options.dbName,
    ],
  );

  // Action: "I'm ready"
  const handleReadyForRecall = React.useCallback(async () => {
    await dispatch({ type: 'READY_FOR_RECALL' });
  }, [dispatch]);

  // Action: Request Question Generation
  const handleRequestQuestion = React.useCallback(async () => {
    if (!concept || !activeSessionId) return;

    const ok = await dispatch({ type: 'REQUEST_QUESTION' });
    if (!ok) return;

    cancelInFlight();
    const requestId = generateId();
    activeRequestIdRef.current = requestId;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);

    try {
      // 1. Calculate adaptive difficulty level, lowering difficulty if retrying after a weak score
      const baseAdaptive = calculateAdaptiveDifficulty({
        downstreamInfluence: concept.confidence, // Proxied if graph metric not cached
        sessionMasteryRate: null, // Neutral default
        previousQualityGrade: lastEvaluation?.qualityGrade ?? null,
        attemptCount: 0,
        previousLevel: currentQuestion?.difficulty ?? null,
        userPreference: difficultyPreference,
      });

      const difficultyLevel: 1 | 2 | 3 | 4 | 5 =
        lastEvaluation && lastEvaluation.qualityGrade < 3 && currentQuestion
          ? (Math.max(1, currentQuestion.difficulty - 1) as 1 | 2 | 3 | 4 | 5)
          : baseAdaptive.difficultyLevel;

      // 2. Fetch or generate question
      const questionResult = await getOrGenerateRecallQuestion({
        concept,
        sourceChunks,
        difficultyLevel,
        recentQuestions: currentQuestion ? [currentQuestion] : [],
        dbName: options.dbName,
        clientOptions: { signal: controller.signal },
      });

      // 3. Stale Response Guard: Ignore if an aborted/subsequent request took over
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      setCurrentQuestion(questionResult.question);
      setIsFallbackQuestion(questionResult.isFallback);

      await dispatch({
        type: 'QUESTION_GENERATED',
        questionId: questionResult.question.id,
      });
    } catch (err) {
      if (activeRequestIdRef.current === requestId) {
        console.error('Question generation error:', err);
        await dispatch({ type: 'QUESTION_FAILED' });
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [
    concept,
    activeSessionId,
    dispatch,
    cancelInFlight,
    lastEvaluation,
    currentQuestion,
    difficultyPreference,
    sourceChunks,
    options.dbName,
  ]);

  // Action: Submit Answer & Confidence for Evaluation
  const handleSubmitAnswer = React.useCallback(async () => {
    if (!currentQuestion || !concept || !activeSessionId) return;

    const trimmed = draftAnswer.trim();
    if (!trimmed) {
      setError('Please provide an explanation before submitting.');
      return;
    }
    if (!selectedConfidence) {
      setError('Please select how confident you feel about your answer (1-3).');
      return;
    }

    const ok = await dispatch({
      type: 'SUBMIT_ANSWER',
      answerText: trimmed,
      confidence: selectedConfidence,
    });
    if (!ok) return;

    cancelInFlight();
    const requestId = generateId();
    activeRequestIdRef.current = requestId;

    setIsLoading(true);

    try {
      const evaluationResult = await evaluator.evaluate({
        sessionId: activeSessionId,
        question: currentQuestion,
        concept,
        answerText: trimmed,
        confidence: selectedConfidence,
        sourceChunks,
      });

      // Stale Response Guard
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      setLastEvaluation(evaluationResult);

      if (evaluationResult.qualityGrade < 3) {
        try {
          const repos = getStorage();
          const allDeps: ConceptDependencyRecord[] = await repos.dependencies.list();
          const prereqIds = allDeps
            .filter(
              (d: ConceptDependencyRecord) => d.dependentConceptId === concept.id && !d.removed,
            )
            .map((d: ConceptDependencyRecord) => d.prerequisiteId);
          const prereqs: ConceptRecord[] = [];
          for (const pid of prereqIds) {
            const p = await repos.concepts.get(pid);
            if (p) prereqs.push(p);
          }
          const allMastery: MasteryStateRecord[] = await repos.mastery.list();
          const masteryMap = new Map<string, MasteryStateRecord>(allMastery.map((m) => [m.conceptId, m]));
          const allSr: SpacedRepetitionStateRecord[] = await repos.spacedRepetition.list();
          const srMap = new Map<string, SpacedRepetitionStateRecord>(allSr.map((s) => [s.conceptId, s]));

          const plan = diagnoseRevisionNeeds({
            concept,
            prerequisites: prereqs,
            masteryMap,
            srMap,
            missingKeyPoints: evaluationResult.missingKeyPoints,
            misconceptions: evaluationResult.misconceptions,
            currentDifficulty: currentQuestion.difficulty,
          });
          setRevisionPlan(plan);
        } catch (planErr) {
          console.warn('Could not compute revision plan:', planErr);
        }
      } else {
        setRevisionPlan(null);
        setRevisionExplanation(null);
      }

      await dispatch({
        type: 'EVALUATION_SUCCESS',
        qualityGrade: evaluationResult.qualityGrade,
      });
    } catch (err) {
      if (activeRequestIdRef.current === requestId) {
        console.error('Evaluation error:', err);
        await dispatch({ type: 'EVALUATION_FAILED' });
      }
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [
    currentQuestion,
    concept,
    activeSessionId,
    draftAnswer,
    selectedConfidence,
    dispatch,
    cancelInFlight,
    evaluator,
    sourceChunks,
  ]);

  // Action: "Continue" (Proceed after passing evaluation)
  const handleContinue = React.useCallback(async () => {
    await dispatch({ type: 'CONTINUE' });
  }, [dispatch]);

  // Action: "Try again"
  const handleTryAgain = React.useCallback(async () => {
    await dispatch({ type: 'TRY_AGAIN' });
  }, [dispatch]);

  // Action: "Revise"
  const handleRevise = React.useCallback(async () => {
    await dispatch({ type: 'REVISE' });
    if (concept && revisionPlan?.type === 'simplify') {
      setIsRevisionLoading(true);
      try {
        const res = await getRevisionExplanation({
          concept,
          focusPoints: revisionPlan.focusPoints,
          sourceChunks: sourceChunks.map((c) => ({ id: c.id, text: c.text })),
        });
        setRevisionExplanation(res.explanation);
      } catch (err) {
        console.warn('Failed to fetch revision explanation:', err);
      } finally {
        setIsRevisionLoading(false);
      }
    }
  }, [dispatch, concept, revisionPlan, sourceChunks]);

  // Action: "Review later"
  const handleReviewLater = React.useCallback(async () => {
    await dispatch({ type: 'REVIEW_LATER' });
  }, [dispatch]);

  // Action: Select Concept
  const handleSelectConcept = React.useCallback(
    async (targetConceptId: string) => {
      cancelInFlight();
      await dispatch({ type: 'SELECT_CONCEPT', conceptId: targetConceptId });
    },
    [cancelInFlight, dispatch],
  );

  return {
    // Current State & Domain Entities
    machineState,
    session,
    concept,
    document,
    sourceChunks,
    currentQuestion,
    draftAnswer,
    selectedConfidence,
    lastEvaluation,
    isFallbackQuestion,

    // Revision Loop (Phase 8)
    revisionPlan,
    revisionExplanation,
    isRevisionLoading,

    // Status & Error
    isLoading,
    error,
    restoredNotice,
    clearRestoredNotice: () => setRestoredNotice(null),

    // Actions
    setDraftAnswer,
    setSelectedConfidence,
    handleReadyForRecall,
    handleRequestQuestion,
    handleSubmitAnswer,
    handleContinue,
    handleTryAgain,
    handleRevise,
    handleReviewLater,
    handleSelectConcept,
    reloadSession,
  };
}
