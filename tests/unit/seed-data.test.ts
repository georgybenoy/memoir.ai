import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import { BackupEnvelopeSchema } from '@/lib/db/schema';
import { seedIndexedDatabase, generateSeedBackupEnvelope } from '../../scripts/seed-data';

describe('Seeded Data Reproduction Verification', () => {
  const testDbName = 'edumentor-seed-test-db';

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  afterEach(async () => {
    closeDatabase();
    await removeDatabase(testDbName);
  });

  it('generates a strictly schema-compliant backup envelope at SCHEMA_VERSION = 1', () => {
    const envelope = generateSeedBackupEnvelope();
    const parseResult = BackupEnvelopeSchema.safeParse(envelope);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) {
      console.error(parseResult.error);
    }
  });

  it('seeds all 14 stores in IndexedDB and verifies record retrieval', async () => {
    const seedResult = await seedIndexedDatabase(testDbName);
    expect(seedResult.documents).toHaveLength(2);
    expect(seedResult.chunks).toHaveLength(6);
    expect(seedResult.concepts).toHaveLength(6);
    expect(seedResult.dependencies).toHaveLength(4);
    expect(seedResult.questions).toHaveLength(3);
    expect(seedResult.attempts).toHaveLength(2);
    expect(seedResult.masteryStates).toHaveLength(3);
    expect(seedResult.spacedRepetitionStates).toHaveLength(2);

    // Reopen database as the app would
    closeDatabase(testDbName);
    const db = await openDatabase(testDbName);

    // Verify workspace preferences
    const ws = await db.get('workspace', 'default-workspace');
    expect(ws).toBeDefined();
    expect(ws?.preferences.difficulty).toBe('intermediate');
    expect(ws?.preferences.model).toBe('gemini-3.8-flash');

    // Verify documents and chunks
    const docs = await db.getAll('documents');
    expect(docs).toHaveLength(2);
    const csChunks = await db.getAllFromIndex('documentChunks', 'by-document', 'doc-cs-arch');
    expect(csChunks).toHaveLength(3);

    // Verify concepts and statuses
    const concepts = await db.getAll('concepts');
    expect(concepts).toHaveLength(6);
    const masteredConcept = concepts.find((c) => c.status === 'mastered');
    expect(masteredConcept).toBeDefined();
    expect(masteredConcept?.title).toBe('Instruction Pipelining');

    // Verify dependencies
    const deps = await db.getAll('conceptDependencies');
    expect(deps).toHaveLength(4);

    // Verify active study session and path items
    const session = await db.get('studySessions', 'session-cs-active');
    expect(session).toBeDefined();
    expect(session?.machineState).toBe('WAITING_FOR_ANSWER');
    expect(session?.currentConceptId).toBe('c-coherence');

    const pathItems = await db.getAllFromIndex('studyPathItems', 'by-session', 'session-cs-active');
    expect(pathItems).toHaveLength(3);
    expect(pathItems[0].status).toBe('mastered');

    // Verify recall attempts
    const attempts = await db.getAll('recallAttempts');
    expect(attempts).toHaveLength(2);
    expect(attempts[0].compositeScore).toBeGreaterThan(70);

    // Verify SM-2 spaced repetition state (including overdue item)
    const srItems = await db.getAll('spacedRepetitionStates');
    expect(srItems).toHaveLength(2);
    const overdue = srItems.find((s) => s.conceptId === 'c-hierarchy');
    expect(overdue).toBeDefined();
    expect(new Date(overdue!.nextDueAt).getTime()).toBeLessThan(Date.now());
  });
});
