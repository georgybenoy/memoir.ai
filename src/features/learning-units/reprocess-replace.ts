import {
  type ConceptRecord,
} from '@/types/domain';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { normalizeConceptTitle } from '@/features/concepts/deduplicate';
import { nowISO } from '@/lib/utils/clock';

export interface ConceptMatchResult {
  matchedPairs: Array<{ oldConcept: ConceptRecord; newConcept: ConceptRecord }>;
  unmatchedOld: ConceptRecord[];
  unmatchedNew: ConceptRecord[];
}

/**
 * Computes Jaccard term similarity between two sets of strings.
 */
function computeTermJaccard(aTerms: string[], bTerms: string[]): number {
  if (aTerms.length === 0 || bTerms.length === 0) return 0;
  const setA = new Set(aTerms.map((t) => t.toLowerCase().trim()));
  const setB = new Set(bTerms.map((t) => t.toLowerCase().trim()));

  let intersection = 0;
  for (const term of setA) {
    if (setB.has(term)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Conservatively matches old concepts to new concepts during a material Replace operation:
 * 1. Exact normalized title match.
 * 2. High term Jaccard similarity (>= 0.6) for slight title variations.
 *
 * Matched new concepts adopt the old concept's ID so that attempts, mastery, and SM-2 records
 * remain attached without data loss. Unmatched old concepts are flagged `archived: true` (never deleted).
 */
export function matchConceptsForReplace(
  oldConcepts: ConceptRecord[],
  newExtractedConcepts: ConceptRecord[],
): ConceptMatchResult {
  const matchedPairs: Array<{ oldConcept: ConceptRecord; newConcept: ConceptRecord }> = [];
  const matchedOldIds = new Set<string>();
  const matchedNewIds = new Set<string>();

  // Pass 1: Exact normalized title match
  for (const oldC of oldConcepts) {
    const oldNorm = normalizeConceptTitle(oldC.title);
    for (const newC of newExtractedConcepts) {
      if (matchedNewIds.has(newC.id)) continue;
      if (oldNorm === normalizeConceptTitle(newC.title)) {
        matchedPairs.push({ oldConcept: oldC, newConcept: newC });
        matchedOldIds.add(oldC.id);
        matchedNewIds.add(newC.id);
        break;
      }
    }
  }

  // Pass 2: Key term Jaccard similarity (>= 0.6) for remaining concepts
  for (const oldC of oldConcepts) {
    if (matchedOldIds.has(oldC.id)) continue;
    let bestScore = 0;
    let bestNew: ConceptRecord | null = null;

    for (const newC of newExtractedConcepts) {
      if (matchedNewIds.has(newC.id)) continue;
      const score = computeTermJaccard(oldC.keyTerms, newC.keyTerms);
      if (score >= 0.6 && score > bestScore) {
        bestScore = score;
        bestNew = newC;
      }
    }

    if (bestNew) {
      matchedPairs.push({ oldConcept: oldC, newConcept: bestNew });
      matchedOldIds.add(oldC.id);
      matchedNewIds.add(bestNew.id);
    }
  }

  const unmatchedOld = oldConcepts.filter((c) => !matchedOldIds.has(c.id));
  const unmatchedNew = newExtractedConcepts.filter((c) => !matchedNewIds.has(c.id));

  return {
    matchedPairs,
    unmatchedOld,
    unmatchedNew,
  };
}

export interface ReplaceMaterialPlan {
  conceptsToPut: ConceptRecord[];
  archivedConceptCount: number;
  preservedConceptCount: number;
  newConceptCount: number;
}

/**
 * Applies Replace Material concept matching:
 * - Matched concepts retain their existing conceptId (preserving attempts and SM-2 state).
 * - Unmatched old concepts are marked archived: true (never erased).
 * - Unmatched new concepts are assigned new IDs.
 */
export function planReplaceMaterialConcepts(
  oldConcepts: ConceptRecord[],
  newConcepts: ConceptRecord[],
  newContentVersion: string,
  promptVersion = '1.0',
): ReplaceMaterialPlan {
  const matchResult = matchConceptsForReplace(oldConcepts, newConcepts);
  const conceptsToPut: ConceptRecord[] = [];
  const now = nowISO();

  // 1. Matched concepts: adopt old ID and update content
  for (const { oldConcept, newConcept } of matchResult.matchedPairs) {
    conceptsToPut.push({
      ...newConcept,
      id: oldConcept.id, // Retain stable identity!
      materialId: oldConcept.materialId,
      contentVersion: newContentVersion,
      promptVersion,
      archived: false,
      createdAt: oldConcept.createdAt,
      updatedAt: now,
    });
  }

  // 2. Unmatched old concepts: archive them, NEVER delete
  for (const oldC of matchResult.unmatchedOld) {
    conceptsToPut.push({
      ...oldC,
      archived: true,
      updatedAt: now,
    });
  }

  // 3. Brand new concepts: keep new IDs
  for (const newC of matchResult.unmatchedNew) {
    conceptsToPut.push({
      ...newC,
      contentVersion: newContentVersion,
      promptVersion,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    conceptsToPut,
    archivedConceptCount: matchResult.unmatchedOld.length,
    preservedConceptCount: matchResult.matchedPairs.length,
    newConceptCount: matchResult.unmatchedNew.length,
  };
}

export interface DeleteMaterialCascadeSummary {
  materialId: string;
  materialFilename: string;
  chunkCount: number;
  conceptCount: number;
  unitCount: number;
  questionCount: number;
  attemptCount: number;
  description: string;
}

/**
 * Calculates what will be deleted before an explicit material deletion.
 * User must explicitly confirm this summary.
 */
export async function getDeleteMaterialCascadeSummary(
  materialId: string,
  repos: StorageRepositories,
): Promise<DeleteMaterialCascadeSummary | null> {
  const doc = await repos.documents.get(materialId);
  if (!doc) return null;

  const [chunks, concepts, units, questions, attempts] = await Promise.all([
    repos.chunks.listByMaterial(materialId),
    repos.concepts.listByMaterial(materialId),
    repos.learningUnits.listByMaterial(materialId),
    repos.questions.listByMaterial(materialId),
    repos.attempts.listByMaterial(materialId),
  ]);

  return {
    materialId,
    materialFilename: doc.filename,
    chunkCount: chunks.length,
    conceptCount: concepts.length,
    unitCount: units.length,
    questionCount: questions.length,
    attemptCount: attempts.length,
    description: `Deleting "${doc.filename}" will permanently remove ${chunks.length} chunks, ${concepts.length} concepts, ${units.length} learning units, ${questions.length} questions, and ${attempts.length} recall attempts from local storage.`,
  };
}

/**
 * Execute cascading deletion of a material and all dependent records.
 */
export async function executeDeleteMaterialCascade(
  materialId: string,
  repos: StorageRepositories,
): Promise<void> {
  const [chunks, concepts, units, questions, attempts] = await Promise.all([
    repos.chunks.listByMaterial(materialId),
    repos.concepts.listByMaterial(materialId),
    repos.learningUnits.listByMaterial(materialId),
    repos.questions.listByMaterial(materialId),
    repos.attempts.listByMaterial(materialId),
  ]);

  // Delete records across stores
  await Promise.all([
    ...chunks.map((c) => repos.chunks.delete(c.id)),
    ...concepts.map((c) => repos.concepts.delete(c.id)),
    ...units.map((u) => repos.learningUnits.delete(u.id)),
    ...questions.map((q) => repos.questions.delete(q.id)),
    ...attempts.map((a) => repos.attempts.delete(a.id)),
    repos.processing.delete(materialId),
    repos.materialFiles.delete(materialId),
    repos.documents.delete(materialId),
  ]);
}
