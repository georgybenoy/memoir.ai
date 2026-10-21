import {
  type EduMentorBackupEnvelope,
  type BackupPreviewSummary,
} from '@/types/domain';
import { nowISO } from '@/lib/utils/clock';
import {
  SCHEMA_VERSION,
  APP_VERSION,
  MAX_BACKUP_SIZE_BYTES,
  BackupEnvelopeSchema,
  containsPrototypePollution,
} from './schema';
import { type StorageRepositories } from './repositories/types';

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  preview?: BackupPreviewSummary;
  parsedEnvelope?: EduMentorBackupEnvelope;
}

export interface ImportExecutionResult {
  mode: 'merge' | 'replace';
  importedCounts: Record<string, number>;
  skippedCount: number;
  rollbackExport?: EduMentorBackupEnvelope;
}

/**
 * Generate a complete JSON backup envelope from repositories.
 */
export async function createBackupEnvelope(
  repos: StorageRepositories,
): Promise<EduMentorBackupEnvelope> {
  const workspace = await repos.workspace.getOrCreateDefault();
  const [
    documents,
    documentChunks,
    subjects,
    concepts,
    conceptDependencies,
    studySessions,
    studyPathItems,
    recallQuestions,
    recallAttempts,
    masteryStates,
    spacedRepetitionStates,
    conversationMessages,
    learningEvents,
  ] = await Promise.all([
    repos.documents.list(),
    repos.chunks.list(),
    repos.subjects.list(),
    repos.concepts.list(),
    repos.dependencies.list(),
    repos.sessions.list(),
    repos.studyPath.list(),
    repos.questions.list(),
    repos.attempts.list(),
    repos.mastery.list(),
    repos.spacedRepetition.list(),
    repos.messages.list(),
    repos.events.list(),
  ]);

  return {
    format: 'edumentor-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    appVersion: APP_VERSION,
    workspace,
    documents,
    documentChunks,
    subjects,
    concepts,
    conceptDependencies,
    studySessions,
    studyPathItems,
    recallQuestions,
    recallAttempts,
    masteryStates,
    spacedRepetitionStates,
    conversationMessages,
    learningEvents,
    preferences: workspace.preferences,
  };
}

/**
 * Trigger a browser file download of the backup envelope as JSON.
 */
