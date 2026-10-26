import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type MaterialProcessingRecord,
  type ProcessingStage,
  type MaterialFileRecord,
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
import { fetchExtractConcepts } from '@/lib/ai/client';
import { type ExtractedConceptDto } from '@/lib/ai/schemas';
import { evaluateBlobStorage, computeFileHash, computeContentHash } from './duplicates';

export interface ProcessMaterialOptions {
  file: {
    name: string;
    size: number;
    type?: string;
    lastModified?: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  };
  materialId?: string; // If replacing or resuming an existing material
  subjectId?: string;
  chunkOptions?: ChunkOptions;
  signal?: AbortSignal;
  onProgress?: (record: MaterialProcessingRecord) => void;
  customRepos?: StorageRepositories;
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
  const { file, subjectId, chunkOptions, signal, onProgress, customRepos } = options;
  const repos = customRepos ?? getStorage();

  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  const fileHash = await computeFileHash(uint8);

  const materialId = options.materialId ?? generateId();

  // Helper to publish and persist progress
  async function notifyStage(
    stage: ProcessingStage,
    details: Partial<MaterialProcessingRecord>,
  ): Promise<MaterialProcessingRecord> {
    const updated = await updateProcessingStage(materialId, stage, details, repos);
    onProgress?.(updated);
    return updated;
  }

  try {
    if (signal?.aborted) {
      const rec = await notifyStage('CANCELLED', { message: 'Processing cancelled by user.' });
      return { success: false, materialId, record: rec };
    }

    // Check existing processing record for resume
    let procRecord = await repos.processing.get(materialId);

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

    if (signal?.aborted) {
      const rec = await notifyStage('CANCELLED', { message: 'Cancelled after validation.' });
      return { success: false, materialId, record: rec };
    }

    // --- STAGE 3: EXTRACTED ---
    const extracted = await extractDocumentText(
      uint8,
      validation.fileType!,
      file.name,
      undefined,
      signal,
    );

    const normalized = normalizeDocument(extracted);
    const contentHash = await computeContentHash(normalized.text);

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
    // Chunking and saving happens atomically. Source text is committed before LLM analysis.
    const existingDoc = await repos.documents.get(materialId);
    let chunks: DocumentChunkRecord[] = [];

    if (!existingDoc || procRecord.stage === 'SAVED' || procRecord.stage === 'PREVIEWED') {
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
          ...extracted.metadata,
        },
        createdAt: existingDoc?.createdAt ?? now,
        updatedAt: now,
      };

      // Set materialId on each chunk
      for (const ch of chunks) {
        ch.materialId = materialId;
        ch.contentVersion = contentHash;
      }

      // Check blob storage cap (10 MiB)
      const blobDecision = evaluateBlobStorage(file.size);
      if (blobDecision.storeBlob) {
        const fileRecord: MaterialFileRecord = {
          id: materialId,
          filename: file.name,
          mimeType: file.type || validation.mimeType || 'application/octet-stream',
          size: file.size,
          blob: new Blob([buffer], { type: file.type || validation.mimeType }),
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
    } else {
      chunks = await repos.chunks.listByMaterial(materialId);
    }

    if (signal?.aborted) {
      const rec = await notifyStage('CANCELLED', { message: 'Cancelled after saving chunks.' });
      return { success: false, materialId, record: rec };
    }

    // --- STAGE 6: ANALYZING (Checkpoint & Resume) ---
    const batches = partitionChunksIntoBatches(chunks);
    const analyzedIndices = new Set<number>(procRecord.analyzedBatchIndices ?? []);
    const accumulated = [...((procRecord.accumulatedConcepts as unknown as ExtractedConceptDto[]) ?? [])];

    for (let i = 0; i < batches.length; i++) {
      if (analyzedIndices.has(i)) {
        // Skip already analyzed batch on resume!
        continue;
      }

      if (signal?.aborted) {
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

      await notifyStage('ANALYZING', {
        progressPercent,
        message: `Analyzing batch ${batchNum} of ${batches.length} notes...`,
        currentBatch: batchNum,
        totalBatches: batches.length,
        analyzedBatchIndices: Array.from(analyzedIndices),
        accumulatedConcepts: accumulated as unknown as Array<Record<string, unknown>>,
      });

      // Call Gemini extraction route
      const response = await fetchExtractConcepts(
        {
          chunks: batches[i],
        },
        { signal },
      );

      accumulated.push(...response.concepts);
      analyzedIndices.add(i);

      // Checkpoint progress after each batch commits
      await updateProcessingStage(
        materialId,
        'ANALYZING',
        {
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
    await notifyStage('UNITS_BUILT', {
      progressPercent: 90,
      message: 'Synthesizing concepts and constructing learning units...',
    });

    const deduplicated = deduplicateConcepts(accumulated);
    const validChunkIds = new Set(chunks.map((c) => c.id));
    const now = nowISO();

    const concepts = deduplicated.map((dto, idx) => ({
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

    // Build raw dependencies
    const titleToConceptMap = new Map(
      concepts.map((c) => [normalizeConceptTitle(c.title), c]),
    );
    const dependencies = [];
    for (let i = 0; i < deduplicated.length; i++) {
      const dto = deduplicated[i];
      const dependent = concepts[i];
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
    const graphResult = buildDependencyGraph({ concepts, dependencies, chunks });
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
      headings: extracted.headings,
      docTitle: file.name,
    });

    // Update concepts with unitIds
    for (const c of orderedConcepts) {
      c.unitId = unitResult.conceptUnitMap.get(c.id);
    }

    // Persist concepts, dependencies, and learning units atomically
    await Promise.all([
      repos.concepts.putMany(orderedConcepts),
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Sanitize error message to ensure no note content is leaked
    const safeError = errorMsg.replace(/["'].*?["']/g, '"[content]"');

    const failedRecord = await notifyStage('FAILED', {
      failedStage: 'ANALYZING',
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
  }
}

/**
 * Resume or retry an interrupted or failed material processing lifecycle
 * directly from saved database records without requiring file re-upload.
 */
export async function resumeMaterialAnalysis(
  materialId: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (record: MaterialProcessingRecord) => void;
    customRepos?: StorageRepositories;
  } = {},
): Promise<{ success: boolean; materialId: string; record: MaterialProcessingRecord; error?: string }> {
  const repos = options.customRepos ?? getStorage();
  const doc = await repos.documents.get(materialId);
  if (!doc) {
    return {
      success: false,
      materialId,
      record: {
        id: materialId,
        materialId,
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

  // Check if a stored file blob exists
  const fileRecord = await repos.materialFiles.get(materialId);
  if (fileRecord && fileRecord.blob) {
    const blob = fileRecord.blob;
    return processMaterialLifecycle({
      file: {
        name: fileRecord.filename || doc.filename,
        size: fileRecord.size || doc.fileSize,
        type: fileRecord.mimeType || doc.fileType,
        arrayBuffer: () => blob.arrayBuffer(),
      },
      materialId,
      subjectId: doc.subjectId,
      signal: options.signal,
      onProgress: options.onProgress,
      customRepos: repos,
    });
  }

  // If no blob exists (e.g. over 10 MiB), create synthetic text file from doc.extractedText
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(doc.extractedText);
  return processMaterialLifecycle({
    file: {
      name: doc.filename,
      size: textBytes.byteLength,
      type: 'text/plain',
      arrayBuffer: async () =>
        textBytes.buffer.slice(textBytes.byteOffset, textBytes.byteOffset + textBytes.byteLength),
    },
    materialId,
    subjectId: doc.subjectId,
    signal: options.signal,
    onProgress: options.onProgress,
    customRepos: repos,
  });
}

