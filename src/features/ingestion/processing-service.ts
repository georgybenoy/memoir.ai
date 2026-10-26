import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type MaterialProcessingRecord,
  type ProcessingStage,
  type MaterialFileRecord,
  type ConceptRecord,
} from '@/types/domain';
import { generateId } from '@/lib/utils/id';
import { nowISO } from '@/lib/utils/clock';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { getStorage } from '@/lib/db/bootstrap';
import { validateUploadFile } from './validate';
import { extractDocumentText } from './extract-text';
import { normalizeDocument } from './normalize';
import { chunkDocument, type ChunkOptions } from './chunk';
import { partitionChunksIntoBatches } from '@/features/concepts/pipeline';
import { deduplicateConcepts, normalizeConceptTitle } from '@/features/concepts/deduplicate';
import { buildDependencyGraph } from '@/features/dependency-graph';
import { buildLearningUnits } from '@/features/learning-units/builder';
import { planReplaceMaterialConcepts } from '@/features/learning-units/reprocess-replace';
import { fetchExtractConcepts } from '@/lib/ai/client';
import { type ExtractedConceptDto } from '@/lib/ai/schemas';
import { evaluateBlobStorage, computeFileHash, computeContentHash } from './duplicates';
import { type ExtractedHeading } from './types';
import { processingJobManager } from './job-manager';

export interface ProcessMaterialOptions {
  file: {
    name: string;
    size: number;
    type?: string;
    lastModified?: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };
  materialId?: string; // If replacing or resuming an existing material
  runId?: string; // Optional unique execution run identifier
  subjectId?: string;
  chunkOptions?: ChunkOptions;
  signal?: AbortSignal;
  onProgress?: (record: MaterialProcessingRecord) => void;
  customRepos?: StorageRepositories;
  throttleDelayMs?: number;
}

/**
 * Persists an update to the material processing record.
 */
