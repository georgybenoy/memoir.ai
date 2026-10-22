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

export class BaseMemoryRepository<T extends { id: string }> {
  protected items = new Map<string, T>();

  async get(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async put(item: T): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async putMany(items: T[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, { ...item });
    }
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async list(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

export class WorkspaceMemoryRepository
  extends BaseMemoryRepository<WorkspaceRecord>
  implements IWorkspaceRepository
{
  async getWorkspace(): Promise<WorkspaceRecord | null> {
    return (await this.list())[0] ?? null;
  }

  async getOrCreateDefault(): Promise<WorkspaceRecord> {
    const existing = await this.getWorkspace();
    if (existing) {
      return existing;
    }

    const timestamp = nowISO();
    const defaultWorkspace: WorkspaceRecord = {
      id: 'default-workspace',
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: SCHEMA_VERSION,
      preferences: {
        model: 'gemini-2.5-flash',
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

export class DocumentMemoryRepository
  extends BaseMemoryRepository<DocumentRecord>
  implements IDocumentRepository
{
  async listBySubject(subjectId?: string): Promise<DocumentRecord[]> {
    const all = await this.list();
    if (!subjectId) return all;
    return all.filter((d) => d.subjectId === subjectId);
  }
}

export class DocumentChunkMemoryRepository
  extends BaseMemoryRepository<DocumentChunkRecord>
  implements IDocumentChunkRepository
{
  async listByDocument(documentId: string): Promise<DocumentChunkRecord[]> {
    const all = await this.list();
    return all
      .filter((c) => c.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getByDocumentAndIndex(
    documentId: string,
    index: number,
  ): Promise<DocumentChunkRecord | null> {
    const all = await this.list();
    return (
      all.find((c) => c.documentId === documentId && c.chunkIndex === index) ?? null
    );
  }
}

export class SubjectMemoryRepository
  extends BaseMemoryRepository<SubjectRecord>
  implements ISubjectRepository
{
  async findByTitle(title: string): Promise<SubjectRecord | null> {
    const all = await this.list();
    return all.find((s) => s.title === title) ?? null;
  }
}

export class ConceptMemoryRepository
  extends BaseMemoryRepository<ConceptRecord>
  implements IConceptRepository
{
  async listBySubject(subjectId?: string): Promise<ConceptRecord[]> {
    const all = await this.list();
    if (!subjectId) return all;
    return all.filter((c) => c.subjectId === subjectId);
  }

  async listByStatus(status: ConceptStatus): Promise<ConceptRecord[]> {
    const all = await this.list();
    return all.filter((c) => c.status === status);
  }
}

export class ConceptDependencyMemoryRepository
  extends BaseMemoryRepository<ConceptDependencyRecord>
  implements IConceptDependencyRepository
{
  async listByEndpoint(conceptId: string): Promise<ConceptDependencyRecord[]> {
    const all = await this.list();
    return all.filter(
      (edge) => edge.prerequisiteId === conceptId || edge.dependentConceptId === conceptId,
    );
  }

  async listByPrerequisite(prereqId: string): Promise<ConceptDependencyRecord[]> {
    const all = await this.list();
    return all.filter((edge) => edge.prerequisiteId === prereqId);
  }

  async listByDependent(depId: string): Promise<ConceptDependencyRecord[]> {
    const all = await this.list();
    return all.filter((edge) => edge.dependentConceptId === depId);
  }
}

export class StudySessionMemoryRepository
  extends BaseMemoryRepository<StudySessionRecord>
  implements IStudySessionRepository
{
  async getActiveSession(): Promise<StudySessionRecord | null> {
    const all = await this.list();
    const active = all.filter((s) => !s.endedAt);
    return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }
}

export class StudyPathItemMemoryRepository
  extends BaseMemoryRepository<StudyPathItemRecord>
  implements IStudyPathItemRepository
{
  async listBySession(sessionId: string): Promise<StudyPathItemRecord[]> {
    const all = await this.list();
    return all
      .filter((item) => item.sessionId === sessionId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
}

export class RecallQuestionMemoryRepository
  extends BaseMemoryRepository<RecallQuestionRecord>
  implements IRecallQuestionRepository
{
  async listByConcept(conceptId: string): Promise<RecallQuestionRecord[]> {
    const all = await this.list();
    return all.filter((q) => q.conceptId === conceptId);
  }
}

export class RecallAttemptMemoryRepository
  extends BaseMemoryRepository<RecallAttemptRecord>
  implements IRecallAttemptRepository
{
  async listByConcept(conceptId: string): Promise<RecallAttemptRecord[]> {
    const all = await this.list();
    return all.filter((a) => a.conceptId === conceptId);
  }

  async listBySession(sessionId: string): Promise<RecallAttemptRecord[]> {
    const all = await this.list();
    return all.filter((a) => a.sessionId === sessionId);
  }
}

export class MasteryStateMemoryRepository
  extends BaseMemoryRepository<MasteryStateRecord>
  implements IMasteryStateRepository
{
  async getByConcept(conceptId: string): Promise<MasteryStateRecord | null> {
    const all = await this.list();
    return all.find((m) => m.conceptId === conceptId) ?? null;
  }
}

export class SpacedRepetitionStateMemoryRepository
  extends BaseMemoryRepository<SpacedRepetitionStateRecord>
  implements ISpacedRepetitionStateRepository
{
  async getByConcept(conceptId: string): Promise<SpacedRepetitionStateRecord | null> {
    const all = await this.list();
    return all.find((s) => s.conceptId === conceptId) ?? null;
  }

  async listDue(beforeIsoDate: string): Promise<SpacedRepetitionStateRecord[]> {
    const all = await this.list();
    return all.filter((s) => s.nextDueAt <= beforeIsoDate);
  }
}

export class ConversationMessageMemoryRepository
  extends BaseMemoryRepository<ConversationMessageRecord>
  implements IConversationMessageRepository
{
  async listBySession(sessionId: string): Promise<ConversationMessageRecord[]> {
    const all = await this.list();
    return all
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class LearningEventMemoryRepository
  extends BaseMemoryRepository<LearningEventRecord>
  implements ILearningEventRepository
{
  async listByType(eventType: string): Promise<LearningEventRecord[]> {
    const all = await this.list();
    return all.filter((e) => e.eventType === eventType);
  }
}

export function createMemoryRepositories(): StorageRepositories {
  return {
    workspace: new WorkspaceMemoryRepository(),
    documents: new DocumentMemoryRepository(),
    chunks: new DocumentChunkMemoryRepository(),
    subjects: new SubjectMemoryRepository(),
    concepts: new ConceptMemoryRepository(),
    dependencies: new ConceptDependencyMemoryRepository(),
    sessions: new StudySessionMemoryRepository(),
    studyPath: new StudyPathItemMemoryRepository(),
    questions: new RecallQuestionMemoryRepository(),
    attempts: new RecallAttemptMemoryRepository(),
    mastery: new MasteryStateMemoryRepository(),
    spacedRepetition: new SpacedRepetitionStateMemoryRepository(),
    messages: new ConversationMessageMemoryRepository(),
    events: new LearningEventMemoryRepository(),
  };
}
