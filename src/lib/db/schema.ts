import { z } from 'zod';

export const SCHEMA_VERSION = 3;
export const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_RECORDS_PER_STORE = 10_000;
export const APP_VERSION = '0.1.0';

/**
 * Detect prototype pollution keys anywhere in an object tree.
 */
export function containsPrototypePollution(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsPrototypePollution);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return true;
  }
  const obj = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(obj, 'prototype')
  ) {
    return true;
  }
  for (const key of Object.keys(obj)) {
    if (containsPrototypePollution(obj[key])) {
      return true;
    }
  }
  return false;
}

export const WorkspacePreferencesSchema = z
  .object({
    model: z.string().min(1),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    reducedMotion: z.boolean(),
    reviewNotifications: z.boolean().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .strict();

export const WorkspaceSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    schemaVersion: z.number().int().min(1),
    preferences: WorkspacePreferencesSchema,
  })
  .strict();

export const DocumentSchema = z
  .object({
    id: z.string().min(1),
    materialId: z.string().optional(),
    subjectId: z.string().optional(),
    filename: z.string().min(1),
    fileType: z.enum(['pdf', 'txt', 'md']),
    fileSize: z.number().nonnegative(),
    extractedText: z.string(),
    analysisStatus: z.enum(['pending', 'processing', 'completed', 'failed']),
    fileHash: z.string().optional(),
    contentHash: z.string().min(1),
    contentVersion: z.string().optional(),
    promptVersion: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const DocumentChunkSchema = z
  .object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    materialId: z.string().optional(),
    chunkIndex: z.number().int().nonnegative(),
    text: z.string(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    pageStart: z.number().int().optional(),
    pageEnd: z.number().int().optional(),
    headingPath: z.array(z.string()).optional(),
    contentHash: z.string().min(1),
    contentVersion: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export const SubjectSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const ConceptSchema = z
  .object({
    id: z.string().min(1),
    subjectId: z.string().optional(),
    materialId: z.string().optional(),
    unitId: z.string().optional(),
    title: z.string().min(1),
    summary: z.string(),
    canonicalExplanation: z.string(),
    keyTerms: z.array(z.string()),
    sourceChunkIds: z.array(z.string()),
    tier: z.number().int().nonnegative(),
    status: z.enum(['locked', 'available', 'in_progress', 'review_due', 'mastered']),
    confidence: z.number().min(0).max(1),
    extractionOrder: z.number().int().nonnegative(),
    contentVersion: z.string().optional(),
    promptVersion: z.string().optional(),
    archived: z.boolean().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const LearningUnitSchema = z
  .object({
    id: z.string().min(1),
    materialId: z.string().min(1),
    order: z.number().int().nonnegative(),
    title: z.string().min(1),
    summary: z.string(),
    conceptIds: z.array(z.string()),
    sourceChunkIds: z.array(z.string()),
    contentVersion: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const ProcessingStageSchema = z.enum([
  'SELECTED',
  'VALIDATED',
  'EXTRACTED',
  'PREVIEWED',
  'SAVED',
  'ANALYZING',
  'UNITS_BUILT',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
]);

export const MaterialProcessingSchema = z
  .object({
    id: z.string().min(1),
    materialId: z.string().min(1),
    stage: ProcessingStageSchema,
    currentStage: ProcessingStageSchema.optional(),
    progressPercent: z.number().min(0).max(100),
    currentBatch: z.number().int().optional(),
    totalBatches: z.number().int().optional(),
    message: z.string(),
    fileHash: z.string().optional(),
    contentHash: z.string().optional(),
    contentVersion: z.string().optional(),
    promptVersion: z.string().optional(),
    counts: z
      .object({
        totalChunks: z.number().int().optional(),
        extractedConcepts: z.number().int().optional(),
        totalUnits: z.number().int().optional(),
      })
      .optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    retryable: z.boolean().optional(),
    failedStage: ProcessingStageSchema.optional(),
    analyzedBatchIndices: z.array(z.number().int()).optional(),
    accumulatedConcepts: z.array(z.record(z.unknown())).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const MaterialFileSchema = z
  .object({
    id: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.number().nonnegative(),
    createdAt: z.string().min(1),
  });

export const ConceptDependencySchema = z
  .object({
    id: z.string().min(1),
    prerequisiteId: z.string().min(1),
    dependentConceptId: z.string().min(1),
    confidence: z.number().min(0).max(1),
    removed: z.boolean(),
    removedReason: z.string().optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export const StudySessionSchema = z
  .object({
    id: z.string().min(1),
    subjectId: z.string().optional(),
    materialId: z.string().optional(),
    learningUnitId: z.string().optional(),
    machineState: z.string().min(1),
    currentConceptId: z.string().optional(),
    draftAnswer: z.string().optional(),
    selectedConfidence: z.number().int().min(1).max(3).optional(),
    sourceMode: z.enum(['document', 'topic']),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    endedAt: z.string().optional(),
  })
  .strict();

export const StudyPathItemSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    conceptId: z.string().min(1),
    orderIndex: z.number().int().nonnegative(),
    status: z.enum(['locked', 'available', 'in_progress', 'review_due', 'mastered']),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const RecallQuestionSchema = z
  .object({
    id: z.string().min(1),
    conceptId: z.string().min(1),
    materialId: z.string().optional(),
    unitId: z.string().optional(),
    prompt: z.string().min(1),
    questionStyle: z.string().min(1),
    referencePoints: z.array(z.string()),
    sourceChunkIds: z.array(z.string()),
    difficulty: z.number().int().min(1).max(5),
    expectedKeyPoints: z.array(z.string()),
    contentVersion: z.string().optional(),
    promptVersion: z.string().optional(),
    archived: z.boolean().optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export const RecallAttemptSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    questionId: z.string().min(1),
    conceptId: z.string().min(1),
    materialId: z.string().optional(),
    unitId: z.string().optional(),
    answerText: z.string(),
    confidence: z.union([z.enum(['low', 'medium', 'high']), z.number()]),
    semanticScore: z.number().min(0).max(100).nullable().optional(),
    judgeScore: z.number().min(0).max(100).nullable().optional(),
    compositeScore: z.number().min(0).max(100).nullable().optional(),
    qualityGrade: z.number().int().min(0).max(5),
    evaluationMode: z.enum(['hybrid', 'judge_only', 'judge-only', 'pending', 'fallback']),
    rubric: z.record(z.unknown()).optional(),
    pendingEvaluation: z.boolean(),
    createdAt: z.string().min(1),
  })
  .strict();

export const MasteryStateSchema = z
  .object({
    id: z.string().min(1),
    conceptId: z.string().min(1),
    materialId: z.string().optional(),
    level: z.number().int().min(0).max(4),
    percentage: z.number().min(0).max(100),
    masteryLevel: z.enum(['new', 'learning', 'familiar', 'proficient', 'mastered']).optional(),
    masteryPercent: z.number().min(0).max(100).optional(),
    bestScore: z.number().min(0).max(100),
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: z.string().optional(),
    reviewStatus: z.enum(['none', 'due', 'completed']).optional(),
    scoreHistory: z.array(z.number()).optional(),
    confidenceHistory: z.array(z.number()).optional(),
    updatedAt: z.string().min(1),
  })
  .strict();

export const SpacedRepetitionStateSchema = z
  .object({
    id: z.string().min(1),
    conceptId: z.string().min(1),
    materialId: z.string().optional(),
    repetitions: z.number().int().nonnegative(),
    easinessFactor: z.number().min(1.3),
    intervalDays: z.number().int().nonnegative(),
    lastReviewedAt: z.string().optional(),
    nextDueAt: z.string().min(1),
    lastQuality: z.number().int().min(0).max(5).optional(),
    weak: z.boolean(),
    updatedAt: z.string().min(1),
  })
  .strict();

export const ConversationMessageSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    expressionState: z.string().optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export const LearningEventSchema = z
  .object({
    id: z.string().min(1),
    eventType: z.string().min(1),
    payload: z.record(z.unknown()),
    createdAt: z.string().min(1),
  })
  .strict();

export const WorkflowSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('WHOLE_MATERIAL'),
  }),
  z.object({
    kind: z.literal('UNITS'),
    unitIds: z.array(z.string().min(1)).min(1),
  }),
]);
export type WorkflowSelection = z.infer<typeof WorkflowSelectionSchema>;

export const WorkflowStateSchema = z
  .object({
    id: z.string().min(1), // materialId
    materialId: z.string().min(1),
    selection: WorkflowSelectionSchema.default({ kind: 'WHOLE_MATERIAL' }),
    lastChosenMode: z.enum(['study', 'recall', 'revision']).optional(),
    lastSessionId: z.string().optional(),
    updatedAt: z.string().min(1),
  })
  .strict();
export type WorkflowStateRecord = z.infer<typeof WorkflowStateSchema>;

export const BackupEnvelopeSchema = z
  .object({
    format: z.literal('edumentor-backup'),
    schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
    exportedAt: z.string().min(1),
    appVersion: z.string().min(1),
    workspace: WorkspaceSchema,
    documents: z.array(DocumentSchema),
    documentChunks: z.array(DocumentChunkSchema),
    subjects: z.array(SubjectSchema),
    concepts: z.array(ConceptSchema),
    conceptDependencies: z.array(ConceptDependencySchema),
    studySessions: z.array(StudySessionSchema),
    studyPathItems: z.array(StudyPathItemSchema),
    recallQuestions: z.array(RecallQuestionSchema),
    recallAttempts: z.array(RecallAttemptSchema),
    masteryStates: z.array(MasteryStateSchema),
    spacedRepetitionStates: z.array(SpacedRepetitionStateSchema),
    conversationMessages: z.array(ConversationMessageSchema),
    learningEvents: z.array(LearningEventSchema).optional().default([]),
    learningUnits: z.array(LearningUnitSchema).optional().default([]),
    processing: z.array(MaterialProcessingSchema).optional().default([]),
    workflowState: z.array(WorkflowStateSchema).optional().default([]),
    preferences: WorkspacePreferencesSchema,
  })
  .strict();
