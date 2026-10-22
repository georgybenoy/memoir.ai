/**
 * Weak Concept Revision & Diagnosis Engine
 * Source of truth: PRD FR-11, FR-16, TECH_STACK §10.3
 *
 * Diagnoses failing attempts (q < 3) by analyzing rubric deficits,
 * misconceptions, and direct prerequisite health. Directs the student to
 * review weak prerequisites first, or provides simplified re-explanations.
 */

import {
  type ConceptRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { fetchExplainConcept } from '@/lib/ai/client';

export interface PrerequisiteDiagnosis {
  hasWeakPrerequisite: boolean;
  weakPrerequisite?: ConceptRecord;
  message: string;
}

export interface RevisionDiagnosisInput {
  concept: ConceptRecord;
  prerequisites: ConceptRecord[];
  masteryMap: Map<string, MasteryStateRecord>;
  srMap: Map<string, SpacedRepetitionStateRecord>;
  missingKeyPoints?: string[];
  misconceptions?: string[];
  currentDifficulty?: number;
}

export interface RevisionPlan {
  type: 'prerequisite_weak' | 'simplify';
  weakPrerequisite?: ConceptRecord;
  message: string;
  focusPoints: string[];
  suggestedDifficulty: number;
}

/**
 * Diagnoses whether a failing recall is caused by a broken prerequisite foundation,
 * or requires a simplified re-explanation of the current concept.
 */
export function diagnoseRevisionNeeds(input: RevisionDiagnosisInput): RevisionPlan {
  const {
    prerequisites,
    masteryMap,
    srMap,
    missingKeyPoints = [],
    misconceptions = [],
    currentDifficulty = 2,
  } = input;

  // 1. Check for any direct prerequisite that is weak or unmastered
  for (const prereq of prerequisites) {
    const sr = srMap.get(prereq.id);
    const mastery = masteryMap.get(prereq.id);

    const isPrereqWeak =
      sr?.weak === true ||
      (mastery !== undefined && (mastery.percentage < 50 || mastery.level < 2));

    if (isPrereqWeak) {
      return {
        type: 'prerequisite_weak',
        weakPrerequisite: prereq,
        message: `Review this prerequisite ("${prereq.title}"), then try again.`,
        focusPoints: missingKeyPoints,
        suggestedDifficulty: Math.max(1, currentDifficulty - 1),
      };
    }
  }

  // 2. No weak prerequisites: prepare simplified explanation plan
  const focusPoints = [
    ...missingKeyPoints,
    ...misconceptions.map((m) => `Clarify: ${m}`),
  ].slice(0, 5);

  return {
    type: 'simplify',
    message:
      'Let’s strengthen your understanding with a simpler breakdown before trying another question.',
    focusPoints,
    suggestedDifficulty: Math.max(1, currentDifficulty - 1),
  };
}

/**
 * Returns a deterministic fallback explanation when AI explanation is unavailable.
 */
export function getDeterministicFallbackExplanation(
  concept: ConceptRecord,
  focusPoints: string[] = [],
): string {
  const focusText =
    focusPoints.length > 0
      ? `\n\n### Key points to remember:\n${focusPoints.map((fp) => `- ${fp}`).join('\n')}`
      : '';

  return `### Simplified Refresher: ${concept.title}\n\n${concept.canonicalExplanation || concept.summary}${focusText}\n\n*(Take a moment to review this core foundation before attempting recall again.)*`;
}

/**
 * Fetches a simplified Socratic explanation for revision, with automatic
 * deterministic fallback if the Gemini API is offline or unconfigured.
 */
export async function getRevisionExplanation(options: {
  concept: ConceptRecord;
  focusPoints: string[];
  sourceChunks?: Array<{ id: string; text: string }>;
  signal?: AbortSignal;
}): Promise<{ explanation: string; isFallback: boolean }> {
  const { concept, focusPoints, sourceChunks = [], signal } = options;

  try {
    const response = await fetchExplainConcept(
      {
        concept: {
          id: concept.id,
          title: concept.title,
          summary: concept.summary,
          canonicalExplanation: concept.canonicalExplanation,
          keyTerms: concept.keyTerms,
        },
        sourceChunks,
        sourceMode: sourceChunks.length > 0 ? 'document' : 'topic',
        mode: 'simplify',
        focusPoints,
      },
      { signal, timeoutMs: 15000 },
    );

    return {
      explanation: response.message,
      isFallback: false,
    };
  } catch (err) {
    console.warn('AI simplify explanation unavailable, using deterministic fallback:', err);
    return {
      explanation: getDeterministicFallbackExplanation(concept, focusPoints),
      isFallback: true,
    };
  }
}
