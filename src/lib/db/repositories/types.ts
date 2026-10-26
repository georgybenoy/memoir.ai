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

export interface BaseRepository<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<T[]>;
  clear(): Promise<void>;
}

export interface IWorkspaceRepository extends BaseRepository<WorkspaceRecord> {
  getWorkspace(): Promise<WorkspaceRecord | null>;
  getOrCreateDefault(): Promise<WorkspaceRecord>;
  updatePreferences(prefs: Partial<WorkspacePreferences>): Promise<WorkspaceRecord>;
}

export interface IDocumentRepository extends BaseRepository<DocumentRecord> {
  listBySubject(subjectId?: string): Promise<DocumentRecord[]>;
  getByFileHash(fileHash: string): Promise<DocumentRecord | null>;
  getByContentHash(contentHash: string): Promise<DocumentRecord | null>;
  findByFilename(filename: string): Promise<DocumentRecord[]>;
}

export interface IDocumentChunkRepository extends BaseRepository<DocumentChunkRecord> {
  listByDocument(documentId: string): Promise<DocumentChunkRecord[]>;
  listByMaterial(materialId: string): Promise<DocumentChunkRecord[]>;
  getByDocumentAndIndex(documentId: string, index: number): Promise<DocumentChunkRecord | null>;
}

export interface ISubjectRepository extends BaseRepository<SubjectRecord> {
  findByTitle(title: string): Promise<SubjectRecord | null>;
}

export interface IConceptRepository extends BaseRepository<ConceptRecord> {
  listBySubject(subjectId?: string): Promise<ConceptRecord[]>;
  listByStatus(status: ConceptStatus): Promise<ConceptRecord[]>;
  listByMaterial(materialId: string): Promise<ConceptRecord[]>;
  listByUnit(unitId: string): Promise<ConceptRecord[]>;
}

export interface IConceptDependencyRepository extends BaseRepository<ConceptDependencyRecord> {
  listByEndpoint(conceptId: string): Promise<ConceptDependencyRecord[]>;
  listByPrerequisite(prereqId: string): Promise<ConceptDependencyRecord[]>;
  listByDependent(depId: string): Promise<ConceptDependencyRecord[]>;
}

export interface IStudySessionRepository extends BaseRepository<StudySessionRecord> {
  getActiveSession(): Promise<StudySessionRecord | null>;
  listByMaterial(materialId: string): Promise<StudySessionRecord[]>;
}

export interface IStudyPathItemRepository extends BaseRepository<StudyPathItemRecord> {
  listBySession(sessionId: string): Promise<StudyPathItemRecord[]>;
}

export interface IRecallQuestionRepository extends BaseRepository<RecallQuestionRecord> {
  listByConcept(conceptId: string): Promise<RecallQuestionRecord[]>;
  listByMaterial(materialId: string): Promise<RecallQuestionRecord[]>;
}

export interface IRecallAttemptRepository extends BaseRepository<RecallAttemptRecord> {
  listByConcept(conceptId: string): Promise<RecallAttemptRecord[]>;
  listBySession(sessionId: string): Promise<RecallAttemptRecord[]>;
  listByMaterial(materialId: string): Promise<RecallAttemptRecord[]>;
}

export interface IMasteryStateRepository extends BaseRepository<MasteryStateRecord> {
  getByConcept(conceptId: string): Promise<MasteryStateRecord | null>;
}

export interface ISpacedRepetitionStateRepository extends BaseRepository<SpacedRepetitionStateRecord> {
  getByConcept(conceptId: string): Promise<SpacedRepetitionStateRecord | null>;
  listDue(beforeIsoDate: string): Promise<SpacedRepetitionStateRecord[]>;
}

export interface IConversationMessageRepository extends BaseRepository<ConversationMessageRecord> {
  listBySession(sessionId: string): Promise<ConversationMessageRecord[]>;
}

export interface ILearningEventRepository extends BaseRepository<LearningEventRecord> {
  listByType(eventType: string): Promise<LearningEventRecord[]>;
}

export interface ILearningUnitRepository extends BaseRepository<LearningUnitRecord> {
  listByMaterial(materialId: string): Promise<LearningUnitRecord[]>;
  getByMaterialAndOrder(materialId: string, order: number): Promise<LearningUnitRecord | null>;
}

export interface IMaterialProcessingRepository extends BaseRepository<MaterialProcessingRecord> {
  getByMaterial(materialId: string): Promise<MaterialProcessingRecord | null>;
  listByStage(stage: ProcessingStage): Promise<MaterialProcessingRecord[]>;
}

export interface IMaterialFileRepository extends BaseRepository<MaterialFileRecord> {
  getByMaterial(materialId: string): Promise<MaterialFileRecord | null>;
}

export interface IWorkflowStateRepository extends BaseRepository<WorkflowStateRecord> {
  getByMaterial(materialId: string): Promise<WorkflowStateRecord | null>;
}

export interface StorageRepositories {
  workspace: IWorkspaceRepository;
  documents: IDocumentRepository;
  chunks: IDocumentChunkRepository;
  subjects: ISubjectRepository;
  concepts: IConceptRepository;
  dependencies: IConceptDependencyRepository;
  sessions: IStudySessionRepository;
  studyPath: IStudyPathItemRepository;
  questions: IRecallQuestionRepository;
  attempts: IRecallAttemptRepository;
  mastery: IMasteryStateRepository;
  spacedRepetition: ISpacedRepetitionStateRepository;
  messages: IConversationMessageRepository;
  events: ILearningEventRepository;
  learningUnits: ILearningUnitRepository;
  processing: IMaterialProcessingRepository;
  materialFiles: IMaterialFileRepository;
  workflowState: IWorkflowStateRepository;
}
