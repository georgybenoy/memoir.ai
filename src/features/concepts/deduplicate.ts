import { type ExtractedConceptDto } from '@/lib/ai/schemas';

/**
 * Normalizes concept title for canonical comparison:
 * lowercase, removes leading English articles (a, an, the), collapses whitespace, strips punctuation.
 */
export function normalizeConceptTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Jaccard similarity index between two string sets:
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function computeJaccardSimilarity(arr1: string[], arr2: string[]): number {
  if (arr1.length === 0 && arr2.length === 0) return 1.0;
  if (arr1.length === 0 || arr2.length === 0) return 0.0;

  const set1 = new Set(arr1.map((s) => s.toLowerCase().trim()));
  const set2 = new Set(arr2.map((s) => s.toLowerCase().trim()));

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }

  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Computes word token overlap between two summary strings.
 */
export function computeTokenOverlap(text1: string, text2: string): number {
  const getTokens = (t: string) =>
    t
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

  const tokens1 = getTokens(text1);
  const tokens2 = getTokens(text2);
  return computeJaccardSimilarity(tokens1, tokens2);
}

/**
 * Determines whether two extracted concept DTOs represent the same underlying concept.
 */
export function areConceptsEquivalent(
  c1: ExtractedConceptDto,
  c2: ExtractedConceptDto,
): boolean {
  // 1. Exact normalized title match
  const norm1 = normalizeConceptTitle(c1.title);
  const norm2 = normalizeConceptTitle(c2.title);
  if (norm1 === norm2) return true;

  // 2. High key-term similarity + moderate summary overlap
  const termSim = computeJaccardSimilarity(c1.keyTerms, c2.keyTerms);
  if (termSim >= 0.5) {
    const summarySim = computeTokenOverlap(c1.summary, c2.summary);
    if (summarySim >= 0.35) {
      return true;
    }
  }

  return false;
}

/**
 * Merges two equivalent concepts into a single richer, higher-quality record.
 * Unions source chunk IDs and key terms; retains the most thorough explanation.
 */
export function mergeConcepts(
  primary: ExtractedConceptDto,
  secondary: ExtractedConceptDto,
): ExtractedConceptDto {
  // Union source chunk IDs
  const sourceChunkIds = Array.from(
    new Set([...primary.sourceChunkIds, ...secondary.sourceChunkIds]),
  );

  // Union key terms
  const termMap = new Map<string, string>();
  for (const term of [...primary.keyTerms, ...secondary.keyTerms]) {
    const norm = term.toLowerCase().trim();
    if (!termMap.has(norm)) {
      termMap.set(norm, term.trim());
    }
  }
  const keyTerms = Array.from(termMap.values()).slice(0, 8);

  // Union prerequisite titles (filtering self)
  const normTitle = normalizeConceptTitle(primary.title);
  const prereqMap = new Map<string, string>();
  for (const prereq of [...primary.prerequisiteTitles, ...secondary.prerequisiteTitles]) {
    const normPrereq = normalizeConceptTitle(prereq);
    if (normPrereq !== normTitle && !prereqMap.has(normPrereq)) {
      prereqMap.set(normPrereq, prereq.trim());
    }
  }
  const prerequisiteTitles = Array.from(prereqMap.values());

  // Prefer the more comprehensive explanation
  const canonicalExplanation =
    primary.canonicalExplanation.length >= secondary.canonicalExplanation.length
      ? primary.canonicalExplanation
      : secondary.canonicalExplanation;

  const summary =
    primary.summary.length >= secondary.summary.length ? primary.summary : secondary.summary;

  const confidence = Math.max(primary.confidence, secondary.confidence);

  return {
    tempId: primary.tempId,
    title: primary.title,
    summary,
    canonicalExplanation,
    keyTerms,
    sourceChunkIds,
    confidence,
    prerequisiteTitles,
  };
}

/**
 * Deduplicates an array of extracted concept DTOs across multiple extraction batches.
 */
export function deduplicateConcepts(concepts: ExtractedConceptDto[]): ExtractedConceptDto[] {
  const result: ExtractedConceptDto[] = [];

  for (const concept of concepts) {
    let merged = false;
    for (let i = 0; i < result.length; i++) {
      if (areConceptsEquivalent(result[i], concept)) {
        result[i] = mergeConcepts(result[i], concept);
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push(concept);
    }
  }

  return result;
}
