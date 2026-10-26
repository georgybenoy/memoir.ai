/**
 * EduMentor Domain Types
 * Single source of truth for all persistent entities in IndexedDB.
 * Source of truth: PRD §11, TECH_STACK §5.2, and Phase 2 specifications.
 */

export type DocumentAnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type DocumentFileType = 'pdf' | 'txt' | 'md';

export type ConceptStatus = 'locked' | 'available' | 'in_progress' | 'review_due' | 'mastered';
export type EvaluationMode = 'hybrid' | 'judge_only' | 'judge-only' | 'pending' | 'fallback';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'proficient' | 'mastered';
export type StudySourceMode = 'document' | 'topic';
export type MessageRole = 'user' | 'assistant' | 'system';

export type DifficultyPreference = 'beginner' | 'intermediate' | 'advanced';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface WorkspacePreferences {
  model: string;
  difficulty: DifficultyPreference;
  reducedMotion: boolean;
  reviewNotifications?: boolean;
  theme?: ThemePreference;
}

export interface WorkspaceRecord {
  id: string; // Random UUID, not a security boundary
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  preferences: WorkspacePreferences;
}

export type ProcessingStage =
  | 'SELECTED'
  | 'VALIDATED'
  | 'EXTRACTED'
  | 'PREVIEWED'
  | 'SAVED'
  | 'ANALYZING'
  | 'UNITS_BUILT'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export interface DocumentRecord {
  id: string; // Acts as materialId
  materialId?: string; // Explicit stable alias
  subjectId?: string;
  filename: string;
  fileType: DocumentFileType;
  fileSize: number;
  extractedText: string;
  analysisStatus: DocumentAnalysisStatus;
  fileHash?: string; // SHA-256 of raw file bytes
  contentHash: string; // SHA-256 of normalized extracted text
  contentVersion?: string; // Hash version stamp
  promptVersion?: string; // Prompt template version stamp
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunkRecord {
  id: string;
  documentId: string;
  materialId?: string; // Stable material link
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart?: number;
  pageEnd?: number;
  headingPath?: string[];
  contentHash: string;
  contentVersion?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SubjectRecord {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptRecord {
  id: string;
  subjectId?: string;
  materialId?: string; // Stable material link
  unitId?: string; // Link to learning unit
  title: string;
  summary: string;
  canonicalExplanation: string;
  keyTerms: string[];
  sourceChunkIds: string[];
  tier: number; // 0: foundational, 1: core, 2+: advanced
  status: ConceptStatus;
  confidence: number; // 0-1
  extractionOrder: number;
  contentVersion?: string;
  promptVersion?: string;
  archived?: boolean; // Set when material is replaced and concept is preserved
  createdAt: string;
  updatedAt: string;
}

export interface LearningUnitRecord {
  id: string; // unitId (UUID)
  materialId: string;
  order: number;
  title: string;
  summary: string;
  conceptIds: string[];
  sourceChunkIds: string[];
  contentVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialProcessingRecord {
  id: string; // materialId
  materialId: string;
  runId?: string; // Unique execution run identifier
  stage: ProcessingStage;
  currentStage?: ProcessingStage;
  progressPercent: number; // 0-100
  currentBatch?: number; // Real numbers, e.g. 3
  totalBatches?: number; // Real numbers, e.g. 8
  message: string;
  fileHash?: string;
  contentHash?: string;
  contentVersion?: string;
  promptVersion?: string;
  counts?: {
    totalChunks?: number;
    extractedConcepts?: number;
    totalUnits?: number;
  };
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  failedStage?: ProcessingStage;
  analyzedBatchIndices?: number[];
  accumulatedConcepts?: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialFileRecord {
  id: string; // materialId
  filename: string;
  mimeType: string;
  size: number;
  blob?: Blob;
  createdAt: string;
}

export interface ConceptDependencyRecord {
  id: string;
  prerequisiteId: string;
  dependentConceptId: string;
  confidence: number; // 0-1
  removed: boolean; // Flagged if removed by cycle breaker
  removedReason?: string;
  createdAt: string;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface StudySessionRecord {
  id: string;
  subjectId?: string;
  materialId?: string; // Linked material ID
  learningUnitId?: string; // Linked learning unit ID
  unitIds?: string[]; // Selected learning unit IDs in scope
  mode?: 'study' | 'recall' | 'revision'; // Current active learning mode
  status?: SessionStatus; // active | paused | completed | abandoned
  machineState: string; // 13-state machine state (IDLE, STUDYING_CONCEPT, etc.)
  currentConceptId?: string;
  currentUnitId?: string;
  currentQuestionId?: string;
  draftAnswer?: string;
  selectedConfidence?: number; // 1 (Not very), 2 (Somewhat), 3 (Very)
  sourceMode: StudySourceMode;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  summarySnapshot?: Record<string, unknown>;
}

export interface StudyPathItemRecord {
  id: string;
  sessionId: string;
  conceptId: string;
  orderIndex: number;
  status: ConceptStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecallQuestionRecord {
  id: string;
  conceptId: string;
  materialId?: string;
  unitId?: string;
  prompt: string;
  questionStyle: string; // explanation, comparison, cause/effect, process, application
  referencePoints: string[];
  sourceChunkIds: string[];
  difficulty: number; // 1-5
  expectedKeyPoints: string[];
  contentVersion?: string;
  promptVersion?: string;
  archived?: boolean;
  createdAt: string;
}

export interface RecallAttemptRecord {
  id: string;
  sessionId: string;
  questionId: string;
  conceptId: string;
  materialId?: string;
  unitId?: string;
  answerText: string;
  confidence: ConfidenceLevel | number;
  semanticScore?: number | null; // 0-100
  judgeScore?: number | null; // 0-100
  compositeScore?: number | null; // 0-100
  qualityGrade: number; // 0-5 for SM-2
  evaluationMode: EvaluationMode;
  rubric?: Record<string, unknown>;
  pendingEvaluation: boolean;
  createdAt: string;
}

export interface MasteryStateRecord {
  id: string;
  conceptId: string;
  materialId?: string;
  level: number; // 0-4
  percentage: number; // 0-100
  masteryLevel?: MasteryLevel;
  masteryPercent?: number; // 0-100 alias
  bestScore: number; // 0-100
  attemptCount: number;
  lastAttemptAt?: string;
  reviewStatus?: 'none' | 'due' | 'completed';
  scoreHistory?: number[];
  confidenceHistory?: number[];
  updatedAt: string;
}

export interface SpacedRepetitionStateRecord {
  id: string;
  conceptId: string;
  materialId?: string;
  repetitions: number;
  easinessFactor: number; // EF >= 1.30
  intervalDays: number;
  lastReviewedAt?: string;
  nextDueAt: string; // ISO-8601 string for index query
  lastQuality?: number; // 0-5
  weak: boolean; // Flagged when q < 3 for loopback
  updatedAt: string;
}

export interface ConversationMessageRecord {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  expressionState?: string; // One of 11 avatar expressions
  createdAt: string;
}

export interface LearningEventRecord {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Backup format version 1 and 2
 * Source of truth: TECH_STACK.md §6
 */
export interface EduMentorBackupEnvelope {
  format: 'edumentor-backup';
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  workspace: WorkspaceRecord;
  documents: DocumentRecord[];
  documentChunks: DocumentChunkRecord[];
  subjects: SubjectRecord[];
  concepts: ConceptRecord[];
  conceptDependencies: ConceptDependencyRecord[];
  studySessions: StudySessionRecord[];
  studyPathItems: StudyPathItemRecord[];
  recallQuestions: RecallQuestionRecord[];
  recallAttempts: RecallAttemptRecord[];
  masteryStates: MasteryStateRecord[];
  spacedRepetitionStates: SpacedRepetitionStateRecord[];
  conversationMessages: ConversationMessageRecord[];
  learningEvents?: LearningEventRecord[];
  learningUnits?: LearningUnitRecord[];
  processing?: MaterialProcessingRecord[];
  workflowState?: WorkflowStateRecord[];
  preferences: WorkspacePreferences;
}

/** Workflow selection options */
export type WorkflowSelection =
  | { kind: 'WHOLE_MATERIAL' }
  | { kind: 'UNITS'; unitIds: string[] };

/** Workflow state per material */
export interface WorkflowStateRecord {
  id: string; // materialId
  materialId: string;
  selection: WorkflowSelection;
  lastChosenMode?: 'study' | 'recall' | 'revision';
  lastSessionId?: string;
  updatedAt: string;
}

/** Step 4 Learning Launch Context Contract */
export interface LearningLaunchContext {
  materialId: string;
  selection: WorkflowSelection;
  mode: 'study' | 'recall' | 'revision';
  sessionId?: string;
}

/** Backup inspection preview summary */
export interface BackupPreviewSummary {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  workspaceId: string;
  counts: {
    documents: number;
    documentChunks: number;
    subjects: number;
    concepts: number;
    conceptDependencies: number;
    studySessions: number;
    studyPathItems: number;
    recallQuestions: number;
    recallAttempts: number;
    masteryStates: number;
    spacedRepetitionStates: number;
    conversationMessages: number;
    learningEvents: number;
    learningUnits?: number;
    processing?: number;
    workflowState?: number;
  };
}
