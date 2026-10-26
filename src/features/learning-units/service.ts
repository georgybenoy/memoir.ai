import { type LearningUnitRecord, type ConceptRecord } from '@/types/domain';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { nowISO } from '@/lib/utils/clock';

/**
 * Atomically persists learning units and links concepts to their corresponding unit IDs.
 */
export async function persistLearningUnits(
  units: LearningUnitRecord[],
  conceptUnitMap: Map<string, string>,
  repos: StorageRepositories,
): Promise<void> {
  if (units.length === 0) return;

  // 1. Fetch concepts to update their unitId
  const conceptsToUpdate: ConceptRecord[] = [];
  for (const [conceptId, unitId] of conceptUnitMap.entries()) {
    const concept = await repos.concepts.get(conceptId);
    if (concept) {
      conceptsToUpdate.push({
        ...concept,
        unitId,
        updatedAt: nowISO(),
      });
    }
  }

  // 2. Put units and updated concepts
  await Promise.all([
    repos.learningUnits.putMany(units),
    conceptsToUpdate.length > 0 ? repos.concepts.putMany(conceptsToUpdate) : Promise.resolve(),
  ]);
}

/**
 * Retrieve all learning units for a given material, ordered by sequence.
 */
export async function getMaterialUnits(
  materialId: string,
  repos: StorageRepositories,
): Promise<LearningUnitRecord[]> {
  return repos.learningUnits.listByMaterial(materialId);
}
