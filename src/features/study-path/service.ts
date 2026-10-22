/**
 * Study Path Service
 * Manages study path creation, transactional persistence, and dynamic eligibility recalculation.
 * Pure TypeScript domain service (no React imports).
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §9.1
 */

import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type StudySessionRecord,
  type StudyPathItemRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
  type RecallAttemptRecord,
} from '@/types/domain';
import { openDatabase, runTransaction, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import {
  buildDependencyGraph,
  type DependencyGraphResult,
} from '@/features/dependency-graph';
import {
  isEligible,
  determineConceptStatus,
} from '@/features/mastery/eligibility';
import { DEFAULT_MASTERY_UNLOCK_THRESHOLD } from '@/lib/config/mastery';

export interface InitializeStudyPathOptions {
  documentId: string;
  subjectId?: string;
  forceFallback?: boolean;
  dbName?: string;
}

export interface InitializeStudyPathResult {
  session: StudySessionRecord;
  pathItems: StudyPathItemRecord[];
  graphResult: DependencyGraphResult;
}

/**
 * Builds the prerequisite DAG, initializes an active study session with ordered path items,
 * and commits concepts, dependencies, session, and path items atomically in one transaction.
 */
export async function initializeStudyPathForDocument(
  options: InitializeStudyPathOptions,
): Promise<InitializeStudyPathResult> {
  const { documentId, subjectId, forceFallback = false, dbName = DB_NAME } = options;

  const db = await openDatabase(dbName);
  const now = nowIso();

  // 1. Fetch chunks for the document to identify associated concepts
  const chunks = await db.getAllFromIndex('documentChunks', 'by-document', documentId);
  const chunkIds = new Set(chunks.map((c) => c.id));

  // 2. Fetch all concepts and filter for those referencing this document's chunks
  const allConcepts = await db.getAll('concepts');
  const docConcepts = allConcepts.filter((c) =>
    c.sourceChunkIds && c.sourceChunkIds.some((chunkId: string) => chunkIds.has(chunkId)),
  );

  const conceptIds = new Set(docConcepts.map((c) => c.id));

  // 3. Fetch dependencies associated with these concepts
  const allDependencies = await db.getAll('conceptDependencies');
  const docDependencies = allDependencies.filter(
    (dep) => conceptIds.has(dep.prerequisiteId) && conceptIds.has(dep.dependentConceptId),
  );

  // 4. Run deterministic dependency graph pipeline
  const graphResult = buildDependencyGraph({
    concepts: docConcepts,
    dependencies: docDependencies,
    chunks,
    forceFallback,
  });

  // 5. Fetch any existing mastery records
  const allMastery = await db.getAll('masteryStates');
  const masteryMap = new Map<string, MasteryStateRecord>();
  for (const m of allMastery) {
    if (conceptIds.has(m.conceptId)) {
      masteryMap.set(m.conceptId, m);
    }
  }

  // 6. Build active prerequisites map from graph activeEdges
  const prereqMap = new Map<string, string[]>();
  for (const c of graphResult.orderedConcepts) {
    prereqMap.set(c.id, []);
  }
  for (const edge of graphResult.activeEdges) {
    if (prereqMap.has(edge.dependentConceptId)) {
      prereqMap.get(edge.dependentConceptId)!.push(edge.prerequisiteId);
    }
  }

  // 7. Create StudySession record
  const sessionId = generateId();
  const session: StudySessionRecord = {
    id: sessionId,
    subjectId,
    machineState: 'STUDY_PATH_READY',
    currentConceptId: graphResult.orderedConcepts[0]?.id,
    sourceMode: 'document',
    startedAt: now,
    updatedAt: now,
  };

  // 8. Create StudyPathItem records in topological order
  const pathItems: StudyPathItemRecord[] = [];
  const updatedConcepts: ConceptRecord[] = [];

  graphResult.orderedConcepts.forEach((concept, index) => {
    const directPrereqs = prereqMap.get(concept.id) ?? [];
    const eligible = isEligible(
      concept.id,
      directPrereqs,
      masteryMap,
      undefined,
      undefined,
      DEFAULT_MASTERY_UNLOCK_THRESHOLD,
    );

    const mastery = masteryMap.get(concept.id);
    const status = determineConceptStatus({
      conceptId: concept.id,
      isEligible: eligible,
      mastery,
      currentTimeIso: now,
    });

    const pathItem: StudyPathItemRecord = {
      id: generateId(),
      sessionId,
      conceptId: concept.id,
      orderIndex: index,
      status,
      createdAt: now,
      updatedAt: now,
    };
    pathItems.push(pathItem);

    // Update concept status and tier
    const updatedConcept: ConceptRecord = {
      ...concept,
      status,
      tier: graphResult.tiers.get(concept.id) ?? 0,
      updatedAt: now,
    };
    updatedConcepts.push(updatedConcept);
  });

  // 9. Atomic IndexedDB Transaction committing all entities simultaneously
  await runTransaction(
    ['concepts', 'conceptDependencies', 'studySessions', 'studyPathItems', 'documents'],
    'readwrite',
    async (tx) => {
      // Put updated concepts
      const conceptStore = tx.objectStore('concepts');
      for (const c of updatedConcepts) {
        await conceptStore.put(c);
      }

      // Put all dependencies with updated removed flags
      const depStore = tx.objectStore('conceptDependencies');
      for (const e of graphResult.allEdges) {
        const depRecord: ConceptDependencyRecord = {
          id: e.id,
          prerequisiteId: e.prerequisiteId,
          dependentConceptId: e.dependentConceptId,
          confidence: e.confidence,
          removed: e.removed,
          removedReason: e.removedReason,
          createdAt: e.createdAt ?? now,
        };
        await depStore.put(depRecord);
      }

      // Put session
      await tx.objectStore('studySessions').put(session);

      // Put path items
      const pathStore = tx.objectStore('studyPathItems');
      for (const item of pathItems) {
        await pathStore.put(item);
      }

      // Update document metadata with session reference and graph mode
      const doc = await tx.objectStore('documents').get(documentId);
      if (doc) {
        doc.metadata = {
          ...doc.metadata,
          sessionId,
          graphMode: graphResult.graphMode,
          totalTiers: Math.max(0, ...Array.from(graphResult.tiers.values())) + 1,
        };
        doc.updatedAt = now;
        await tx.objectStore('documents').put(doc);
      }
    },
    dbName,
  );

  return {
    session,
    pathItems,
    graphResult,
  };
}

export interface RecalculateEligibilityResult {
  sessionId: string;
  updatedPathItems: StudyPathItemRecord[];
  unlockedConceptIds: string[];
}

/**
 * Recalculates eligibility for all study path items in a session.
 * Called after evaluations, mastery updates, or prerequisite override skips.
 * Persists updated statuses atomically.
 */
export async function recalculateEligibility(
  sessionId: string,
  dbName = DB_NAME,
): Promise<RecalculateEligibilityResult> {
  const db = await openDatabase(dbName);
  const now = nowIso();

  // 1. Fetch path items for session
  const pathItems = await db.getAllFromIndex('studyPathItems', 'by-session', sessionId);
  if (pathItems.length === 0) {
    return { sessionId, updatedPathItems: [], unlockedConceptIds: [] };
  }

  // Sort by orderIndex
  pathItems.sort((a, b) => a.orderIndex - b.orderIndex);
  const conceptIds = new Set(pathItems.map((p) => p.conceptId));

  // 2. Fetch active dependencies
  const allDeps = await db.getAll('conceptDependencies');
  const activeDeps = allDeps.filter(
    (d) => !d.removed && conceptIds.has(d.prerequisiteId) && conceptIds.has(d.dependentConceptId),
  );

  // Build prerequisite map
  const prereqMap = new Map<string, string[]>();
  for (const id of conceptIds) {
    prereqMap.set(id, []);
  }
  for (const dep of activeDeps) {
    prereqMap.get(dep.dependentConceptId)?.push(dep.prerequisiteId);
  }

  // 3. Fetch mastery records
  const allMastery = await db.getAll('masteryStates');
  const masteryMap = new Map<string, MasteryStateRecord>();
  for (const m of allMastery) {
    if (conceptIds.has(m.conceptId)) {
      masteryMap.set(m.conceptId, m);
    }
  }

  // 4. Fetch spaced repetition records
  const allSpaced = await db.getAll('spacedRepetitionStates');
  const spacedMap = new Map<string, SpacedRepetitionStateRecord>();
  for (const s of allSpaced) {
    if (conceptIds.has(s.conceptId)) {
      spacedMap.set(s.conceptId, s);
    }
  }

  // 5. Fetch latest attempts per concept
  const allAttempts = await db.getAll('recallAttempts');
  const latestAttemptsMap = new Map<string, RecallAttemptRecord>();
  for (const attempt of allAttempts) {
    if (conceptIds.has(attempt.conceptId)) {
      const existing = latestAttemptsMap.get(attempt.conceptId);
      if (!existing || new Date(attempt.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        latestAttemptsMap.set(attempt.conceptId, attempt);
      }
    }
  }

  // 6. Fetch prerequisite override events
  const allEvents = await db.getAll('learningEvents');
  const overrides = new Set<string>();
  for (const ev of allEvents) {
    if (ev.eventType === 'PREREQUISITE_OVERRIDE_APPLIED' && ev.payload?.conceptId) {
      overrides.add(String(ev.payload.conceptId));
    }
  }

  // 7. Recalculate status for each path item
  const updatedPathItems: StudyPathItemRecord[] = [];
  const unlockedConceptIds: string[] = [];

  for (const item of pathItems) {
    const directPrereqs = prereqMap.get(item.conceptId) ?? [];
    const eligible = isEligible(
      item.conceptId,
      directPrereqs,
      masteryMap,
      latestAttemptsMap,
      overrides,
      DEFAULT_MASTERY_UNLOCK_THRESHOLD,
    );

    const currentMastery = masteryMap.get(item.conceptId);
    const currentSpaced = spacedMap.get(item.conceptId);

    const prevStatus = item.status;
    const newStatus = determineConceptStatus({
      conceptId: item.conceptId,
      isEligible: eligible,
      mastery: currentMastery,
      spacedRepetition: currentSpaced,
      currentTimeIso: now,
    });

    if (prevStatus !== newStatus) {
      item.status = newStatus;
      item.updatedAt = now;
      updatedPathItems.push(item);

      if (prevStatus === 'locked' && newStatus === 'available') {
        unlockedConceptIds.push(item.conceptId);
      }
    }
  }

  // 8. Persist changes in one atomic transaction if any path item changed
  if (updatedPathItems.length > 0) {
    await runTransaction(
      ['studyPathItems', 'concepts'],
      'readwrite',
      async (tx) => {
        const pathStore = tx.objectStore('studyPathItems');
        for (const item of updatedPathItems) {
          await pathStore.put(item);
        }

        const conceptStore = tx.objectStore('concepts');
        for (const item of updatedPathItems) {
          const concept = await conceptStore.get(item.conceptId);
          if (concept) {
            concept.status = item.status;
            concept.updatedAt = now;
            await conceptStore.put(concept);
          }
        }
      },
      dbName,
    );
  }

  return {
    sessionId,
    updatedPathItems,
    unlockedConceptIds,
  };
}
