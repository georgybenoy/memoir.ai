import {
  type WorkspaceRecord,
  type WorkspacePreferences,
  type DocumentRecord,
  type DocumentChunkRecord,
  type SubjectRecord,
  type ConceptRecord,
  type ConceptDependencyRecord,
  type StudySessionRecord,
  type StudyPathItemRecord,
  type RecallQuestionRecord,
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type SpacedRepetitionStateRecord,
  type ConversationMessageRecord,
  type LearningEventRecord,
  type ConceptStatus,
} from '@/types/domain';
import { nowISO } from '@/lib/utils/clock';
import { openDatabase, DB_NAME, type StoreName, type EduMentorDBSchema, safeWrite } from '../indexeddb';
import { SCHEMA_VERSION } from '../schema';
import {
  type IWorkspaceRepository,
  type IDocumentRepository,
  type IDocumentChunkRepository,
  type ISubjectRepository,
  type IConceptRepository,
  type IConceptDependencyRepository,
  type IStudySessionRepository,
  type IStudyPathItemRepository,
  type IRecallQuestionRepository,
  type IRecallAttemptRepository,
  type IMasteryStateRepository,
  type ISpacedRepetitionStateRepository,
  type IConversationMessageRepository,
  type ILearningEventRepository,
  type StorageRepositories,
} from './types';

export class BaseIdbRepository<T extends { id: string }, SName extends StoreName> {
  constructor(
    protected readonly storeName: SName,
    protected readonly dbName: string = DB_NAME,
  ) {}

  async get(id: string): Promise<T | null> {
    const db = await openDatabase(this.dbName);
    const item = await db.get(this.storeName, id);
    return (item as T) ?? null;
  }

  async put(item: T): Promise<void> {
    await safeWrite(async () => {
      const db = await openDatabase(this.dbName);
      await db.put(this.storeName, item as unknown as EduMentorDBSchema[SName]['value']);
    });
  }

  async putMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    await safeWrite(async () => {
      const db = await openDatabase(this.dbName);
      const tx = db.transaction(this.storeName, 'readwrite');
      for (const item of items) {
        await tx.store.put(item as unknown as EduMentorDBSchema[SName]['value']);
      }
      await tx.done;
    });
  }

  async delete(id: string): Promise<void> {
    await safeWrite(async () => {
      const db = await openDatabase(this.dbName);
      await db.delete(this.storeName, id);
    });
  }

  async list(): Promise<T[]> {
    const db = await openDatabase(this.dbName);
    const items = await db.getAll(this.storeName);
    return (items as T[]) ?? [];
  }

  async clear(): Promise<void> {
    await safeWrite(async () => {
      const db = await openDatabase(this.dbName);
      await db.clear(this.storeName);
    });
  }
}

export class WorkspaceIdbRepository
  extends BaseIdbRepository<WorkspaceRecord, 'workspace'>
  implements IWorkspaceRepository
{
  constructor(dbName = DB_NAME) {
    super('workspace', dbName);
  }

  async getWorkspace(): Promise<WorkspaceRecord | null> {
    const list = await this.list();
    return list[0] ?? null;
  }

  async getOrCreateDefault(): Promise<WorkspaceRecord> {
    const existing = await this.getWorkspace();
    if (existing) {
      if (existing.preferences?.model === 'gemini-2.5-flash') {
        existing.preferences.model = 'gemini-3.8-flash';
        await this.put(existing);
      }
      return existing;
    }

    const timestamp = nowISO();
    const defaultWorkspace: WorkspaceRecord = {
      id: 'default-workspace',
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: SCHEMA_VERSION,
      preferences: {
        model: 'gemini-3.8-flash',
        difficulty: 'intermediate',
        reducedMotion: false,
      },
    };

    await this.put(defaultWorkspace);
    return defaultWorkspace;
  }

  async updatePreferences(prefs: Partial<WorkspacePreferences>): Promise<WorkspaceRecord> {
    const current = await this.getOrCreateDefault();
    const updated: WorkspaceRecord = {
      ...current,
      updatedAt: nowISO(),
      preferences: {
        ...current.preferences,
        ...prefs,
      },
    };
    await this.put(updated);
    return updated;
  }
}

