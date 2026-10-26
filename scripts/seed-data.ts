/**
 * Realistic IndexedDB Seed Data Reproduction Script
 * Schema Version: 1 (Current Schema)
 *
 * Populates all 14 IndexedDB stores with realistic multi-document learning data,
 * concepts, dependencies, study sessions, recall questions, attempts, mastery states,
 * and SM-2 spaced repetition items.
 *
 * Used for R2 migration testing against old data and development workflow testing.
 */

import { DB_NAME, runTransaction } from '../src/lib/db/indexeddb';
import { SCHEMA_VERSION } from '../src/lib/db/schema';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
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
  type WorkspaceRecord,
  type SubjectRecord,
  type EduMentorBackupEnvelope,
} from '../src/types/domain';

export interface SeedDataResult {
  documents: DocumentRecord[];
  chunks: DocumentChunkRecord[];
  concepts: ConceptRecord[];
  dependencies: ConceptDependencyRecord[];
  session: StudySessionRecord;
  pathItems: StudyPathItemRecord[];
  questions: RecallQuestionRecord[];
  attempts: RecallAttemptRecord[];
  masteryStates: MasteryStateRecord[];
  spacedRepetitionStates: SpacedRepetitionStateRecord[];
}

export function generateSeedData(baseTimeIso = '2026-10-24T12:00:00.000Z'): {
  workspace: WorkspaceRecord;
  subjects: SubjectRecord[];
  documents: DocumentRecord[];
  chunks: DocumentChunkRecord[];
  concepts: ConceptRecord[];
  dependencies: ConceptDependencyRecord[];
  session: StudySessionRecord;
  pathItems: StudyPathItemRecord[];
  questions: RecallQuestionRecord[];
  attempts: RecallAttemptRecord[];
  masteryStates: MasteryStateRecord[];
  spacedRepetitionStates: SpacedRepetitionStateRecord[];
  messages: ConversationMessageRecord[];
  learningEvents: LearningEventRecord[];
} {
  const d = new Date(baseTimeIso);
  const oneDayAgo = new Date(d.getTime() - 86400000).toISOString();
  const twoDaysAgo = new Date(d.getTime() - 86400000 * 2).toISOString();
  const threeDaysAgo = new Date(d.getTime() - 86400000 * 3).toISOString();
  const threeDaysLater = new Date(d.getTime() + 86400000 * 3).toISOString();

  // 1. Workspace
  const workspace: WorkspaceRecord = {
    id: 'default-workspace',
    createdAt: threeDaysAgo,
    updatedAt: baseTimeIso,
    schemaVersion: SCHEMA_VERSION,
    preferences: {
      model: 'gemini-3.8-flash',
      difficulty: 'intermediate',
      reducedMotion: false,
      reviewNotifications: false,
    },
  };

  // 2. Subjects
  const subjects: SubjectRecord[] = [
    {
      id: 'subj-cs',
      title: 'Computer Systems',
      description: 'Hardware architecture and low-level concurrency',
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    },
    {
      id: 'subj-ai',
      title: 'Machine Learning',
      description: 'Statistical learning theory and optimization algorithms',
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
  ];

  // 3. Documents
  const documents: DocumentRecord[] = [
    {
      id: 'doc-cs-arch',
      subjectId: 'subj-cs',
      filename: 'Computer_Systems_Architecture.pdf',
      fileType: 'pdf',
      fileSize: 84520,
      extractedText:
        'Computer Systems Architecture: CPU microarchitecture, pipelining, and the memory hierarchy.',
      analysisStatus: 'completed',
      contentHash: 'hash-cs-arch-sha256-001',
      metadata: {
        sessionId: 'session-cs-active',
        conceptCount: 3,
        dependencyCount: 2,
        pageCount: 12,
      },
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    },
    {
      id: 'doc-ml-foundations',
      subjectId: 'subj-ai',
      filename: 'Foundations_of_Machine_Learning.txt',
      fileType: 'txt',
      fileSize: 32180,
      extractedText:
        'Foundations of Machine Learning: Supervised learning paradigms, empirical risk minimization, and gradient descent.',
      analysisStatus: 'completed',
      contentHash: 'hash-ml-foundations-sha256-002',
      metadata: {
        conceptCount: 3,
        dependencyCount: 2,
        charCount: 28400,
      },
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
  ];

  // 4. Document Chunks
  const chunks: DocumentChunkRecord[] = [
    {
      id: 'chunk-cs-1',
      documentId: 'doc-cs-arch',
      chunkIndex: 0,
      text: 'Instruction pipelining divides instruction processing into discrete stages: Fetch, Decode, Execute, Memory Access, and Writeback.',
      startOffset: 0,
      endOffset: 128,
      pageStart: 1,
      pageEnd: 2,
      headingPath: ['Chapter 1', 'Pipelining'],
      contentHash: 'chunk-cs-hash-1',
      createdAt: threeDaysAgo,
    },
    {
      id: 'chunk-cs-2',
      documentId: 'doc-cs-arch',
      chunkIndex: 1,
      text: 'Memory hierarchies bridge the speed gap between high-speed CPU registers and bulk storage using L1, L2, and L3 cache memories.',
      startOffset: 129,
      endOffset: 256,
      pageStart: 3,
      pageEnd: 4,
      headingPath: ['Chapter 2', 'Memory Hierarchy'],
      contentHash: 'chunk-cs-hash-2',
      createdAt: threeDaysAgo,
    },
    {
      id: 'chunk-cs-3',
      documentId: 'doc-cs-arch',
      chunkIndex: 2,
      text: 'Cache coherence protocols, such as MESI (Modified, Exclusive, Shared, Invalid), maintain consistency across multiprocessor caches.',
      startOffset: 257,
      endOffset: 384,
      pageStart: 5,
      pageEnd: 6,
      headingPath: ['Chapter 3', 'Cache Coherence'],
      contentHash: 'chunk-cs-hash-3',
      createdAt: threeDaysAgo,
    },
    {
      id: 'chunk-ml-1',
      documentId: 'doc-ml-foundations',
      chunkIndex: 0,
      text: 'Supervised learning maps inputs to outputs using labelled training data, encompassing classification and regression tasks.',
      startOffset: 0,
      endOffset: 120,
      headingPath: ['Part 1', 'Supervised Learning'],
      contentHash: 'chunk-ml-hash-1',
      createdAt: twoDaysAgo,
    },
    {
      id: 'chunk-ml-2',
      documentId: 'doc-ml-foundations',
      chunkIndex: 1,
      text: 'Loss functions quantify prediction errors. Common examples include Mean Squared Error (MSE) and Cross-Entropy Loss.',
      startOffset: 121,
      endOffset: 240,
      headingPath: ['Part 2', 'Loss Functions'],
      contentHash: 'chunk-ml-hash-2',
      createdAt: twoDaysAgo,
    },
    {
      id: 'chunk-ml-3',
      documentId: 'doc-ml-foundations',
      chunkIndex: 2,
      text: 'Gradient descent minimizes the objective function by iteratively stepping in the direction opposite to the gradient vector.',
      startOffset: 241,
      endOffset: 360,
      headingPath: ['Part 3', 'Optimization'],
      contentHash: 'chunk-ml-hash-3',
      createdAt: twoDaysAgo,
    },
  ];

  // 5. Concepts
  const concepts: ConceptRecord[] = [
    {
      id: 'c-pipeline',
      subjectId: 'subj-cs',
      title: 'Instruction Pipelining',
      summary: 'Decomposition of CPU execution into overlapped sequential stages.',
      canonicalExplanation:
        'Instruction pipelining improves instruction throughput by executing multiple instructions concurrently across distinct hardware execution stages.',
      keyTerms: ['Pipelining', 'Throughput', 'Hazards', 'Latency'],
      sourceChunkIds: ['chunk-cs-1'],
      tier: 0,
      status: 'mastered',
      confidence: 0.96,
      extractionOrder: 0,
      createdAt: threeDaysAgo,
      updatedAt: oneDayAgo,
    },
    {
      id: 'c-hierarchy',
      subjectId: 'subj-cs',
      title: 'Memory Hierarchy',
      summary: 'Tiered storage architectures exploiting spatial and temporal locality.',
      canonicalExplanation:
        'The memory hierarchy utilizes fast, expensive caches near the processor alongside slower, larger main memory to optimize effective access latency.',
      keyTerms: ['Cache', 'Locality', 'L1 Cache', 'Latency'],
      sourceChunkIds: ['chunk-cs-2'],
      tier: 1,
      status: 'review_due',
      confidence: 0.94,
      extractionOrder: 1,
      createdAt: threeDaysAgo,
      updatedAt: twoDaysAgo,
    },
    {
      id: 'c-coherence',
      subjectId: 'subj-cs',
      title: 'Cache Coherence & MESI',
      summary: 'Protocols preventing stale reads in shared-memory multiprocessors.',
      canonicalExplanation:
        'The MESI protocol coordinates state transitions (Modified, Exclusive, Shared, Invalid) via bus snooping to enforce consistent views of shared cache lines.',
      keyTerms: ['MESI', 'Snooping', 'Bus Invalidation', 'Multiprocessing'],
      sourceChunkIds: ['chunk-cs-3'],
      tier: 2,
      status: 'in_progress',
      confidence: 0.91,
      extractionOrder: 2,
      createdAt: threeDaysAgo,
      updatedAt: baseTimeIso,
    },
    {
      id: 'c-supervised',
      subjectId: 'subj-ai',
      title: 'Supervised Learning',
      summary: 'Function approximation from paired input-target training pairs.',
      canonicalExplanation:
        'Supervised learning learns a mapping function from input features to targets by minimizing an empirical loss metric over labeled training samples.',
      keyTerms: ['Labeled Data', 'Features', 'Classification', 'Regression'],
      sourceChunkIds: ['chunk-ml-1'],
      tier: 0,
      status: 'available',
      confidence: 0.95,
      extractionOrder: 0,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
    {
      id: 'c-loss',
      subjectId: 'subj-ai',
      title: 'Empirical Loss Functions',
      summary: 'Differentiable metrics penalizing deviations between predictions and ground truth.',
      canonicalExplanation:
        'Loss functions translate task performance into a smooth scalar surface suitable for numerical optimization.',
      keyTerms: ['Mean Squared Error', 'Cross-Entropy', 'Surrogate Loss'],
      sourceChunkIds: ['chunk-ml-2'],
      tier: 1,
      status: 'locked',
      confidence: 0.92,
      extractionOrder: 1,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
    {
      id: 'c-gradient',
      subjectId: 'subj-ai',
      title: 'Gradient Descent Optimization',
      summary: 'First-order iterative optimization following the negative gradient.',
      canonicalExplanation:
        'Gradient descent computes partial derivatives with respect to model parameters and updates weights along the steepest descent direction.',
      keyTerms: ['Gradient', 'Learning Rate', 'Convexity', 'Backpropagation'],
      sourceChunkIds: ['chunk-ml-3'],
      tier: 2,
      status: 'locked',
      confidence: 0.90,
      extractionOrder: 2,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
  ];

  // 6. Dependencies
  const dependencies: ConceptDependencyRecord[] = [
    {
      id: 'dep-pipe-hier',
      prerequisiteId: 'c-pipeline',
      dependentConceptId: 'c-hierarchy',
      confidence: 0.92,
      removed: false,
      createdAt: threeDaysAgo,
    },
    {
      id: 'dep-hier-coh',
      prerequisiteId: 'c-hierarchy',
      dependentConceptId: 'c-coherence',
      confidence: 0.89,
      removed: false,
      createdAt: threeDaysAgo,
    },
    {
      id: 'dep-sup-loss',
      prerequisiteId: 'c-supervised',
      dependentConceptId: 'c-loss',
      confidence: 0.94,
      removed: false,
      createdAt: twoDaysAgo,
    },
    {
      id: 'dep-loss-grad',
      prerequisiteId: 'c-loss',
      dependentConceptId: 'c-gradient',
      confidence: 0.91,
      removed: false,
      createdAt: twoDaysAgo,
    },
  ];

  // 7. Study Session
  const session: StudySessionRecord = {
    id: 'session-cs-active',
    subjectId: 'subj-cs',
    machineState: 'WAITING_FOR_ANSWER',
    currentConceptId: 'c-coherence',
    draftAnswer: 'MESI uses four states: Modified, Exclusive, Shared, and Invalid.',
    selectedConfidence: 3,
    sourceMode: 'document',
    startedAt: twoDaysAgo,
    updatedAt: baseTimeIso,
  };

  // 8. Study Path Items
  const pathItems: StudyPathItemRecord[] = [
    {
      id: 'path-cs-1',
      sessionId: 'session-cs-active',
      conceptId: 'c-pipeline',
      orderIndex: 0,
      status: 'mastered',
      createdAt: threeDaysAgo,
      updatedAt: oneDayAgo,
    },
    {
      id: 'path-cs-2',
      sessionId: 'session-cs-active',
      conceptId: 'c-hierarchy',
      orderIndex: 1,
      status: 'review_due',
      createdAt: threeDaysAgo,
      updatedAt: twoDaysAgo,
    },
    {
      id: 'path-cs-3',
      sessionId: 'session-cs-active',
      conceptId: 'c-coherence',
      orderIndex: 2,
      status: 'in_progress',
      createdAt: threeDaysAgo,
      updatedAt: baseTimeIso,
    },
  ];

  // 9. Recall Questions
  const questions: RecallQuestionRecord[] = [
    {
      id: 'q-pipe-1',
      conceptId: 'c-pipeline',
      prompt: 'Explain how instruction pipelining increases instruction throughput in modern processors.',
      questionStyle: 'explain_plain',
      referencePoints: ['Parallel stage execution', 'Increased clock throughput', 'Hazard avoidance'],
      sourceChunkIds: ['chunk-cs-1'],
      difficulty: 2,
      expectedKeyPoints: ['throughput', 'stages', 'execution'],
      createdAt: twoDaysAgo,
    },
    {
      id: 'q-hier-1',
      conceptId: 'c-hierarchy',
      prompt: 'How do temporal and spatial locality principles inform the design of multi-level caches?',
      questionStyle: 'mechanism',
      referencePoints: ['Spatial locality: proximate memory words', 'Temporal locality: recently accessed words'],
      sourceChunkIds: ['chunk-cs-2'],
      difficulty: 3,
      expectedKeyPoints: ['spatial locality', 'temporal locality', 'cache latency'],
      createdAt: twoDaysAgo,
    },
    {
      id: 'q-coh-1',
      conceptId: 'c-coherence',
      prompt: 'What are the four states of the MESI cache coherence protocol and what does each state represent?',
      questionStyle: 'definition',
      referencePoints: ['Modified (M)', 'Exclusive (E)', 'Shared (S)', 'Invalid (I)'],
      sourceChunkIds: ['chunk-cs-3'],
      difficulty: 4,
      expectedKeyPoints: ['Modified', 'Exclusive', 'Shared', 'Invalid'],
      createdAt: oneDayAgo,
    },
  ];

  // 10. Recall Attempts
  const attempts: RecallAttemptRecord[] = [
    {
      id: 'att-pipe-1',
      sessionId: 'session-cs-active',
      questionId: 'q-pipe-1',
      conceptId: 'c-pipeline',
      answerText:
        'Pipelining divides the CPU into separate stages like fetch, decode, and execute. Multiple instructions are executed in parallel across stages, increasing throughput.',
      confidence: 'high',
      semanticScore: 92,
      judgeScore: 90,
      compositeScore: 91,
      qualityGrade: 5,
      evaluationMode: 'hybrid',
      rubric: {
        correctness: 92,
        completeness: 90,
        terminology: 90,
        strengths: ['Identified pipelined stages and parallel throughput.'],
        missingKeyPoints: [],
        misconceptions: [],
      },
      pendingEvaluation: false,
      createdAt: twoDaysAgo,
    },
    {
      id: 'att-hier-1',
      sessionId: 'session-cs-active',
      questionId: 'q-hier-1',
      conceptId: 'c-hierarchy',
      answerText:
        'Temporal locality means data used recently will likely be used again. Spatial locality means nearby data will be accessed soon.',
      confidence: 'medium',
      semanticScore: 78,
      judgeScore: 75,
      compositeScore: 77,
      qualityGrade: 3,
      evaluationMode: 'hybrid',
      rubric: {
        correctness: 80,
        completeness: 75,
        terminology: 75,
        strengths: ['Accurate definitions of spatial and temporal locality.'],
        missingKeyPoints: ['Did not mention cache line prefetching.'],
        misconceptions: [],
      },
      pendingEvaluation: false,
      createdAt: twoDaysAgo,
    },
  ];

  // 11. Mastery States
  const masteryStates: MasteryStateRecord[] = [
    {
      id: 'm-pipeline',
      conceptId: 'c-pipeline',
      level: 4,
      percentage: 95,
      masteryLevel: 'mastered',
      masteryPercent: 95,
      bestScore: 91,
      attemptCount: 2,
      lastAttemptAt: twoDaysAgo,
      reviewStatus: 'none',
      scoreHistory: [82, 91],
      confidenceHistory: [2, 3],
      updatedAt: twoDaysAgo,
    },
    {
      id: 'm-hierarchy',
      conceptId: 'c-hierarchy',
      level: 2,
      percentage: 65,
      masteryLevel: 'familiar',
      masteryPercent: 65,
      bestScore: 77,
      attemptCount: 1,
      lastAttemptAt: twoDaysAgo,
      reviewStatus: 'due',
      scoreHistory: [77],
      confidenceHistory: [2],
      updatedAt: twoDaysAgo,
    },
    {
      id: 'm-coherence',
      conceptId: 'c-coherence',
      level: 1,
      percentage: 30,
      masteryLevel: 'learning',
      masteryPercent: 30,
      bestScore: 0,
      attemptCount: 0,
      reviewStatus: 'none',
      scoreHistory: [],
      confidenceHistory: [],
      updatedAt: baseTimeIso,
    },
  ];

  // 12. Spaced Repetition (SM-2) States
  const spacedRepetitionStates: SpacedRepetitionStateRecord[] = [
    {
      id: 'sr-pipeline',
      conceptId: 'c-pipeline',
      repetitions: 2,
      easinessFactor: 2.6,
      intervalDays: 6,
      lastReviewedAt: twoDaysAgo,
      nextDueAt: threeDaysLater,
      lastQuality: 5,
      weak: false,
      updatedAt: twoDaysAgo,
    },
    {
      id: 'sr-hierarchy',
      conceptId: 'c-hierarchy',
      repetitions: 1,
      easinessFactor: 2.36,
      intervalDays: 1,
      lastReviewedAt: twoDaysAgo,
      nextDueAt: oneDayAgo, // Overdue by 1 day!
      lastQuality: 3,
      weak: false,
      updatedAt: twoDaysAgo,
    },
  ];

  // 13. Conversation Messages
  const messages: ConversationMessageRecord[] = [
    {
      id: 'msg-1',
      sessionId: 'session-cs-active',
      role: 'assistant',
      content:
        'Welcome to your study session on Cache Coherence & MESI. Let us review the four protocol states.',
      expressionState: 'Explaining',
      createdAt: oneDayAgo,
    },
    {
      id: 'msg-2',
      sessionId: 'session-cs-active',
      role: 'user',
      content: 'Can you remind me what the Modified state signifies?',
      createdAt: oneDayAgo,
    },
    {
      id: 'msg-3',
      sessionId: 'session-cs-active',
      role: 'assistant',
      content:
        'In the Modified state, the cache line is present only in the current cache and is dirty—meaning its content differs from main memory and must be written back.',
      expressionState: 'Happy',
      createdAt: oneDayAgo,
    },
  ];

  // 14. Learning Events
  const learningEvents: LearningEventRecord[] = [
    {
      id: 'ev-1',
      eventType: 'DOCUMENT_INGESTED',
      payload: { documentId: 'doc-cs-arch', chunkCount: 3 },
      createdAt: threeDaysAgo,
    },
    {
      id: 'ev-2',
      eventType: 'CONCEPTS_EXTRACTED',
      payload: { documentId: 'doc-cs-arch', count: 3 },
      createdAt: threeDaysAgo,
    },
    {
      id: 'ev-3',
      eventType: 'ATTEMPT_EVALUATED',
      payload: { conceptId: 'c-pipeline', qualityGrade: 5 },
      createdAt: twoDaysAgo,
    },
  ];

  return {
    workspace,
    subjects,
    documents,
    chunks,
    concepts,
    dependencies,
    session,
    pathItems,
    questions,
    attempts,
    masteryStates,
    spacedRepetitionStates,
    messages,
    learningEvents,
  };
}

/**
 * Seed an IndexedDB database instance with complete realistic schema v1 data.
 */
export async function seedIndexedDatabase(
  dbName = DB_NAME,
  baseTimeIso?: string,
): Promise<SeedDataResult> {
  const data = generateSeedData(baseTimeIso);

  await runTransaction(
    [
      'workspace',
      'subjects',
      'documents',
      'documentChunks',
      'concepts',
      'conceptDependencies',
      'studySessions',
      'studyPathItems',
      'recallQuestions',
      'recallAttempts',
      'masteryStates',
      'spacedRepetitionStates',
      'conversationMessages',
      'learningEvents',
    ],
    'readwrite',
    async (tx) => {
      // 1. Workspace
      await tx.objectStore('workspace').put(data.workspace);

      // 2. Subjects
      const subjStore = tx.objectStore('subjects');
      for (const subj of data.subjects) {
        await subjStore.put(subj);
      }

      // 3. Documents
      const docStore = tx.objectStore('documents');
      for (const doc of data.documents) {
        await docStore.put(doc);
      }

      // 4. Chunks
      const chunkStore = tx.objectStore('documentChunks');
      for (const chunk of data.chunks) {
        await chunkStore.put(chunk);
      }

      // 5. Concepts
      const conceptStore = tx.objectStore('concepts');
      for (const c of data.concepts) {
        await conceptStore.put(c);
      }

      // 6. Dependencies
      const depStore = tx.objectStore('conceptDependencies');
      for (const d of data.dependencies) {
        await depStore.put(d);
      }

      // 7. Study Session
      await tx.objectStore('studySessions').put(data.session);

      // 8. Study Path Items
      const pathStore = tx.objectStore('studyPathItems');
      for (const item of data.pathItems) {
        await pathStore.put(item);
      }

      // 9. Recall Questions
      const qStore = tx.objectStore('recallQuestions');
      for (const q of data.questions) {
        await qStore.put(q);
      }

      // 10. Recall Attempts
      const attStore = tx.objectStore('recallAttempts');
      for (const a of data.attempts) {
        await attStore.put(a);
      }

      // 11. Mastery States
      const mStore = tx.objectStore('masteryStates');
      for (const m of data.masteryStates) {
        await mStore.put(m);
      }

      // 12. Spaced Repetition States
      const srStore = tx.objectStore('spacedRepetitionStates');
      for (const sr of data.spacedRepetitionStates) {
        await srStore.put(sr);
      }

      // 13. Messages
      const msgStore = tx.objectStore('conversationMessages');
      for (const msg of data.messages) {
        await msgStore.put(msg);
      }

      // 14. Learning Events
      const evStore = tx.objectStore('learningEvents');
      for (const ev of data.learningEvents) {
        await evStore.put(ev);
      }
    },
    dbName,
  );

  return {
    documents: data.documents,
    chunks: data.chunks,
    concepts: data.concepts,
    dependencies: data.dependencies,
    session: data.session,
    pathItems: data.pathItems,
    questions: data.questions,
    attempts: data.attempts,
    masteryStates: data.masteryStates,
    spacedRepetitionStates: data.spacedRepetitionStates,
  };
}

/**
 * Exports seed data as a valid EduMentor backup envelope.
 */
export function generateSeedBackupEnvelope(baseTimeIso?: string): EduMentorBackupEnvelope {
  const data = generateSeedData(baseTimeIso);
  return {
    format: 'edumentor-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: data.workspace.updatedAt,
    appVersion: '0.1.0',
    workspace: data.workspace,
    documents: data.documents,
    documentChunks: data.chunks,
    subjects: data.subjects,
    concepts: data.concepts,
    conceptDependencies: data.dependencies,
    studySessions: [data.session],
    studyPathItems: data.pathItems,
    recallQuestions: data.questions,
    recallAttempts: data.attempts,
    masteryStates: data.masteryStates,
    spacedRepetitionStates: data.spacedRepetitionStates,
    conversationMessages: data.messages,
    learningEvents: data.learningEvents,
    preferences: data.workspace.preferences,
  };
}
