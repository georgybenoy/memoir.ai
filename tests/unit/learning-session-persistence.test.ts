import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '@/lib/db/indexeddb';
import {
  loadSessionWithContext,
  persistDraftAnswer,
  persistSelectedConfidence,
  persistMachineState,
} from '@/features/conversation/learning-session-service';
import {
  type StudySessionRecord,
  type ConceptRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
  type StudyPathItemRecord,
} from '@/types/domain';
import { type MachineState } from '@/features/conversation/types';

describe('Learning Session Persistence & Transient State Recovery (learning-session-persistence.test.ts)', () => {
  const TEST_DB = 'test-session-restore-db';

  beforeEach(async () => {
    // Reset/recreate clean database
    const db = await openDatabase(TEST_DB);
    const stores = [
      'studySessions',
      'concepts',
      'documents',
      'documentChunks',
      'recallQuestions',
      'recallAttempts',
      'studyPathItems',
      'learningEvents',
    ] as const;

    for (const store of stores) {
      await db.clear(store);
    }
  });

  const baseSession: StudySessionRecord = {
    id: 'session-persist-1',
    subjectId: 'sub-1',
    currentConceptId: 'concept-1',
    machineState: 'WAITING_FOR_ANSWER',
    draftAnswer: 'Draft in-progress explanation about cristae.',
    selectedConfidence: 2,
    sourceMode: 'document',
    startedAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };

  const mockConcept: ConceptRecord = {
    id: 'concept-1',
    title: 'Mitochondria & Cristae',
    summary: 'Cristae foldings provide high surface area.',
    canonicalExplanation: 'Proton gradients drive ATP synthase located in the cristae.',
    keyTerms: ['cristae', 'ATP synthase'],
    sourceChunkIds: ['chunk-1'],
    tier: 1,
    status: 'available',
    confidence: 0.9,
    extractionOrder: 1,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };

  const mockChunk: DocumentChunkRecord = {
    id: 'chunk-1',
    documentId: 'doc-1',
    chunkIndex: 0,
    text: 'Cristae foldings expand the surface area for ATP synthase complexes.',
    startOffset: 0,
    endOffset: 68,
    contentHash: 'hash-chunk-1',
    createdAt: '2026-10-22T00:00:00Z',
  };

  const mockQuestion: RecallQuestionRecord = {
    id: 'q-100',
    conceptId: 'concept-1',
    prompt: 'What role do cristae folds play in ATP production?',
    questionStyle: 'explanation',
    referencePoints: ['cristae', 'ATP synthase'],
    expectedKeyPoints: ['Surface area', 'ATP synthase'],
    sourceChunkIds: ['chunk-1'],
    difficulty: 3,
    createdAt: '2026-10-22T00:00:00Z',
  };

  describe('Transient State Recovery on Session Restore', () => {
    it.each<[MachineState, MachineState]>([
      ['NOTE_UPLOADING', 'IDLE'],
      ['ANALYZING_NOTES', 'IDLE'],
      ['GENERATING_QUESTION', 'WAITING_FOR_RECALL'],
      ['EVALUATING', 'WAITING_FOR_ANSWER'],
    ])('recovers in-flight transient state %s to safe state %s and logs restoration event', async (transientState, expectedSafeState) => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', {
        ...baseSession,
        machineState: transientState,
      });

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded).not.toBeNull();
      if (!loaded) return;

      expect(loaded.wasRecovered).toBe(true);
      expect(loaded.recoveredFrom).toBe(transientState);
      expect(loaded.session.machineState).toBe(expectedSafeState);

      // Verify the recovered state was updated in IndexedDB
      const inDb = await db.get('studySessions', 'session-persist-1');
      expect(inDb?.machineState).toBe(expectedSafeState);

      // Verify learningEvents logged SESSION_RESTORED
      const events = await db.getAll('learningEvents');
      const restoreEvent = events.find((e) => e.eventType === 'SESSION_RESTORED');
      expect(restoreEvent).toBeDefined();
      expect(restoreEvent?.payload.interruptedState).toBe(transientState);
      expect(restoreEvent?.payload.recoveredState).toBe(expectedSafeState);
    });

    it.each<MachineState>([
      'IDLE',
      'STUDY_PATH_READY',
      'STUDYING_CONCEPT',
      'WAITING_FOR_RECALL',
      'WAITING_FOR_ANSWER',
      'FEEDBACK',
      'NEXT_CONCEPT',
      'REVISION_DUE',
      'COMPLETED',
    ])('restores non-transient state %s without triggering recovery', async (stableState) => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', {
        ...baseSession,
        machineState: stableState,
      });

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded).not.toBeNull();
      if (!loaded) return;

      expect(loaded.wasRecovered).toBe(false);
      expect(loaded.recoveredFrom).toBeUndefined();
      expect(loaded.session.machineState).toBe(stableState);
    });
  });

  describe('Draft Answer and Context Persistence', () => {
    it('persists draft answer and restores it seamlessly', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', baseSession);

      const newDraft = 'An updated draft answer explaining electron transport and chemiosmosis.';
      await persistDraftAnswer('session-persist-1', newDraft, TEST_DB);

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded?.session.draftAnswer).toBe(newDraft);
    });

    it('persists selected confidence rating (1, 2, or 3)', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', baseSession);

      await persistSelectedConfidence('session-persist-1', 3, TEST_DB);

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded?.session.selectedConfidence).toBe(3);
    });

    it('persists machineState and currentConceptId updates to active session', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', baseSession);

      await persistMachineState('session-persist-1', 'STUDYING_CONCEPT', 'concept-2', TEST_DB);

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded?.session.machineState).toBe('STUDYING_CONCEPT');
      expect(loaded?.session.currentConceptId).toBe('concept-2');
    });

    it('retrieves linked concept, document chunk, and calculates study path progress', async () => {
      const db = await openDatabase(TEST_DB);
      await db.put('studySessions', baseSession);
      await db.put('concepts', mockConcept);
      await db.put('documentChunks', mockChunk);
      await db.put('recallQuestions', mockQuestion);

      const pathItems: StudyPathItemRecord[] = [
        {
          id: 'item-1',
          sessionId: 'session-persist-1',
          conceptId: 'concept-1',
          status: 'mastered',
          orderIndex: 0,
          createdAt: '2026-10-22T00:00:00Z',
          updatedAt: '2026-10-22T00:00:00Z',
        },
        {
          id: 'item-2',
          sessionId: 'session-persist-1',
          conceptId: 'concept-2',
          status: 'available',
          orderIndex: 1,
          createdAt: '2026-10-22T00:00:00Z',
          updatedAt: '2026-10-22T00:00:00Z',
        },
      ];
      for (const item of pathItems) {
        await db.put('studyPathItems', item);
      }

      const loaded = await loadSessionWithContext('session-persist-1', TEST_DB);
      expect(loaded?.concept?.title).toBe('Mitochondria & Cristae');
      expect(loaded?.sourceChunks.length).toBe(1);
      expect(loaded?.sourceChunks[0].text).toContain('Cristae foldings expand');
      expect(loaded?.latestQuestion?.prompt).toContain('What role do cristae folds play');
      expect(loaded?.totalPathConcepts).toBe(2);
      expect(loaded?.completedPathConcepts).toBe(1);
    });
  });
});