export class DocumentIdbRepository
  extends BaseIdbRepository<DocumentRecord, 'documents'>
  implements IDocumentRepository
{
  constructor(dbName = DB_NAME) {
    super('documents', dbName);
  }

  async listBySubject(subjectId?: string): Promise<DocumentRecord[]> {
    const db = await openDatabase(this.dbName);
    if (!subjectId) {
      return this.list();
    }
    const items = await db.getAllFromIndex('documents', 'by-subject', subjectId);
    return items ?? [];
  }
}

export class DocumentChunkIdbRepository
  extends BaseIdbRepository<DocumentChunkRecord, 'documentChunks'>
  implements IDocumentChunkRepository
{
  constructor(dbName = DB_NAME) {
    super('documentChunks', dbName);
  }

  async listByDocument(documentId: string): Promise<DocumentChunkRecord[]> {
    const db = await openDatabase(this.dbName);
    const items = await db.getAllFromIndex('documentChunks', 'by-document', documentId);
    return (items ?? []).sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getByDocumentAndIndex(
    documentId: string,
    index: number,
  ): Promise<DocumentChunkRecord | null> {
    const db = await openDatabase(this.dbName);
    const item = await db.getFromIndex('documentChunks', 'by-doc-index', [documentId, index]);
    return item ?? null;
  }
}

export class SubjectIdbRepository
  extends BaseIdbRepository<SubjectRecord, 'subjects'>
  implements ISubjectRepository
{
  constructor(dbName = DB_NAME) {
    super('subjects', dbName);
  }

  async findByTitle(title: string): Promise<SubjectRecord | null> {
    const db = await openDatabase(this.dbName);
    const item = await db.getFromIndex('subjects', 'by-title', title);
    return item ?? null;
  }
}

export class ConceptIdbRepository
  extends BaseIdbRepository<ConceptRecord, 'concepts'>
  implements IConceptRepository
{
  constructor(dbName = DB_NAME) {
    super('concepts', dbName);
  }

  async listBySubject(subjectId?: string): Promise<ConceptRecord[]> {
    const db = await openDatabase(this.dbName);
    if (!subjectId) {
      return this.list();
    }
    const items = await db.getAllFromIndex('concepts', 'by-subject', subjectId);
    return items ?? [];
  }

  async listByStatus(status: ConceptStatus): Promise<ConceptRecord[]> {
    const db = await openDatabase(this.dbName);
    const items = await db.getAllFromIndex('concepts', 'by-status', status);
    return items ?? [];
  }
}

export class ConceptDependencyIdbRepository
  extends BaseIdbRepository<ConceptDependencyRecord, 'conceptDependencies'>
  implements IConceptDependencyRepository
{
  constructor(dbName = DB_NAME) {
    super('conceptDependencies', dbName);
  }

  async listByEndpoint(conceptId: string): Promise<ConceptDependencyRecord[]> {
    const db = await openDatabase(this.dbName);
    const [asPrereq, asDep] = await Promise.all([
      db.getAllFromIndex('conceptDependencies', 'by-prerequisite', conceptId),
      db.getAllFromIndex('conceptDependencies', 'by-dependent', conceptId),
    ]);
    const map = new Map<string, ConceptDependencyRecord>();
    for (const edge of [...asPrereq, ...asDep]) {
      map.set(edge.id, edge);
    }
    return Array.from(map.values());
  }

  async listByPrerequisite(prereqId: string): Promise<ConceptDependencyRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('conceptDependencies', 'by-prerequisite', prereqId)) ?? [];
  }

  async listByDependent(depId: string): Promise<ConceptDependencyRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('conceptDependencies', 'by-dependent', depId)) ?? [];
  }
}

export class StudySessionIdbRepository
  extends BaseIdbRepository<StudySessionRecord, 'studySessions'>
  implements IStudySessionRepository
{
  constructor(dbName = DB_NAME) {
    super('studySessions', dbName);
  }

  async getActiveSession(): Promise<StudySessionRecord | null> {
    const all = await this.list();
    const active = all.filter((s) => !s.endedAt);
    return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }
}

export class StudyPathItemIdbRepository
  extends BaseIdbRepository<StudyPathItemRecord, 'studyPathItems'>
  implements IStudyPathItemRepository
{
  constructor(dbName = DB_NAME) {
    super('studyPathItems', dbName);
  }

  async listBySession(sessionId: string): Promise<StudyPathItemRecord[]> {
    const db = await openDatabase(this.dbName);
    const items = await db.getAllFromIndex('studyPathItems', 'by-session', sessionId);
    return (items ?? []).sort((a, b) => a.orderIndex - b.orderIndex);
  }
}

