/**
 * Session Completion & Summary Service (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD FR-12
 *
 * Computes deterministic session summaries strictly from real IndexedDB storage.
 * Zero hardcoded or in-memory numbers.
 */

import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type StudySessionRecord,
  type RecallAttemptRecord,
  type ConceptRecord,
  type LearningUnitRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { formatHumanDueText } from '@/features/spaced-repetition/queue';
import {
  type SessionSummary,
  type SessionAttemptSummary,
  type ScheduledReviewSummary,
  type RecommendedNextAction,
} from './types';
import { nowIso } from '@/lib/utils/clock';

/**
 * Builds a comprehensive session completion summary from stored IndexedDB records.
 */
export async function buildSessionSummaryFromDatabase(
  sessionId: string,
  materialId: string,
  dbName = DB_NAME,
): Promise<SessionSummary> {
  const db = await openDatabase(dbName);

  // 1. Fetch the session record
  const session = (await db.get('studySessions', sessionId)) as StudySessionRecord | undefined;
  const startedAt = session?.startedAt ?? nowIso();
  const endedAt = session?.endedAt ?? nowIso();
  const mode = session?.mode ?? (session?.machineState === 'REVISION_DUE' ? 'revision' : 'study');
  const status = session?.status ?? (session?.endedAt ? 'completed' : 'active');

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));

  // 2. Fetch attempts for this session
  const allAttempts = (await db.getAllFromIndex(
    'recallAttempts',
    'by-session',
    sessionId,
  )) as RecallAttemptRecord[];

  // 3. Fetch all concepts for this material
  const materialConcepts = (await db.getAllFromIndex(
    'concepts',
    'by-material',
    materialId,
  )) as ConceptRecord[];

  const conceptMap = new Map<string, ConceptRecord>(materialConcepts.map((c) => [c.id, c]));

  // Also look up any concept in the system if not found in material index (e.g. legacy records)
  for (const att of allAttempts) {
    if (!conceptMap.has(att.conceptId)) {
      const c = (await db.get('concepts', att.conceptId)) as ConceptRecord | undefined;
      if (c) conceptMap.set(c.id, c);
    }
  }

  // 4. Derive concepts covered during this session
  const coveredConceptIdSet = new Set<string>();
  for (const att of allAttempts) {
    coveredConceptIdSet.add(att.conceptId);
  }
  if (session?.currentConceptId) {
    coveredConceptIdSet.add(session.currentConceptId);
  }

  const conceptsCovered: SessionSummary['conceptsCovered'] = [];
  for (const cid of coveredConceptIdSet) {
    const c = conceptMap.get(cid);
    if (!c) continue;

    // Fetch real mastery record
    const m = (await db.getFromIndex('masteryStates', 'by-concept', cid)) as
      | MasteryStateRecord
      | undefined;

    conceptsCovered.push({
      id: c.id,
      title: c.title,
      tier: c.tier,
      masteryLevel: m?.masteryLevel ?? 'new',
      masteryPercentage: m?.percentage ?? 0,
    });
  }

  // 5. Build attempt summaries
  let totalScoreSum = 0;
  let scoredCount = 0;
  const evaluationResults: SessionAttemptSummary[] = [];

  for (const att of allAttempts) {
    const c = conceptMap.get(att.conceptId);
    const score = att.compositeScore ?? att.judgeScore ?? null;
    if (score !== null && typeof score === 'number' && !isNaN(score)) {
      totalScoreSum += score;
      scoredCount++;
    }

    const rubric = (att.rubric as Record<string, unknown>) ?? {};
    const strengths = Array.isArray(rubric.strengths)
      ? rubric.strengths.filter((s): s is string => typeof s === 'string')
      : [];
    const missingKeyPoints = Array.isArray(rubric.missingKeyPoints)
      ? rubric.missingKeyPoints.filter((k): k is string => typeof k === 'string')
      : [];

    evaluationResults.push({
      id: att.id,
      conceptId: att.conceptId,
      conceptTitle: c?.title ?? 'Core Concept',
      score,
      qualityGrade: att.qualityGrade,
      evaluationMode: att.evaluationMode,
      strengths,
      missingKeyPoints,
    });
  }

  const averageScore = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : null;

  // 6. Identify concepts needing more practice (q < 3 or weak flag)
  const weakConceptMap = new Map<string, string>();
  for (const att of allAttempts) {
    if (att.qualityGrade < 3) {
      weakConceptMap.set(
        att.conceptId,
        `Answer quality grade was ${att.qualityGrade}/5. Review recommended.`,
      );
    }
  }

  const conceptsNeedingPractice = Array.from(weakConceptMap.entries()).map(([id, reason]) => ({
    id,
    title: conceptMap.get(id)?.title ?? 'Core Concept',
    reason,
  }));

  // 7. Newly scheduled reviews from this session
  const newlyScheduledReviews: ScheduledReviewSummary[] = [];
  for (const cid of coveredConceptIdSet) {
    const sr = (await db.getFromIndex('spacedRepetitionStates', 'by-concept', cid)) as
      | SpacedRepetitionStateRecord
      | undefined;

    if (sr && sr.lastReviewedAt) {
      // Check if this review was updated during or after session started
      const reviewTime = new Date(sr.lastReviewedAt).getTime();
      if (reviewTime >= startMs - 2000) {
        // Updated in this session
        const c = conceptMap.get(cid);
        const dueTime = new Date(sr.nextDueAt).getTime();
        const nowMs = new Date(endedAt).getTime();
        const diffDays = Math.round((dueTime - nowMs) / (1000 * 60 * 60 * 24));

        newlyScheduledReviews.push({
          conceptId: cid,
          conceptTitle: c?.title ?? 'Core Concept',
          intervalDays: sr.intervalDays,
          nextDueAt: sr.nextDueAt,
          humanDueText: formatHumanDueText(diffDays, sr.weak),
        });
      }
    }
  }

  // 8. Recommended Next Action derivation
  let recommendedNextAction: RecommendedNextAction;

  if (conceptsNeedingPractice.length > 0) {
    recommendedNextAction = {
      type: 'REVIEW_WEAK',
      title: `Practice ${conceptsNeedingPractice.length} Weak Concept${conceptsNeedingPractice.length > 1 ? 's' : ''}`,
      description: 'Strengthen prerequisite understanding before moving on.',
      targetMode: 'recall',
    };
  } else {
    // Check if there are other learning units in this material
    const allUnits = (await db.getAllFromIndex(
      'learningUnits',
      'by-material',
      materialId,
    )) as LearningUnitRecord[];
    allUnits.sort((a, b) => a.order - b.order);

    const activeUnitId = session?.learningUnitId ?? session?.currentUnitId;
    let nextUnit: LearningUnitRecord | undefined;
    if (activeUnitId) {
      const currIdx = allUnits.findIndex((u) => u.id === activeUnitId);
      if (currIdx >= 0 && currIdx < allUnits.length - 1) {
        nextUnit = allUnits[currIdx + 1];
      }
    }

    if (nextUnit) {
      recommendedNextAction = {
        type: 'CONTINUE_UNIT',
        title: `Continue to Unit ${nextUnit.order + 1}: ${nextUnit.title}`,
        description: 'Advance to the next sequential unit in this material.',
        targetUnitId: nextUnit.id,
      };
    } else if (mode === 'study') {
      recommendedNextAction = {
        type: 'SWITCH_MODE',
        title: 'Start Active Recall',
        description: 'Test your understanding with practice questions on this material.',
        targetMode: 'recall',
      };
    } else {
      recommendedNextAction = {
        type: 'WORKFLOW_HOME',
        title: 'Return to Materials',
        description: 'All units completed! You can review or explore other study materials.',
      };
    }
  }

  return {
    sessionId,
    materialId,
    mode,
    status,
    startedAt,
    endedAt,
    durationSeconds,
    conceptsCovered,
    questionsAnswered: allAttempts.length,
    averageScore,
    evaluationResults,
    conceptsNeedingPractice,
    newlyScheduledReviews,
    recommendedNextAction,
  };
}
