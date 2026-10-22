/**
 * Recall Question Service
 * Source of truth: PRD FR-07, TECH_STACK §7.2, §9.3
 *
 * Handles:
 * - Pedagogical style rotation avoiding immediate repeats
 * - Token-overlap duplicate rejection against recent session questions
 * - Deterministic offline fallback question templates (one per style)
 * - Atomic persistence of generated questions to IndexedDB `recallQuestions`
 */

import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type ConceptRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
} from '@/types/domain';
import {
  type QuestionStyle,
  QUESTION_STYLES,
} from '@/lib/ai/schemas';
import { fetchGenerateQuestion, type AiClientOptions } from '@/lib/ai/client';

export const DEFAULT_DUPLICATE_OVERLAP_THRESHOLD = 0.65;

/**
 * Tokenizes text into lowercase word tokens, stripping punctuation.
 */
export function tokenizeText(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => (w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w));
  return new Set(words);
}

/**
 * Computes Jaccard token similarity in [0, 1] between two strings.
 */
export function computeTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenizeText(text1);
  const tokens2 = tokenizeText(text2);

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = tokens1.size + tokens2.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Checks whether a candidate question prompt is a near-duplicate of recent session questions.
 */
export function isNearDuplicate(
  candidatePrompt: string,
  recentPrompts: string[],
  threshold = DEFAULT_DUPLICATE_OVERLAP_THRESHOLD,
): boolean {
  for (const recent of recentPrompts) {
    const overlap = computeTokenOverlap(candidatePrompt, recent);
    if (overlap >= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Selects the next question style using rotation, prioritizing styles least recently used.
 */
export function selectNextQuestionStyle(
  recentStyles: QuestionStyle[] = [],
  preferred?: QuestionStyle,
): QuestionStyle {
  if (preferred && QUESTION_STYLES.includes(preferred)) {
    // If preferred style was not used in the immediate last turn, honor it
    if (recentStyles.length === 0 || recentStyles[recentStyles.length - 1] !== preferred) {
      return preferred;
    }
  }

  // Find styles that haven't been used recently
  const unusedStyles = QUESTION_STYLES.filter((style) => !recentStyles.slice(-3).includes(style));
  if (unusedStyles.length > 0) {
    return unusedStyles[0];
  }

  // Otherwise pick the style whose last usage is farthest in the past
  for (const style of QUESTION_STYLES) {
    if (recentStyles.length > 0 && recentStyles[recentStyles.length - 1] !== style) {
      return style;
    }
  }

  return QUESTION_STYLES[0];
}

/**
 * Generates a deterministic fallback question template from concept metadata and summaries.
 * Covers all 6 styles defined in PRD FR-07.
 */
export function generateFallbackQuestionTemplate(
  concept: ConceptRecord,
  style: QuestionStyle,
  availableChunks: DocumentChunkRecord[] = [],
): RecallQuestionRecord {
  const title = concept.title;
  let prompt = '';
  let expectedKeyPoints: string[] = [];

  switch (style) {
    case 'explanation':
      prompt = `In your own words, explain the core principle and mechanism of "${title}".`;
      expectedKeyPoints = [
        `Clear definition of ${title}`,
        concept.summary,
        ...(concept.keyTerms.slice(0, 3)),
      ];
      break;

    case 'comparison':
      prompt = `How does "${title}" relate to and differ from foundational concepts in this subject?`;
      expectedKeyPoints = [
        `Key characteristics of ${title}`,
        'Differences and similarities with foundational concepts',
        ...(concept.keyTerms.slice(0, 2)),
      ];
      break;

    case 'cause_effect':
      prompt = `What causes or triggers "${title}", and what are its direct effects or consequences?`;
      expectedKeyPoints = [
        `Underlying causes/inputs for ${title}`,
        `Direct consequences/outputs of ${title}`,
        ...(concept.keyTerms.slice(0, 2)),
      ];
      break;

    case 'process':
      prompt = `Outline the sequential process or step-by-step operation of "${title}".`;
      expectedKeyPoints = [
        `Initial state / trigger for ${title}`,
        'Core intermediate steps or stages',
        'Final outcome or state',
      ];
      break;

    case 'application':
      prompt = `Describe a concrete scenario or problem where you would apply "${title}", and explain why it is suited for that case.`;
      expectedKeyPoints = [
        `Applicable scenario or problem domain for ${title}`,
        'Practical execution or implementation steps',
        'Benefits and trade-offs of this approach',
      ];
      break;

    case 'misconception_diagnosis':
      prompt = `What is a common misconception, error, or flawed assumption people make about "${title}", and why is it incorrect?`;
      expectedKeyPoints = [
        `Common mistake or misconception regarding ${title}`,
        'Correct conceptual understanding and why the misconception fails',
        ...(concept.keyTerms.slice(0, 2)),
      ];
      break;
  }

  // Determine source chunk citations
  const validChunkIds = availableChunks.map((c) => c.id);
  const matchedChunks = concept.sourceChunkIds.filter((cid) => validChunkIds.includes(cid));
  const finalChunkIds =
    matchedChunks.length > 0 ? matchedChunks : validChunkIds.slice(0, 2);

  return {
    id: generateId(),
    conceptId: concept.id,
    prompt,
    questionStyle: style,
    referencePoints: concept.keyTerms.slice(0, 4),
    sourceChunkIds: finalChunkIds,
    difficulty: Math.max(1, Math.min(5, concept.tier + 1)),
    expectedKeyPoints,
    createdAt: nowIso(),
  };
}

export interface QuestionServiceOptions {
  concept: ConceptRecord;
  sourceChunks: DocumentChunkRecord[];
  difficultyLevel: number; // 1-5
  preferredStyle?: QuestionStyle;
  recentQuestions?: RecallQuestionRecord[];
  model?: string;
  dbName?: string;
  clientOptions?: AiClientOptions;
}

export interface QuestionServiceResult {
  question: RecallQuestionRecord;
  isFallback: boolean;
  style: QuestionStyle;
}

/**
 * Coordinates question generation:
 * 1. Chooses appropriate style avoiding recent repeats.
 * 2. Invokes POST /api/ai/generate-question with Gemini.
 * 3. Enforces duplicate detection against recent session questions.
 * 4. Falls back deterministically to offline template if API fails or candidate is duplicate.
 * 5. Persists the final question record to IndexedDB `recallQuestions`.
 */
export async function getOrGenerateRecallQuestion(
  options: QuestionServiceOptions,
): Promise<QuestionServiceResult> {
  const {
    concept,
    sourceChunks,
    difficultyLevel,
    preferredStyle,
    recentQuestions = [],
    model,
    dbName = DB_NAME,
    clientOptions,
  } = options;

  const recentStyles = recentQuestions.map((q) => q.questionStyle as QuestionStyle);
  const recentPrompts = recentQuestions.map((q) => q.prompt);
  const selectedStyle = selectNextQuestionStyle(recentStyles, preferredStyle);

  // Fallback builder helper
  const createFallback = () => {
    return generateFallbackQuestionTemplate(concept, selectedStyle, sourceChunks);
  };

  let finalQuestion: RecallQuestionRecord;
  let isFallback = false;

  // Attempt AI generation if source chunks are present
  if (sourceChunks.length > 0) {
    try {
      const response = await fetchGenerateQuestion(
        {
          concept: {
            id: concept.id,
            title: concept.title,
            summary: concept.summary,
            canonicalExplanation: concept.canonicalExplanation,
            keyTerms: concept.keyTerms,
          },
          sourceChunks: sourceChunks.slice(0, 8).map((c) => ({ id: c.id, text: c.text })),
          difficultyLevel,
          preferredStyle: selectedStyle,
          recentQuestionPrompts: recentPrompts.slice(-5),
          model,
        },
        clientOptions,
      );

      // Duplicate guard
      if (isNearDuplicate(response.prompt, recentPrompts)) {
        // Fall back to distinct template if AI produced a near-duplicate
        finalQuestion = createFallback();
        isFallback = true;
      } else {
        finalQuestion = {
          id: generateId(),
          conceptId: concept.id,
          prompt: response.prompt,
          questionStyle: response.style,
          referencePoints: concept.keyTerms.slice(0, 4),
          sourceChunkIds: response.sourceChunkIds,
          difficulty: difficultyLevel,
          expectedKeyPoints: response.expectedKeyPoints,
          createdAt: nowIso(),
        };
      }
    } catch {
      // In case of network timeout, rate limit, or outage, use deterministic template
      finalQuestion = createFallback();
      isFallback = true;
    }
  } else {
    // No source chunks: use deterministic template
    finalQuestion = createFallback();
    isFallback = true;
  }

  // Persist question to IndexedDB
  try {
    const db = await openDatabase(dbName);
    await db.put('recallQuestions', finalQuestion);
  } catch (err) {
    console.warn('Failed to persist recallQuestion to IndexedDB:', err);
  }

  return {
    question: finalQuestion,
    isFallback,
    style: finalQuestion.questionStyle as QuestionStyle,
  };
}