export class RecallQuestionIdbRepository
  extends BaseIdbRepository<RecallQuestionRecord, 'recallQuestions'>
  implements IRecallQuestionRepository
{
  constructor(dbName = DB_NAME) {
    super('recallQuestions', dbName);
  }

  async listByConcept(conceptId: string): Promise<RecallQuestionRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('recallQuestions', 'by-concept', conceptId)) ?? [];
  }
}

export class RecallAttemptIdbRepository
  extends BaseIdbRepository<RecallAttemptRecord, 'recallAttempts'>
  implements IRecallAttemptRepository
{
  constructor(dbName = DB_NAME) {
    super('recallAttempts', dbName);
  }

  async listByConcept(conceptId: string): Promise<RecallAttemptRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('recallAttempts', 'by-concept', conceptId)) ?? [];
  }

  async listBySession(sessionId: string): Promise<RecallAttemptRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('recallAttempts', 'by-session', sessionId)) ?? [];
  }
}

export class MasteryStateIdbRepository
  extends BaseIdbRepository<MasteryStateRecord, 'masteryStates'>
  implements IMasteryStateRepository
{
  constructor(dbName = DB_NAME) {
    super('masteryStates', dbName);
  }

  async getByConcept(conceptId: string): Promise<MasteryStateRecord | null> {
    const db = await openDatabase(this.dbName);
    const item = await db.getFromIndex('masteryStates', 'by-concept', conceptId);
    return item ?? null;
  }
}

export class SpacedRepetitionStateIdbRepository
  extends BaseIdbRepository<SpacedRepetitionStateRecord, 'spacedRepetitionStates'>
  implements ISpacedRepetitionStateRepository
{
  constructor(dbName = DB_NAME) {
    super('spacedRepetitionStates', dbName);
  }

  async getByConcept(conceptId: string): Promise<SpacedRepetitionStateRecord | null> {
    const db = await openDatabase(this.dbName);
    const item = await db.getFromIndex('spacedRepetitionStates', 'by-concept', conceptId);
    return item ?? null;
  }

  async listDue(beforeIsoDate: string): Promise<SpacedRepetitionStateRecord[]> {
    const db = await openDatabase(this.dbName);
    const range = IDBKeyRange.upperBound(beforeIsoDate);
    const items = await db.getAllFromIndex('spacedRepetitionStates', 'by-next-due', range);
    return items ?? [];
  }
}

export class ConversationMessageIdbRepository
  extends BaseIdbRepository<ConversationMessageRecord, 'conversationMessages'>
  implements IConversationMessageRepository
{
  constructor(dbName = DB_NAME) {
    super('conversationMessages', dbName);
  }

  async listBySession(sessionId: string): Promise<ConversationMessageRecord[]> {
    const db = await openDatabase(this.dbName);
    const items = await db.getAllFromIndex('conversationMessages', 'by-session', sessionId);
    return (items ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class LearningEventIdbRepository
  extends BaseIdbRepository<LearningEventRecord, 'learningEvents'>
  implements ILearningEventRepository
{
  constructor(dbName = DB_NAME) {
    super('learningEvents', dbName);
  }

  async listByType(eventType: string): Promise<LearningEventRecord[]> {
    const db = await openDatabase(this.dbName);
    return (await db.getAllFromIndex('learningEvents', 'by-event-type', eventType)) ?? [];
  }
}

/** Factory that creates full IndexedDB repositories container */
export function createIdbRepositories(dbName = DB_NAME): StorageRepositories {
  return {
    workspace: new WorkspaceIdbRepository(dbName),
    documents: new DocumentIdbRepository(dbName),
    chunks: new DocumentChunkIdbRepository(dbName),
    subjects: new SubjectIdbRepository(dbName),
    concepts: new ConceptIdbRepository(dbName),
    dependencies: new ConceptDependencyIdbRepository(dbName),
    sessions: new StudySessionIdbRepository(dbName),
    studyPath: new StudyPathItemIdbRepository(dbName),
    questions: new RecallQuestionIdbRepository(dbName),
    attempts: new RecallAttemptIdbRepository(dbName),
    mastery: new MasteryStateIdbRepository(dbName),
    spacedRepetition: new SpacedRepetitionStateIdbRepository(dbName),
    messages: new ConversationMessageIdbRepository(dbName),
    events: new LearningEventIdbRepository(dbName),
  };
}
