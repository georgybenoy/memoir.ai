import {
  type DocumentRecord,
  type LearningUnitRecord,
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
  type RecallQuestionRecord,
} from '@/types/domain';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { getStorage } from '@/lib/db/bootstrap';
import { StorageError } from '@/lib/db/errors';

export interface MaterialBundle {
  material: DocumentRecord;
  units: LearningUnitRecord[];
  concepts: ConceptRecord[];
  dependencies: ConceptDependencyRecord[];
  chunks: DocumentChunkRecord[];
  masteryStates: MasteryStateRecord[];
  spacedRepetitionStates: SpacedRepetitionStateRecord[];
  recallQuestions: RecallQuestionRecord[];
}

/**
 * Typed material-resolution service.
 * Study, Recall, and Revision modes obtain their domain inputs ONLY through this service,
 * without ever needing the original raw file.
 *
 * Can resolve all units ('ALL') or a specific subset of unit IDs.
 */
export async function getMaterialBundle(
  materialId: string,
  unitFilter: string[] | 'ALL' = 'ALL',
  customRepos?: StorageRepositories,
): Promise<MaterialBundle> {
  const repos = customRepos ?? getStorage();

  const material = await repos.documents.get(materialId);
  if (!material) {
    throw new StorageError(
      `Material with ID "${materialId}" was not found in local library.`,
      'UNAVAILABLE',
    );
  }

  // 1. Fetch all units for this material
  const allUnits = await repos.learningUnits.listByMaterial(materialId);
  const selectedUnits =
    unitFilter === 'ALL'
      ? allUnits
      : allUnits.filter((u) => unitFilter.includes(u.id));

  // Determine active concept IDs
  const activeConceptIdSet = new Set<string>();
  if (unitFilter === 'ALL') {
    const allMaterialConcepts = await repos.concepts.listByMaterial(materialId);
    for (const c of allMaterialConcepts) {
      if (!c.archived) {
        activeConceptIdSet.add(c.id);
      }
    }
  } else {
    for (const u of selectedUnits) {
      for (const cid of u.conceptIds) {
        activeConceptIdSet.add(cid);
      }
    }
  }

  // 2. Fetch concepts for this material
  const allMaterialConcepts = await repos.concepts.listByMaterial(materialId);
  const activeConcepts = allMaterialConcepts.filter(
    (c) => activeConceptIdSet.has(c.id) && !c.archived,
  );

  // 3. Fetch dependencies and filter to active concepts
  const allDeps = await repos.dependencies.list();
  const relevantDeps = allDeps.filter(
    (dep) =>
      !dep.removed &&
      activeConceptIdSet.has(dep.prerequisiteId) &&
      activeConceptIdSet.has(dep.dependentConceptId),
  );

  // 4. Fetch source chunks
  const allChunks = await repos.chunks.listByMaterial(materialId);
  const activeChunkIdSet = new Set<string>();
  for (const c of activeConcepts) {
    for (const cid of c.sourceChunkIds || []) {
      activeChunkIdSet.add(cid);
    }
  }
  for (const u of selectedUnits) {
    for (const cid of u.sourceChunkIds || []) {
      activeChunkIdSet.add(cid);
    }
  }

  const relevantChunks =
    unitFilter === 'ALL'
      ? allChunks
      : allChunks.filter((ch) => activeChunkIdSet.has(ch.id));

  // 5. Fetch mastery and spaced repetition state for active concepts
  const [allMastery, allSr, allQuestions] = await Promise.all([
    repos.mastery.list(),
    repos.spacedRepetition.list(),
    repos.questions.listByMaterial(materialId),
  ]);

  const relevantMastery = allMastery.filter((m) => activeConceptIdSet.has(m.conceptId));
  const relevantSr = allSr.filter((s) => activeConceptIdSet.has(s.conceptId));
  const relevantQuestions = allQuestions.filter(
    (q) => !q.archived && activeConceptIdSet.has(q.conceptId),
  );

  return {
    material,
    units: selectedUnits,
    concepts: activeConcepts,
    dependencies: relevantDeps,
    chunks: relevantChunks,
    masteryStates: relevantMastery,
    spacedRepetitionStates: relevantSr,
    recallQuestions: relevantQuestions,
  };
}
