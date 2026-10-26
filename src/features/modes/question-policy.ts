/**
 * Recall Question Reuse Policy (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD FR-07
 *
 * Implements the deterministic question reuse and cache exhaustion policy:
 * 1. Content Version Parity: A cached question is only reusable if its contentVersion
 *    matches the concept's active contentVersion. If content changed, regenerate.
 * 2. Consecutive Repeat Prevention: Never ask the identical question twice in a row for the same concept.
 * 3. Recent Attempt Cooldown: Do not reuse a question asked within the current session,
 *    or within the last N attempts (default 3) for this concept.
 * 4. Priority: Prefer valid unanswered questions first, then oldest attempted questions.
 * 5. Cache Exhaustion: If zero cached questions satisfy the policy, return null to trigger fresh generation.
 */

import { type ConceptRecord, type RecallQuestionRecord, type RecallAttemptRecord } from '@/types/domain';
import { type QuestionReuseConfig } from './types';

export const DEFAULT_RECENT_ATTEMPTS_COOLDOWN = 3;

export interface QuestionReuseEvaluationOptions {
  concept: ConceptRecord;
  candidateQuestion: RecallQuestionRecord;
  sessionQuestionIds?: string[];
  pastAttemptsForConcept?: RecallAttemptRecord[];
  config?: QuestionReuseConfig;
}

export interface QuestionReuseEligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * Evaluates whether a specific cached question is eligible for reuse.
 */
export function evaluateQuestionEligibility(
  options: QuestionReuseEvaluationOptions,
): QuestionReuseEligibility {
  const {
    concept,
    candidateQuestion,
    sessionQuestionIds = [],
    pastAttemptsForConcept = [],
    config = {},
  } = options;

  const cooldownN = config.maxRecentCooldown ?? DEFAULT_RECENT_ATTEMPTS_COOLDOWN;
  const enforceContentVersion = config.enforceContentVersion ?? true;

  // Rule 1: Concept linkage check
  if (candidateQuestion.conceptId !== concept.id) {
    return { eligible: false, reason: 'Question belongs to a different concept.' };
  }

  // Rule 2: Content Version Parity
  if (enforceContentVersion) {
    if (concept.contentVersion && candidateQuestion.contentVersion) {
      if (candidateQuestion.contentVersion !== concept.contentVersion) {
        return {
          eligible: false,
          reason: `Content version mismatch (${candidateQuestion.contentVersion} vs current ${concept.contentVersion}).`,
        };
      }
    }
  }

  // Rule 3: Session Isolation — never ask the same question twice in the same session
  if (sessionQuestionIds.includes(candidateQuestion.id)) {
    return {
      eligible: false,
      reason: 'Question was already presented in the current learning session.',
    };
  }

  // Rule 4: Consecutive Repeat Prevention — never ask the identical question twice in a row
  if (pastAttemptsForConcept.length > 0) {
    const lastAttempt = pastAttemptsForConcept[pastAttemptsForConcept.length - 1];
    if (lastAttempt.questionId === candidateQuestion.id) {
      return {
        eligible: false,
        reason: 'Question was presented in the immediate previous attempt for this concept.',
      };
    }
  }

  // Rule 5: Recent Attempt Cooldown — check last N attempts
  const recentAttempts = pastAttemptsForConcept.slice(-cooldownN);
  const recentQuestionIds = recentAttempts.map((a) => a.questionId);
  if (recentQuestionIds.includes(candidateQuestion.id)) {
    return {
      eligible: false,
      reason: `Question was presented within the last ${cooldownN} attempts for this concept.`,
    };
  }

  return { eligible: true };
}

export interface FindReusableQuestionOptions {
  concept: ConceptRecord;
  availableQuestions: RecallQuestionRecord[];
  sessionQuestionIds?: string[];
  pastAttemptsForConcept?: RecallAttemptRecord[];
  config?: QuestionReuseConfig;
}

/**
 * Finds the optimal reusable question from a candidate pool according to the policy.
 * Returns null if the cache is exhausted or no candidate meets the criteria.
 */
export function findReusableQuestion(
  options: FindReusableQuestionOptions,
): RecallQuestionRecord | null {
  const {
    concept,
    availableQuestions,
    sessionQuestionIds = [],
    pastAttemptsForConcept = [],
    config = {},
  } = options;

  // Filter to questions for this concept
  const conceptQuestions = availableQuestions.filter((q) => q.conceptId === concept.id && !q.archived);
  if (conceptQuestions.length === 0) {
    return null;
  }

  // Find all eligible candidates
  const eligibleCandidates: RecallQuestionRecord[] = [];
  for (const q of conceptQuestions) {
    const check = evaluateQuestionEligibility({
      concept,
      candidateQuestion: q,
      sessionQuestionIds,
      pastAttemptsForConcept,
      config,
    });
    if (check.eligible) {
      eligibleCandidates.push(q);
    }
  }

  if (eligibleCandidates.length === 0) {
    return null;
  }

  // Attempt frequency mapping
  const attemptCountMap = new Map<string, number>();
  const lastAttemptTimeMap = new Map<string, number>();

  for (const attempt of pastAttemptsForConcept) {
    const count = attemptCountMap.get(attempt.questionId) ?? 0;
    attemptCountMap.set(attempt.questionId, count + 1);

    const attemptTime = new Date(attempt.createdAt).getTime();
    const existingTime = lastAttemptTimeMap.get(attempt.questionId) ?? 0;
    if (attemptTime > existingTime) {
      lastAttemptTimeMap.set(attempt.questionId, attemptTime);
    }
  }

  // Sort eligible candidates:
  // 1. Unanswered first (attemptCount === 0)
  // 2. Least attempted questions next
  // 3. Oldest last-attempted question next
  // 4. Stable tie-break by question.id
  eligibleCandidates.sort((a, b) => {
    const countA = attemptCountMap.get(a.id) ?? 0;
    const countB = attemptCountMap.get(b.id) ?? 0;

    if (countA !== countB) {
      return countA - countB;
    }

    const timeA = lastAttemptTimeMap.get(a.id) ?? 0;
    const timeB = lastAttemptTimeMap.get(b.id) ?? 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return a.id.localeCompare(b.id);
  });

  return eligibleCandidates[0];
}
