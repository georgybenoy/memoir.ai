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
  type LearningUnitRecord,
  type MaterialProcessingRecord,
  type MaterialFileRecord,
  type ProcessingStage,
  type WorkflowStateRecord,
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
  type ILearningUnitRepository,
  type IMaterialProcessingRepository,
  type IMaterialFileRepository,
  type IWorkflowStateRepository,
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

export class DocumentMemoryRepository
  extends BaseMemoryRepository<DocumentRecord>
  implements IDocumentRepository
{
  async listBySubject(subjectId?: string): Promise<DocumentRecord[]> {
    const all = await this.list();
    if (!subjectId) return all;
    return all.filter((d) => d.subjectId === subjectId);
  }

  async getByFileHash(fileHash: string): Promise<DocumentRecord | null> {
    const all = await this.list();
    return all.find((d) => d.fileHash === fileHash) ?? null;
  }

  async getByContentHash(contentHash: string): Promise<DocumentRecord | null> {
    const all = await this.list();
    return all.find((d) => d.contentHash === contentHash) ?? null;
  }

  async findByFilename(filename: string): Promise<DocumentRecord[]> {
    const all = await this.list();
    return all.filter((d) => d.filename === filename);
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

  async listByMaterial(materialId: string): Promise<DocumentChunkRecord[]> {
    const all = await this.list();
    return all
      .filter((c) => c.materialId === materialId)
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

  async listByMaterial(materialId: string): Promise<ConceptRecord[]> {
    const all = await this.list();
    return all.filter((c) => c.materialId === materialId);
  }

  async listByUnit(unitId: string): Promise<ConceptRecord[]> {
    const all = await this.list();
    return all.filter((c) => c.unitId === unitId);
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

  async listByMaterial(materialId: string): Promise<StudySessionRecord[]> {
    const all = await this.list();
    return all.filter((s) => s.materialId === materialId);
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

  async listByMaterial(materialId: string): Promise<RecallQuestionRecord[]> {
    const all = await this.list();
    return all.filter((q) => q.materialId === materialId);
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

  async listByMaterial(materialId: string): Promise<RecallAttemptRecord[]> {
    const all = await this.list();
    return all.filter((a) => a.materialId === materialId);
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

export class LearningUnitMemoryRepository
  extends BaseMemoryRepository<LearningUnitRecord>
  implements ILearningUnitRepository
{
  async listByMaterial(materialId: string): Promise<LearningUnitRecord[]> {
    const all = await this.list();
    return all
      .filter((u) => u.materialId === materialId)
      .sort((a, b) => a.order - b.order);
  }

  async getByMaterialAndOrder(materialId: string, order: number): Promise<LearningUnitRecord | null> {
    const all = await this.list();
    return all.find((u) => u.materialId === materialId && u.order === order) ?? null;
  }
}

export class MaterialProcessingMemoryRepository
  extends BaseMemoryRepository<MaterialProcessingRecord>
  implements IMaterialProcessingRepository
{
  async getByMaterial(materialId: string): Promise<MaterialProcessingRecord | null> {
    const all = await this.list();
    return all.find((p) => p.materialId === materialId) ?? null;
  }

  async listByStage(stage: ProcessingStage): Promise<MaterialProcessingRecord[]> {
    const all = await this.list();
    return all.filter((p) => p.stage === stage);
  }
}

export class MaterialFileMemoryRepository
  extends BaseMemoryRepository<MaterialFileRecord>
  implements IMaterialFileRepository
{
  async getByMaterial(materialId: string): Promise<MaterialFileRecord | null> {
    return this.get(materialId);
  }
}

export class WorkflowStateMemoryRepository
  extends BaseMemoryRepository<WorkflowStateRecord>
  implements IWorkflowStateRepository
{
  async getByMaterial(materialId: string): Promise<WorkflowStateRecord | null> {
    const all = await this.list();
    return all.find((w) => w.materialId === materialId) ?? null;
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
    learningUnits: new LearningUnitMemoryRepository(),
    processing: new MaterialProcessingMemoryRepository(),
    materialFiles: new MaterialFileMemoryRepository(),
    workflowState: new WorkflowStateMemoryRepository(),
  };
}
