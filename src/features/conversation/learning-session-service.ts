/**
 * Learning Session Persistence Service
 * Source of truth: PRD FR-12, FR-14, TECH_STACK §5.2, §9.2
 */

import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import {
  type StudySessionRecord,
  type ConceptRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type RecallQuestionRecord,
  type RecallAttemptRecord,
  type LearningEventRecord,
} from '@/types/domain';
import { type MachineState } from './types';
import { resolveRecoveryState, isTransientState } from './machine';

export interface LoadedSessionContext {
  session: StudySessionRecord;
  wasRecovered: boolean;
  recoveredFrom?: MachineState;
  concept: ConceptRecord | null;
  document: DocumentRecord | null;
  sourceChunks: DocumentChunkRecord[];
  latestQuestion: RecallQuestionRecord | null;
  latestAttempt: RecallAttemptRecord | null;
  totalPathConcepts: number;
  completedPathConcepts: number;
}

/**
 * Loads a study session from IndexedDB, automatically detecting and resolving
 * any interrupted transient state to its safe recovery state, and retrieving
 * related concept, document, and study chunks.
 */
export async function loadSessionWithContext(
  sessionId: string,
  dbName = DB_NAME,
): Promise<LoadedSessionContext | null> {
  const db = await openDatabase(dbName);
  const session = await db.get('studySessions', sessionId);
  if (!session) return null;

  let wasRecovered = false;
  let recoveredFrom: MachineState | undefined;

  const rawState = session.machineState as MachineState;
  if (isTransientState(rawState)) {
    const safeState = resolveRecoveryState(rawState);
    if (safeState !== rawState) {
      wasRecovered = true;
      recoveredFrom = rawState;
      session.machineState = safeState;
      session.updatedAt = nowIso();
      await db.put('studySessions', session);

      // Log session restoration event
      const restoreEvent: LearningEventRecord = {
        id: generateId(),
        eventType: 'SESSION_RESTORED',
        payload: {
          sessionId,
          interruptedState: rawState,
          recoveredState: safeState,
        },
        createdAt: nowIso(),
      };
      await db.put('learningEvents', restoreEvent);
    }
  }

  // Fetch current concept if assigned
  let concept: ConceptRecord | null = null;
  if (session.currentConceptId) {
    concept = (await db.get('concepts', session.currentConceptId)) ?? null;
  }

  // Fetch document & chunks
  let document: DocumentRecord | null = null;
  let sourceChunks: DocumentChunkRecord[] = [];

  if (concept) {
    // If concept has sourceChunkIds, fetch those chunks
    if (concept.sourceChunkIds && concept.sourceChunkIds.length > 0) {
      const allChunks = await db.getAll('documentChunks');
      const chunkSet = new Set(concept.sourceChunkIds);
      sourceChunks = allChunks.filter((c) => chunkSet.has(c.id));
      sourceChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      if (sourceChunks.length > 0) {
        document = (await db.get('documents', sourceChunks[0].documentId)) ?? null;
      }
    }
  }

  // If document not found from chunks, fetch by subject or first document
  if (!document) {
    const allDocs = await db.getAll('documents');
    if (allDocs.length > 0) {
      const firstDoc = allDocs[0];
      if (firstDoc) {
        document = firstDoc;
        if (sourceChunks.length === 0) {
          sourceChunks = await db.getAllFromIndex('documentChunks', 'by-document', firstDoc.id);
          sourceChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        }
      }
    }
  }

  // Fetch latest recall question for current concept
  let latestQuestion: RecallQuestionRecord | null = null;
  if (concept) {
    const questions = await db.getAllFromIndex('recallQuestions', 'by-concept', concept.id);
    if (questions.length > 0) {
      questions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      latestQuestion = questions[0];
    }
  }

  // Fetch latest recall attempt for this session
  let latestAttempt: RecallAttemptRecord | null = null;
  const attempts = await db.getAllFromIndex('recallAttempts', 'by-session', sessionId);
  if (attempts.length > 0) {
    attempts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    latestAttempt = attempts[0];
  }

  // Calculate path progress
  const pathItems = await db.getAllFromIndex('studyPathItems', 'by-session', sessionId);
  const totalPathConcepts = pathItems.length;
  const completedPathConcepts = pathItems.filter(
    (item) => item.status === 'mastered',
  ).length;

  return {
    session,
    wasRecovered,
    recoveredFrom,
    concept,
    document,
    sourceChunks,
    latestQuestion,
    latestAttempt,
    totalPathConcepts,
    completedPathConcepts,
  };
}

/**
 * Persists updated draft answer to the active session.
 */
export async function persistDraftAnswer(
  sessionId: string,
  draftAnswer: string,
  dbName = DB_NAME,
): Promise<void> {
  const db = await openDatabase(dbName);
  const session = await db.get('studySessions', sessionId);
  if (session) {
    session.draftAnswer = draftAnswer;
    session.updatedAt = nowIso();
    await db.put('studySessions', session);
  }
}

/**
 * Persists selected confidence (1, 2, or 3) to the active session.
 */
export async function persistSelectedConfidence(
  sessionId: string,
  confidence: number,
  dbName = DB_NAME,
): Promise<void> {
  const db = await openDatabase(dbName);
  const session = await db.get('studySessions', sessionId);
  if (session) {
    session.selectedConfidence = confidence;
    session.updatedAt = nowIso();
    await db.put('studySessions', session);
  }
}

/**
 * Persists updated machineState to the active session.
 */
export async function persistMachineState(
  sessionId: string,
  state: MachineState,
  conceptId?: string,
  dbName = DB_NAME,
): Promise<void> {
  const db = await openDatabase(dbName);
  const session = await db.get('studySessions', sessionId);
  if (session) {
    session.machineState = state;
    if (conceptId) {
      session.currentConceptId = conceptId;
    }
    session.updatedAt = nowIso();
    await db.put('studySessions', session);
  }
}

/**
 * Logs a non-sensitive learning event to IndexedDB `learningEvents`.
 */
export async function logLearningEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  dbName = DB_NAME,
): Promise<void> {
  try {
    const db = await openDatabase(dbName);
    const eventRecord: LearningEventRecord = {
      id: generateId(),
      eventType,
      payload: {
        ...payload,
        timestamp: nowIso(),
      },
      createdAt: nowIso(),
    };
    await db.put('learningEvents', eventRecord);
  } catch (err) {
    console.warn('Failed to log learning event to IndexedDB:', err);
  }
}