export function downloadBackupFile(envelope: EduMentorBackupEnvelope): void {
  const jsonStr = JSON.stringify(envelope, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = envelope.exportedAt.slice(0, 10);
  const filename = `edumentor-backup-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate a raw backup file or JSON string before any data modification.
 */
export function validateBackupFile(
  fileContent: string,
  byteSize: number,
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. File size check
  if (byteSize > MAX_BACKUP_SIZE_BYTES) {
    return {
      valid: false,
      errors: [
        `Backup file is too large (${(byteSize / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is ${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MB.`,
      ],
      warnings: [],
    };
  }

  // 2. Prototype pollution check on raw payload
  if (/(?:^|[^\\])"(?:__proto__|constructor|prototype)"\s*:/.test(fileContent)) {
    return {
      valid: false,
      errors: ['Security violation: Backup payload contains forbidden prototype keys.'],
      warnings: [],
    };
  }

  // 3. Safe parse
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fileContent);
  } catch (err) {
    return {
      valid: false,
      errors: [`Malformed JSON: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }

  // 4. Prototype pollution deep tree check
  if (containsPrototypePollution(parsedRaw)) {
    return {
      valid: false,
      errors: ['Security violation: Backup payload contains forbidden prototype keys.'],
      warnings: [],
    };
  }

  // 4. Schema validation with strict Zod
  const zodResult = BackupEnvelopeSchema.safeParse(parsedRaw);
  if (!zodResult.success) {
    const issueMessages = zodResult.error.issues
      .slice(0, 8)
      .map((i) => `Path "${i.path.join('.')}": ${i.message}`);
    return {
      valid: false,
      errors: [
        'Invalid backup format or schema structure:',
        ...issueMessages,
        zodResult.error.issues.length > 8
          ? `...and ${zodResult.error.issues.length - 8} more errors.`
          : '',
      ].filter(Boolean),
      warnings: [],
    };
  }

  const envelope = zodResult.data as EduMentorBackupEnvelope;

  // 5. Version check
  if (envelope.schemaVersion > SCHEMA_VERSION) {
    return {
      valid: false,
      errors: [
        `Unsupported schema version ${envelope.schemaVersion}. This app supports up to version ${SCHEMA_VERSION}. Please update EduMentor before restoring.`,
      ],
      warnings: [],
    };
  }

  // 6. Duplicate ID check within stores
  const storeArrays: [string, { id: string }[]][] = [
    ['documents', envelope.documents],
    ['documentChunks', envelope.documentChunks],
    ['subjects', envelope.subjects],
    ['concepts', envelope.concepts],
    ['conceptDependencies', envelope.conceptDependencies],
    ['studySessions', envelope.studySessions],
    ['studyPathItems', envelope.studyPathItems],
    ['recallQuestions', envelope.recallQuestions],
    ['recallAttempts', envelope.recallAttempts],
    ['masteryStates', envelope.masteryStates],
    ['spacedRepetitionStates', envelope.spacedRepetitionStates],
    ['conversationMessages', envelope.conversationMessages],
  ];

  for (const [storeName, items] of storeArrays) {
    const idSet = new Set<string>();
    for (const item of items) {
      if (idSet.has(item.id)) {
        errors.push(`Duplicate ID detected in ${storeName}: "${item.id}"`);
        break;
      }
      idSet.add(item.id);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 7. Relational referential integrity check
  const docIds = new Set(envelope.documents.map((d) => d.id));
  const chunkIds = new Set(envelope.documentChunks.map((c) => c.id));
  const conceptIds = new Set(envelope.concepts.map((c) => c.id));
  const sessionIds = new Set(envelope.studySessions.map((s) => s.id));

  // Chunks -> Documents
  for (const chunk of envelope.documentChunks) {
    if (!docIds.has(chunk.documentId)) {
      errors.push(
        `Chunk "${chunk.id}" references non-existent documentId "${chunk.documentId}".`,
      );
      break;
    }
  }

  // Dependencies -> Concepts
  for (const dep of envelope.conceptDependencies) {
    if (!conceptIds.has(dep.prerequisiteId)) {
      errors.push(`Dependency references non-existent prerequisiteId "${dep.prerequisiteId}".`);
      break;
    }
    if (!conceptIds.has(dep.dependentConceptId)) {
      errors.push(
        `Dependency references non-existent dependentConceptId "${dep.dependentConceptId}".`,
      );
      break;
    }
  }

  // Concept -> Source chunks (Warning if chunks omitted, not necessarily fatal error)
  for (const concept of envelope.concepts) {
    for (const sChunkId of concept.sourceChunkIds) {
      if (!chunkIds.has(sChunkId)) {
        warnings.push(`Concept "${concept.title}" references missing source chunk "${sChunkId}".`);
        break;
      }
    }
    if (warnings.length > 0) break;
  }

  // Sessions -> Messages
  for (const msg of envelope.conversationMessages) {
    if (!sessionIds.has(msg.sessionId)) {
      errors.push(`Message "${msg.id}" references non-existent sessionId "${msg.sessionId}".`);
      break;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const preview: BackupPreviewSummary = {
    format: envelope.format,
    schemaVersion: envelope.schemaVersion,
    exportedAt: envelope.exportedAt,
    appVersion: envelope.appVersion,
    workspaceId: envelope.workspace.id,
    counts: {
      documents: envelope.documents.length,
      documentChunks: envelope.documentChunks.length,
      subjects: envelope.subjects.length,
      concepts: envelope.concepts.length,
      conceptDependencies: envelope.conceptDependencies.length,
      studySessions: envelope.studySessions.length,
      studyPathItems: envelope.studyPathItems.length,
      recallQuestions: envelope.recallQuestions.length,
      recallAttempts: envelope.recallAttempts.length,
      masteryStates: envelope.masteryStates.length,
      spacedRepetitionStates: envelope.spacedRepetitionStates.length,
      conversationMessages: envelope.conversationMessages.length,
      learningEvents: envelope.learningEvents?.length ?? 0,
    },
  };

  return {
    valid: true,
    errors: [],
    warnings,
    preview,
    parsedEnvelope: envelope,
  };
}

/**
 * Execute import of a validated backup envelope in Merge or Replace mode.
 */
export async function executeImport(
  envelope: EduMentorBackupEnvelope,
  mode: 'merge' | 'replace',
  repos: StorageRepositories,
): Promise<ImportExecutionResult> {
  let rollbackExport: EduMentorBackupEnvelope | undefined;

  if (mode === 'replace') {
    // Generate safety rollback backup before replacement
    rollbackExport = await createBackupEnvelope(repos);

    // Clear existing data across all stores
    await Promise.all([
      repos.documents.clear(),
      repos.chunks.clear(),
      repos.subjects.clear(),
      repos.concepts.clear(),
      repos.dependencies.clear(),
      repos.sessions.clear(),
      repos.studyPath.clear(),
      repos.questions.clear(),
      repos.attempts.clear(),
      repos.mastery.clear(),
      repos.spacedRepetition.clear(),
      repos.messages.clear(),
      repos.events.clear(),
      repos.workspace.clear(),
    ]);

    // Insert new records
    await Promise.all([
      repos.workspace.put(envelope.workspace),
      repos.documents.putMany(envelope.documents),
      repos.chunks.putMany(envelope.documentChunks),
      repos.subjects.putMany(envelope.subjects),
      repos.concepts.putMany(envelope.concepts),
      repos.dependencies.putMany(envelope.conceptDependencies),
      repos.sessions.putMany(envelope.studySessions),
      repos.studyPath.putMany(envelope.studyPathItems),
      repos.questions.putMany(envelope.recallQuestions),
      repos.attempts.putMany(envelope.recallAttempts),
      repos.mastery.putMany(envelope.masteryStates),
      repos.spacedRepetition.putMany(envelope.spacedRepetitionStates),
      repos.messages.putMany(envelope.conversationMessages),
      envelope.learningEvents ? repos.events.putMany(envelope.learningEvents) : Promise.resolve(),
    ]);

    return {
      mode: 'replace',
      importedCounts: {
        documents: envelope.documents.length,
        documentChunks: envelope.documentChunks.length,
        concepts: envelope.concepts.length,
        recallAttempts: envelope.recallAttempts.length,
      },
      skippedCount: 0,
      rollbackExport,
    };
  }

  // Merge mode: "keep existing record on ID conflict, report skipped count"
  let skipped = 0;

  async function mergeStore<T extends { id: string }>(
    existingItems: T[],
    newItems: T[],
    putFn: (item: T) => Promise<void>,
  ): Promise<number> {
    const existingIds = new Set(existingItems.map((i) => i.id));
    let inserted = 0;
    for (const item of newItems) {
      if (existingIds.has(item.id)) {
        skipped++;
      } else {
        await putFn(item);
        inserted++;
      }
    }
    return inserted;
  }

  const [
    curDocs,
    curChunks,
    curSubjects,
    curConcepts,
    curDeps,
    curSessions,
    curItems,
    curQuestions,
    curAttempts,
    curMastery,
    curSr,
    curMessages,
    curEvents,
  ] = await Promise.all([
    repos.documents.list(),
    repos.chunks.list(),
    repos.subjects.list(),
    repos.concepts.list(),
    repos.dependencies.list(),
    repos.sessions.list(),
    repos.studyPath.list(),
    repos.questions.list(),
    repos.attempts.list(),
    repos.mastery.list(),
    repos.spacedRepetition.list(),
    repos.messages.list(),
    repos.events.list(),
  ]);

  const docCount = await mergeStore(curDocs, envelope.documents, (d) => repos.documents.put(d));
  const chunkCount = await mergeStore(curChunks, envelope.documentChunks, (c) => repos.chunks.put(c));
  await mergeStore(curSubjects, envelope.subjects, (s) => repos.subjects.put(s));
  const conceptCount = await mergeStore(curConcepts, envelope.concepts, (c) => repos.concepts.put(c));
  await mergeStore(curDeps, envelope.conceptDependencies, (d) => repos.dependencies.put(d));
  await mergeStore(curSessions, envelope.studySessions, (s) => repos.sessions.put(s));
  await mergeStore(curItems, envelope.studyPathItems, (i) => repos.studyPath.put(i));
  await mergeStore(curQuestions, envelope.recallQuestions, (q) => repos.questions.put(q));
  const attemptCount = await mergeStore(curAttempts, envelope.recallAttempts, (a) => repos.attempts.put(a));
  await mergeStore(curMastery, envelope.masteryStates, (m) => repos.mastery.put(m));
  await mergeStore(curSr, envelope.spacedRepetitionStates, (s) => repos.spacedRepetition.put(s));
  await mergeStore(curMessages, envelope.conversationMessages, (m) => repos.messages.put(m));
  if (envelope.learningEvents) {
    await mergeStore(curEvents, envelope.learningEvents, (e) => repos.events.put(e));
  }

  return {
    mode: 'merge',
    importedCounts: {
      documents: docCount,
      documentChunks: chunkCount,
      concepts: conceptCount,
      recallAttempts: attemptCount,
    },
    skippedCount: skipped,
  };
}
