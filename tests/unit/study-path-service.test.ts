/**
 * Study Path Service Unit Tests
 * Tests study path creation, atomic IndexedDB transactions, and dynamic eligibility recalculation.
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §9.1
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeStudyPathForDocument,
  recalculateEligibility,
} from '@/features/study-path/service';
import { openDatabase, removeDatabase } from '@/lib/db/indexeddb';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type ConceptRecord,
  type ConceptDependencyRecord,
  type MasteryStateRecord,
} from '@/types/domain';

const TEST_DB = 'edumentor-test-study-path';

function makeDoc(id: string): DocumentRecord {
  return {
    id,
    filename: 'Lecture_Notes.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    extractedText: 'Sample lecture text.',
    analysisStatus: 'completed',
    contentHash: 'hash-doc-1',
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
}

function makeChunk(id: string, docId: string, index: number): DocumentChunkRecord {
  return {
    id,
    documentId: docId,
    chunkIndex: index,
    text: `Chunk text ${index}`,
    startOffset: index * 100,
    endOffset: (index + 1) * 100,
    contentHash: `hash-${id}`,
    createdAt: '2026-10-22T00:00:00Z',
  };
}

function makeConcept(id: string, chunkId: string, order: number, title?: string): ConceptRecord {
  return {
    id,
    title: title ?? `Concept ${id}`,
    summary: `Summary of ${id}`,
    canonicalExplanation: `Explanation of ${id}`,
    keyTerms: [id.toLowerCase()],
    sourceChunkIds: [chunkId],
    tier: 0,
    status: 'locked',
    confidence: 0.9,
    extractionOrder: order,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
}

describe('Study Path Service (service.ts)', () => {
  beforeEach(async () => {
    try {
      await removeDatabase(TEST_DB);
    } catch {
      // Ignore
    }
  });

  it('initializes study path, assigns tiers, and sets initial statuses atomically', async () => {
    const db = await openDatabase(TEST_DB);

    // Seed document and chunks
    const doc = makeDoc('doc-1');
    const chunkA = makeChunk('chunk-A', 'doc-1', 0);
    const chunkB = makeChunk('chunk-B', 'doc-1', 1);

    await db.put('documents', doc);
    await db.put('documentChunks', chunkA);
    await db.put('documentChunks', chunkB);

    // Concept A (Foundational) -> Concept B (Dependent)
    const conceptA = makeConcept('A', 'chunk-A', 1, 'Variables');
    const conceptB = makeConcept('B', 'chunk-B', 2, 'Functions');
    await db.put('concepts', conceptA);
    await db.put('concepts', conceptB);

    const depAB: ConceptDependencyRecord = {
      id: 'dep-A-B',
      prerequisiteId: 'A',
      dependentConceptId: 'B',
      confidence: 0.85,
      removed: false,
      createdAt: '2026-10-22T00:00:00Z',
    };
    await db.put('conceptDependencies', depAB);

    // Run initialization
    const result = await initializeStudyPathForDocument({
      documentId: 'doc-1',
      dbName: TEST_DB,
    });

    expect(result.session).toBeDefined();
    expect(result.session.machineState).toBe('STUDY_PATH_READY');
    expect(result.session.currentConceptId).toBe('A');

    expect(result.pathItems.length).toBe(2);

    // Item 0: Concept A is foundational (Tier 0) -> Available
    const itemA = result.pathItems.find((p) => p.conceptId === 'A')!;
    expect(itemA.orderIndex).toBe(0);
    expect(itemA.status).toBe('available');

    // Item 1: Concept B is dependent on A (Tier 1) -> Locked
    const itemB = result.pathItems.find((p) => p.conceptId === 'B')!;
    expect(itemB.orderIndex).toBe(1);
    expect(itemB.status).toBe('locked');

    // Verify atomic persistence in IndexedDB
    const savedSession = await db.get('studySessions', result.session.id);
    expect(savedSession).toBeDefined();
    expect(savedSession?.currentConceptId).toBe('A');

    const savedItems = await db.getAllFromIndex('studyPathItems', 'by-session', result.session.id);
    expect(savedItems.length).toBe(2);

    const savedConceptA = await db.get('concepts', 'A');
    expect(savedConceptA?.status).toBe('available');
    expect(savedConceptA?.tier).toBe(0);

    const savedConceptB = await db.get('concepts', 'B');
    expect(savedConceptB?.status).toBe('locked');
    expect(savedConceptB?.tier).toBe(1);
  });

  it('recalculates eligibility and unlocks dependent concept after prerequisite is mastered', async () => {
    const db = await openDatabase(TEST_DB);

    // Seed document, chunks, concepts
    const doc = makeDoc('doc-2');
    const chunkA = makeChunk('chunk-A2', 'doc-2', 0);
    const chunkB = makeChunk('chunk-B2', 'doc-2', 1);

    await db.put('documents', doc);
    await db.put('documentChunks', chunkA);
    await db.put('documentChunks', chunkB);

    const conceptA = makeConcept('A2', 'chunk-A2', 1);
    const conceptB = makeConcept('B2', 'chunk-B2', 2);
    await db.put('concepts', conceptA);
    await db.put('concepts', conceptB);

    const depAB: ConceptDependencyRecord = {
      id: 'dep-A2-B2',
      prerequisiteId: 'A2',
      dependentConceptId: 'B2',
      confidence: 0.9,
      removed: false,
      createdAt: '2026-10-22T00:00:00Z',
    };
    await db.put('conceptDependencies', depAB);

    const initResult = await initializeStudyPathForDocument({
      documentId: 'doc-2',
      dbName: TEST_DB,
    });
    const sessionId = initResult.session.id;

    // Prior to mastery: B2 is locked
    const itemsBefore = await db.getAllFromIndex('studyPathItems', 'by-session', sessionId);
    expect(itemsBefore.find((p) => p.conceptId === 'B2')?.status).toBe('locked');

    // Student studies A2 and achieves passing mastery: 75% percentage, 1 attempt
    const masteryA2: MasteryStateRecord = {
      id: 'mastery-A2',
      conceptId: 'A2',
      level: 2,
      percentage: 75,
      bestScore: 75,
      attemptCount: 1,
      lastAttemptAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z',
    };
    await db.put('masteryStates', masteryA2);

    // Trigger dynamic eligibility recalculation
    const recalcResult = await recalculateEligibility(sessionId, TEST_DB);

    expect(recalcResult.unlockedConceptIds).toContain('B2');

    // Verify B2 status transitioned from 'locked' to 'available'
    const itemsAfter = await db.getAllFromIndex('studyPathItems', 'by-session', sessionId);
    const itemB2 = itemsAfter.find((p) => p.conceptId === 'B2');
    expect(itemB2?.status).toBe('available');

    // Concept table updated too
    const conceptB2Record = await db.get('concepts', 'B2');
    expect(conceptB2Record?.status).toBe('available');
  });
});