export async function updateProcessingStage(
  materialId: string,
  stage: ProcessingStage,
  details: Partial<MaterialProcessingRecord>,
  repos: StorageRepositories,
): Promise<MaterialProcessingRecord> {
  const existing = await repos.processing.get(materialId);
  const now = nowISO();

  const record: MaterialProcessingRecord = {
    id: materialId,
    materialId,
    runId: details.runId ?? existing?.runId,
    stage,
    progressPercent: details.progressPercent ?? existing?.progressPercent ?? 0,
    message: details.message ?? existing?.message ?? `Stage: ${stage}`,
    currentBatch: details.currentBatch ?? existing?.currentBatch,
    totalBatches: details.totalBatches ?? existing?.totalBatches,
    fileHash: details.fileHash ?? existing?.fileHash,
    contentHash: details.contentHash ?? existing?.contentHash,
    contentVersion: details.contentVersion ?? existing?.contentVersion,
    promptVersion: details.promptVersion ?? existing?.promptVersion ?? '1.0',
    counts: details.counts ?? existing?.counts,
    errorCode: details.errorCode,
    errorMessage: details.errorMessage,
    retryable: details.retryable,
    failedStage: details.failedStage,
    analyzedBatchIndices: details.analyzedBatchIndices ?? existing?.analyzedBatchIndices ?? [],
    accumulatedConcepts: details.accumulatedConcepts ?? existing?.accumulatedConcepts ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await repos.processing.put(record);
  processingJobManager.notify(materialId, record);
  return record;
}

/**
 * Execute or Resume the persisted Material Processing Lifecycle:
 * SELECTED -> VALIDATED -> EXTRACTED -> PREVIEWED -> SAVED -> ANALYZING -> UNITS_BUILT -> COMPLETE.
 *
 * Checkpointed: Batches already analyzed are saved and skipped on resume.
 * Source text and chunks are permanently saved before ANALYZING begins, so Gemini failures
 * never delete user content.
 */
export async function processMaterialLifecycle(
  options: ProcessMaterialOptions,
): Promise<{ success: boolean; materialId: string; record: MaterialProcessingRecord; error?: string }> {
  const { file, subjectId, chunkOptions, customRepos, throttleDelayMs } = options;
  const repos = customRepos ?? getStorage();

  const materialId = options.materialId ?? generateId();
  const runId = options.runId ?? generateId();

  // If there is already an active in-flight job for this material, join it instead of spawning a duplicate!
  const existingJob = processingJobManager.getJob<{
    success: boolean;
    materialId: string;
    record: MaterialProcessingRecord;
    error?: string;
  }>(materialId);
  if (existingJob) {
    if (options.onProgress) {
      existingJob.listeners.add(options.onProgress);
    }
    return existingJob.promise;
  }

  const internalController = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      internalController.abort();
    } else {
      options.signal.addEventListener('abort', () => internalController.abort(), { once: true });
    }
  }

  const runPromise = (async () => {
    let currentRunningStage: ProcessingStage = 'SELECTED';

    // Helper to publish and persist progress
    async function notifyStage(
      stage: ProcessingStage,
      details: Partial<MaterialProcessingRecord>,
    ): Promise<MaterialProcessingRecord> {
      currentRunningStage = stage;
      const updated = await updateProcessingStage(materialId, stage, { ...details, runId }, repos);
      options.onProgress?.(updated);
      return updated;
    }

    let procRecord: MaterialProcessingRecord | null | undefined;

    try {
      if (internalController.signal.aborted) {
        const rec = await notifyStage('CANCELLED', { message: 'Processing cancelled by user.' });
        return { success: false, materialId, record: rec };
      }

      // Check existing processing record and saved data for resume
      procRecord = await repos.processing.get(materialId);
      const existingDoc = await repos.documents.get(materialId);
      const existingChunks = await repos.chunks.listByMaterial(materialId);

      let chunks: DocumentChunkRecord[] = [];
      let contentHash = existingDoc?.contentHash ?? '';
      let extractedHeadings: ExtractedHeading[] | undefined = (existingDoc?.metadata?.headings as ExtractedHeading[] | undefined) ?? [];

      if (existingDoc && existingChunks.length > 0) {
        // Document is already validated, extracted, and chunked! Skip stages 1-5 to resume directly
        chunks = existingChunks;
        if (procRecord) {
          currentRunningStage = procRecord.stage;
        }
      } else {
        // Read ArrayBuffer and maintain a clean clone so pdfjs-dist's Web Worker
        // cannot detach/neuter the buffer used for Blob storage and hashes
        const rawBuffer = await file.arrayBuffer();
        const buffer = rawBuffer.slice(0);
        const uint8 = new Uint8Array(buffer);
        const fileHash = await computeFileHash(uint8);

        // --- STAGE 1: SELECTED ---
        if (!procRecord || procRecord.stage === 'SELECTED') {
          procRecord = await notifyStage('SELECTED', {
            progressPercent: 5,
            message: `Selected file "${file.name}"`,
            fileHash,
          });
        }

        // --- STAGE 2: VALIDATED ---
        const headerSample = uint8.slice(0, Math.min(uint8.length, 8192));
        const validation = validateUploadFile(file.name, file.size, file.type, headerSample);
        if (!validation.valid) {
          const rec = await notifyStage('FAILED', {
            progressPercent: 0,
            failedStage: 'VALIDATED',
            errorCode: validation.code ?? 'INVALID_FILE',
            errorMessage: validation.error ?? 'File validation failed.',
            retryable: false,
          });
          return { success: false, materialId, record: rec, error: validation.error };
        }

        procRecord = await notifyStage('VALIDATED', {
          progressPercent: 15,
          message: `Validated "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`,
        });

        if (internalController.signal.aborted) {
          const rec = await notifyStage('CANCELLED', { message: 'Cancelled after validation.' });
          return { success: false, materialId, record: rec };
        }

        // --- STAGE 3: EXTRACTED ---
        const extracted = await extractDocumentText(
          new Uint8Array(buffer.slice(0)),
          validation.fileType!,
          file.name,
          undefined,
          internalController.signal,
        );

        const normalized = normalizeDocument(extracted);
        if (normalized.text.trim().length === 0) {
          const rec = await notifyStage('FAILED', {
            progressPercent: 0,
            failedStage: 'EXTRACTED',
            errorCode: 'EMPTY_TEXT',
            errorMessage: 'Document contains no readable text.',
            retryable: false,
          });
          return { success: false, materialId, record: rec, error: 'Document contains no readable text.' };
        }

        contentHash = await computeContentHash(normalized.text);
        extractedHeadings = extracted.headings;

        procRecord = await notifyStage('EXTRACTED', {
          progressPercent: 35,
          message: `Extracted ${normalized.text.length} characters of study material.`,
          contentHash,
          contentVersion: contentHash,
        });

        // --- STAGE 4: PREVIEWED ---
        procRecord = await notifyStage('PREVIEWED', {
          progressPercent: 45,
          message: 'Document structure previewed and confirmed.',
        });

        // --- STAGE 5: SAVED ---
        chunks = await chunkDocument(normalized, materialId, chunkOptions);

        const now = nowISO();
        const docRecord: DocumentRecord = {
          id: materialId,
          materialId,
          subjectId,
          filename: file.name,
          fileType: validation.fileType!,
          fileSize: file.size,
          extractedText: normalized.text,
          analysisStatus: 'pending',
          fileHash,
          contentHash,
          contentVersion: contentHash,
          promptVersion: '1.0',
          metadata: {
            originalFilename: file.name,
            fileSize: file.size,
            pageCount: extracted.metadata.pageCount,
            rawCharCount: extracted.rawText.length,
            normalizedCharCount: normalized.normalizedCharCount,
            chunkCount: chunks.length,
            headings: extracted.headings ?? [],
            ...extracted.metadata,
          },
          createdAt: existingDoc?.createdAt ?? now,
          updatedAt: now,
        };

        for (const ch of chunks) {
          ch.materialId = materialId;
          ch.contentVersion = contentHash;
        }

        const blobDecision = evaluateBlobStorage(file.size);
        if (blobDecision.storeBlob && buffer.byteLength > 0) {
          const fileRecord: MaterialFileRecord = {
            id: materialId,
            filename: file.name,
            mimeType: file.type || validation.mimeType || 'application/octet-stream',
            size: file.size,
            blob: new Blob([buffer.slice(0)], { type: file.type || validation.mimeType }),
            createdAt: now,
          };
          await repos.materialFiles.put(fileRecord);
        }

        await repos.documents.put(docRecord);
        await repos.chunks.putMany(chunks);

        procRecord = await notifyStage('SAVED', {
          progressPercent: 60,
          message: `Saved ${chunks.length} study chunks to local library.`,
          counts: {
            totalChunks: chunks.length,
            extractedConcepts: 0,
            totalUnits: 0,
          },
        });
      }

      if (internalController.signal.aborted) {
        const rec = await notifyStage('CANCELLED', { message: 'Cancelled after saving chunks.' });
        return { success: false, materialId, record: rec };
      }

      // --- STAGE 6: ANALYZING (Checkpoint & Resume with Rate-Limit Throttling) ---
      currentRunningStage = 'ANALYZING';
      const batches = partitionChunksIntoBatches(chunks);
      const analyzedIndices = new Set<number>(procRecord?.analyzedBatchIndices ?? []);
      const accumulated = [...((procRecord?.accumulatedConcepts as unknown as ExtractedConceptDto[]) ?? [])];

      const defaultThrottleMs = process.env.NODE_ENV === 'test' ? 10 : 12000;
      const throttleMs = throttleDelayMs ?? defaultThrottleMs;
      let newlyAnalyzedInThisRun = 0;

      for (let i = 0; i < batches.length; i++) {
        if (analyzedIndices.has(i)) {
          // Skip already analyzed batch on resume!
          continue;
        }

        if (internalController.signal.aborted) {
          const rec = await notifyStage('CANCELLED', {
            progressPercent: Math.min(85, Math.floor(60 + (i / batches.length) * 25)),
            message: 'Concept extraction paused.',
            currentBatch: i,
            totalBatches: batches.length,
            analyzedBatchIndices: Array.from(analyzedIndices),
            accumulatedConcepts: accumulated as unknown as Array<Record<string, unknown>>,
          });
          return { success: false, materialId, record: rec };
        }

        const batchNum = i + 1;
        const progressPercent = Math.min(85, Math.floor(60 + (i / batches.length) * 25));

        // Throttling: if we've already dispatched a batch in this session, pause before the next batch to respect Gemini limits
        if (newlyAnalyzedInThisRun > 0 && throttleMs > 0) {
          const totalWaitSec = Math.ceil(throttleMs / 1000);
          for (let sec = totalWaitSec; sec > 0; sec--) {
            if (internalController.signal.aborted) {
              const rec = await notifyStage('CANCELLED', { message: 'Cancelled during rate limit pacing.' });
              return { success: false, materialId, record: rec };
            }
            await notifyStage('ANALYZING', {
              progressPercent,
              message: `Pacing requests to respect Gemini API limits (waiting ${sec}s before batch ${batchNum} of ${batches.length})...`,
              currentBatch: batchNum,
              totalBatches: batches.length,
              analyzedBatchIndices: Array.from(analyzedIndices),
              accumulatedConcepts: accumulated as unknown as Array<Record<string, unknown>>,
            });
            const sleepStep = Math.min(1000, throttleMs);
            await new Promise((resolve) => setTimeout(resolve, sleepStep));
          }
        }

        await notifyStage('ANALYZING', {
          progressPercent,
          message: `Extracting concepts from batch ${batchNum} of ${batches.length}...`,
          currentBatch: batchNum,
          totalBatches: batches.length,
          analyzedBatchIndices: Array.from(analyzedIndices),
          accumulatedConcepts: accumulated as unknown as Array<Record<string, unknown>>,
        });

        // Call Gemini extraction route
        const response = await fetchExtractConcepts(
          { chunks: batches[i] },
          { signal: internalController.signal },
        );

        accumulated.push(...response.concepts);
        analyzedIndices.add(i);
        newlyAnalyzedInThisRun++;

        // Checkpoint progress after each batch commits
        await updateProcessingStage(
          materialId,
          'ANALYZING',
          {
            runId,
            progressPercent,
            message: `Completed batch ${batchNum} of ${batches.length}.`,
            currentBatch: batchNum,
            totalBatches: batches.length,
            analyzedBatchIndices: Array.from(analyzedIndices),
            accumulatedConcepts: accumulated as unknown as Array<Record<string, unknown>>,
          },
          repos,
        );
      }

      // --- STAGE 7: UNITS_BUILT ---
      currentRunningStage = 'UNITS_BUILT';
      await notifyStage('UNITS_BUILT', {
        progressPercent: 90,
        message: 'Synthesizing concepts and constructing learning units...',
      });

      const deduplicated = deduplicateConcepts(accumulated);
      const validChunkIds = new Set(chunks.map((c) => c.id));
      const now = nowISO();

      // Raw concepts extracted in this run
      const rawExtractedConcepts: ConceptRecord[] = deduplicated.map((dto, idx) => ({
        id: generateId(),
        materialId,
        subjectId,
        title: dto.title,
        summary: dto.summary,
        canonicalExplanation: dto.canonicalExplanation,
        keyTerms: dto.keyTerms,
        sourceChunkIds: dto.sourceChunkIds.filter((cid) => validChunkIds.has(cid)),
        tier: 0,
        status: 'available' as const,
        confidence: dto.confidence,
        extractionOrder: idx,
        contentVersion: contentHash,
        promptVersion: '1.0',
        createdAt: now,
        updatedAt: now,
      }));

      // Check if material already has existing concepts in storage (from prior run)
      const oldExistingConcepts = await repos.concepts.listByMaterial(materialId);
      let conceptsToPersist: ConceptRecord[];

      if (oldExistingConcepts.length > 0) {
        // Conservative matching: match old concepts to new ones, retaining existing concept IDs
        // so that attempts, mastery scores, and SM-2 flashcard data are never lost
        const replacePlan = planReplaceMaterialConcepts(
          oldExistingConcepts,
          rawExtractedConcepts,
          contentHash,
        );
        conceptsToPersist = replacePlan.conceptsToPut;
      } else {
        conceptsToPersist = rawExtractedConcepts;
      }

      // Build raw dependencies for active (non-archived) concepts
      const activeConcepts = conceptsToPersist.filter((c) => !c.archived);
      const titleToConceptMap = new Map(
        activeConcepts.map((c) => [normalizeConceptTitle(c.title), c]),
      );
      const dependencies = [];
      for (let i = 0; i < deduplicated.length; i++) {
        const dto = deduplicated[i];
        const dependent = activeConcepts.find(
          (c) => normalizeConceptTitle(c.title) === normalizeConceptTitle(dto.title),
        );
        if (!dependent) continue;

        for (const pTitle of dto.prerequisiteTitles) {
          const prereq = titleToConceptMap.get(normalizeConceptTitle(pTitle));
          if (prereq && prereq.id !== dependent.id) {
            dependencies.push({
              id: generateId(),
              prerequisiteId: prereq.id,
              dependentConceptId: dependent.id,
              confidence: Math.min(dependent.confidence, prereq.confidence),
              removed: false,
              createdAt: now,
            });
          }
        }
      }

      // Build DAG and ordered concepts
      const graphResult = buildDependencyGraph({ concepts: activeConcepts, dependencies, chunks });
      const orderedConcepts = graphResult.orderedConcepts;
      const finalDependencies = graphResult.allEdges.map((e) => ({
        ...e,
        createdAt: e.createdAt ?? now,
      }));

      // Build deterministic learning units (3-8 concepts, every concept in 1 unit)
      const unitResult = buildLearningUnits({
        materialId,
        contentVersion: contentHash,
        concepts: orderedConcepts,
        dependencies: finalDependencies,
        chunks,
        headings: extractedHeadings ?? (existingDoc?.metadata?.headings as ExtractedHeading[] | undefined),
        docTitle: file.name,
      });

      // Update active concepts with unitIds
      for (const c of orderedConcepts) {
        c.unitId = unitResult.conceptUnitMap.get(c.id);
      }

      // Clean up previous learning units for this material to prevent duplicate records
      const oldUnits = await repos.learningUnits.listByMaterial(materialId);
      for (const u of oldUnits) {
        await repos.learningUnits.delete(u.id);
      }

      // Persist concepts, dependencies, and learning units atomically
      await Promise.all([
        repos.concepts.putMany(conceptsToPersist),
        repos.dependencies.putMany(finalDependencies),
        repos.learningUnits.putMany(unitResult.units),
      ]);

      // Update document analysisStatus = 'completed'
      const finalDoc = await repos.documents.get(materialId);
      if (finalDoc) {
        finalDoc.analysisStatus = 'completed';
        finalDoc.updatedAt = now;
        await repos.documents.put(finalDoc);
      }

      // --- STAGE 8: COMPLETE ---
      procRecord = await notifyStage('COMPLETE', {
        progressPercent: 100,
        message: `Completed processing: ${unitResult.units.length} learning units and ${orderedConcepts.length} concepts ready.`,
        counts: {
          totalChunks: chunks.length,
          extractedConcepts: orderedConcepts.length,
          totalUnits: unitResult.units.length,
        },
      });

      return {
        success: true,
        materialId,
        record: procRecord,
      };
    } catch (err) {
      if (
        internalController.signal.aborted ||
        (err instanceof Error && (err.name === 'AbortError' || /abort|cancel/i.test(err.message)))
      ) {
        try {
          const cancelledRecord = await notifyStage('CANCELLED', {
            message: 'Processing cancelled by user. Progress has been saved.',
          });
          return {
            success: false,
            materialId,
            record: cancelledRecord,
          };
        } catch {
          const fallbackCancelled: MaterialProcessingRecord = {
            id: materialId,
            materialId,
            runId,
            stage: 'CANCELLED',
            progressPercent: procRecord?.progressPercent ?? 0,
            message: 'Processing cancelled by user. Progress has been saved.',
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          return {
            success: false,
            materialId,
            record: fallbackCancelled,
          };
        }
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      // Sanitize error message to ensure no note content is leaked
      let safeError = errorMsg.replace(/["'].*?["']/g, '"[content]"');
      if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        if (!safeError.includes('[content]')) {
          safeError = `${safeError} (Gemini Free Tier limit is 5 RPM. Click Resume to continue.)`;
        }
      }

      try {
        const failedRecord = await notifyStage('FAILED', {
          failedStage: currentRunningStage,
          errorCode: 'ANALYSIS_ERROR',
          errorMessage: safeError,
          retryable: true,
        });
        return {
          success: false,
          materialId,
          record: failedRecord,
          error: safeError,
        };
      } catch (notifyErr) {
        console.error('Failed to persist FAILED stage:', notifyErr);
        const fallbackRecord: MaterialProcessingRecord = {
          id: materialId,
          materialId,
          runId,
          stage: 'FAILED',
          progressPercent: 0,
          message: safeError,
          failedStage: currentRunningStage,
          errorCode: 'ANALYSIS_ERROR',
          errorMessage: safeError,
          retryable: true,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        return {
          success: false,
          materialId,
          record: fallbackRecord,
          error: safeError,
        };
      }
    }
  })();

  processingJobManager.registerJob(materialId, runId, internalController, runPromise);
  return runPromise;
}

/**
 * Resume or retry an interrupted or failed material processing lifecycle
 * directly from saved database records without requiring file re-upload.
 */
export async function resumeMaterialAnalysis(
  materialId: string,
  options: {
    runId?: string;
    signal?: AbortSignal;
    onProgress?: (record: MaterialProcessingRecord) => void;
    customRepos?: StorageRepositories;
    throttleDelayMs?: number;
  } = {},
): Promise<{ success: boolean; materialId: string; record: MaterialProcessingRecord; error?: string }> {
  // If there is already an active running job for this material, join it
  const existingJob = processingJobManager.getJob<{
    success: boolean;
    materialId: string;
    record: MaterialProcessingRecord;
    error?: string;
  }>(materialId);
  if (existingJob) {
    if (options.onProgress) {
      existingJob.listeners.add(options.onProgress);
    }
    return existingJob.promise;
  }

  const repos = options.customRepos ?? getStorage();
  const doc = await repos.documents.get(materialId);
  if (!doc) {
    return {
      success: false,
      materialId,
      record: {
        id: materialId,
        materialId,
        runId: options.runId ?? generateId(),
        stage: 'FAILED',
        progressPercent: 0,
        message: 'Material record not found in storage.',
        errorCode: 'NOT_FOUND',
        errorMessage: 'Material record not found in storage.',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
      error: 'Material record not found in storage.',
    };
  }

  const runId = options.runId ?? generateId();

  // If study chunks are already saved in IndexedDB, resume directly into Stage 6 (ANALYZING)
  // without re-opening or re-parsing the original raw PDF file
  const chunks = await repos.chunks.listByMaterial(materialId);
  if (chunks.length > 0) {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(doc.extractedText);
    return processMaterialLifecycle({
      file: {
        name: doc.filename,
        size: doc.fileSize,
        type: doc.fileType === 'pdf' ? 'application/pdf' : 'text/plain',
        arrayBuffer: async () =>
          textBytes.buffer.slice(textBytes.byteOffset, textBytes.byteOffset + textBytes.byteLength),
      },
      materialId,
      runId,
      subjectId: doc.subjectId,
      signal: options.signal,
      onProgress: options.onProgress,
      customRepos: repos,
      throttleDelayMs: options.throttleDelayMs,
    });
  }

  // If no chunks exist yet, check if a valid stored file blob exists
  const fileRecord = await repos.materialFiles.get(materialId);
  if (fileRecord && fileRecord.blob && fileRecord.blob.size > 0) {
    const blob = fileRecord.blob;
    return processMaterialLifecycle({
      file: {
        name: fileRecord.filename || doc.filename,
        size: fileRecord.size || doc.fileSize,
        type: fileRecord.mimeType || (doc.fileType === 'pdf' ? 'application/pdf' : 'text/plain'),
        arrayBuffer: () => blob.arrayBuffer(),
      },
      materialId,
      runId,
      subjectId: doc.subjectId,
      signal: options.signal,
      onProgress: options.onProgress,
      customRepos: repos,
      throttleDelayMs: options.throttleDelayMs,
    });
  }

  // Fallback: create synthetic text file from doc.extractedText using plain text extension
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(doc.extractedText);
  return processMaterialLifecycle({
    file: {
      name: `${doc.filename}.txt`,
      size: textBytes.byteLength,
      type: 'text/plain',
      arrayBuffer: async () =>
        textBytes.buffer.slice(textBytes.byteOffset, textBytes.byteOffset + textBytes.byteLength),
    },
    materialId,
    runId,
    subjectId: doc.subjectId,
    signal: options.signal,
    onProgress: options.onProgress,
    customRepos: repos,
    throttleDelayMs: options.throttleDelayMs,
  });
}

