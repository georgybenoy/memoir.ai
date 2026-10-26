import { openDatabase, runTransaction, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { fetchExtractConcepts } from '@/lib/ai/client';
import { type AllowedModelId } from '@/lib/config/models';
import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import {
  type ConceptPipelineProgress,
  type ConceptPipelineResult,
  type UnresolvedPrerequisite,
} from './types';
import {
  deduplicateConcepts,
  normalizeConceptTitle,
} from './deduplicate';
import { type ExtractedConceptDto } from '@/lib/ai/schemas';
import { buildDependencyGraph } from '@/features/dependency-graph';

export interface ConceptPipelineOptions {
  documentId: string;
  model?: AllowedModelId;
  signal?: AbortSignal;
  onProgress?: (progress: ConceptPipelineProgress) => void;
  dbName?: string;
  throttleDelayMs?: number;
}

const MAX_BATCH_CHUNKS = 10;
const MAX_BATCH_CHARS = 10000;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Divides document chunks into token-budgeted batch windows for sequential LLM extraction.
 */
export function partitionChunksIntoBatches(
  chunks: DocumentChunkRecord[],
): Array<Array<{ id: string; text: string }>> {
  const batches: Array<Array<{ id: string; text: string }>> = [];
  let currentBatch: Array<{ id: string; text: string }> = [];
  let currentBatchChars = 0;

  for (const chunk of chunks) {
    const chunkChars = chunk.text.length;

    if (
      currentBatch.length >= MAX_BATCH_CHUNKS ||
      (currentBatchChars + chunkChars > MAX_BATCH_CHARS && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }

    currentBatch.push({ id: chunk.id, text: chunk.text });
    currentBatchChars += chunkChars;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Orchestrates concept extraction for a document:
 * 1. Read document & chunks from IndexedDB
 * 2. Update analysisStatus = 'processing'
 * 3. Batch chunks & call /api/ai/extract-concepts sequentially with progress
 * 4. Merge & deduplicate extracted concepts
 * 5. Validate source citations & remove hallucinated chunk IDs
 * 6. Map prerequisite titles to concept IDs & build raw dependency graph
 * 7. Persist concepts + dependencies + document status in ONE atomic IndexedDB transaction
 */
export async function extractConceptsForDocument(
  options: ConceptPipelineOptions,
): Promise<ConceptPipelineResult> {
  const { documentId, model, signal, onProgress, dbName = DB_NAME } = options;

  let doc: DocumentRecord | null = null;

  try {
    const db = await openDatabase(dbName);
    doc = (await db.get('documents', documentId)) ?? null;
    if (!doc) {
      throw new Error(`Document with ID "${documentId}" not found in local storage.`);
    }

    const chunks = await db.getAllFromIndex('documentChunks', 'by-document', documentId);
    if (chunks.length === 0) {
      throw new Error(`Document "${doc.filename}" has no study chunks to analyze.`);
    }
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Update document status to 'processing'
    doc.analysisStatus = 'processing';
    doc.updatedAt = nowIso();
    await db.put('documents', doc);

    // --- STAGE 1: BATCHING ---
    onProgress?.({
      stage: 'batching',
      percent: 5,
      message: 'Preparing study notes for concept analysis...',
    });

    const batches = partitionChunksIntoBatches(chunks);
    const validChunkIds = new Set(chunks.map((c) => c.id));
    const allRawConcepts: ExtractedConceptDto[] = [];

    // --- STAGE 2: SEQUENTIAL EXTRACTION ---
    const defaultThrottleMs = process.env.NODE_ENV === 'test' ? 10 : 12000;
    const throttleMs = options.throttleDelayMs ?? defaultThrottleMs;

    for (let i = 0; i < batches.length; i++) {
      if (signal?.aborted) {
        throw new Error('Concept extraction cancelled by user.');
      }

      const batchNumber = i + 1;
      const progressPercent = Math.min(
        70,
        Math.floor(10 + (i / batches.length) * 60),
      );

      // Throttling: if we've already dispatched a batch, pause before the next batch to respect Gemini 5 RPM limit
      if (i > 0 && throttleMs > 0) {
        const totalWaitSec = Math.ceil(throttleMs / 1000);
        for (let sec = totalWaitSec; sec > 0; sec--) {
          if (signal?.aborted) {
            throw new Error('Concept extraction cancelled by user.');
          }
          onProgress?.({
            stage: 'extracting',
            percent: progressPercent,
            message: `Pacing requests to respect Gemini API limits (waiting ${sec}s before batch ${batchNumber} of ${batches.length})...`,
            currentBatch: batchNumber,
            totalBatches: batches.length,
            conceptsExtracted: allRawConcepts.length,
          });
          const sleepStep = Math.min(1000, throttleMs);
          await new Promise((resolve) => setTimeout(resolve, sleepStep));
        }
      }

      onProgress?.({
        stage: 'extracting',
        percent: progressPercent,
        message: `Analyzing batch ${batchNumber} of ${batches.length} notes...`,
        currentBatch: batchNumber,
        totalBatches: batches.length,
        conceptsExtracted: allRawConcepts.length,
      });

      const response = await fetchExtractConcepts(
        {
          chunks: batches[i],
          model,
        },
        { signal },
      );

      allRawConcepts.push(...response.concepts);
      await yieldToMain();
    }

    if (allRawConcepts.length === 0) {
      throw new Error('No clear academic concepts could be identified from the uploaded notes.');
    }

    // --- STAGE 3: DEDUPLICATION & MERGING ---
    onProgress?.({
      stage: 'deduplicating',
      percent: 75,
      message: 'Merging duplicate concepts and synthesizing explanations...',
      conceptsExtracted: allRawConcepts.length,
    });

    const deduplicated = deduplicateConcepts(allRawConcepts);
    await yieldToMain();

    // --- STAGE 4: CITATION VALIDATION & GRAPH LINKING ---
    onProgress?.({
      stage: 'linking',
      percent: 85,
      message: 'Verifying source citations and constructing prerequisite connections...',
      conceptsExtracted: deduplicated.length,
    });

    let hallucinatedCitationsRemoved = 0;

    // Build ConceptRecord entities
    const now = nowIso();
    const concepts: ConceptRecord[] = deduplicated.map((dto, index) => {
      // Validate sourceChunkIds against real chunks
      const realCitations = dto.sourceChunkIds.filter((cid) => {
        if (validChunkIds.has(cid)) return true;
        hallucinatedCitationsRemoved++;
        return false;
      });

      // If all citations were invented, bind to the first chunk and reduce confidence
      const finalCitations = realCitations.length > 0 ? realCitations : [chunks[0].id];
      const finalConfidence = realCitations.length > 0 ? dto.confidence : Math.min(dto.confidence, 0.4);

      return {
        id: generateId(),
        subjectId: doc?.subjectId,
        title: dto.title,
        summary: dto.summary,
        canonicalExplanation: dto.canonicalExplanation,
        keyTerms: dto.keyTerms,
        sourceChunkIds: finalCitations,
        tier: 0, // Assigned below
        status: 'available',
        confidence: finalConfidence,
        extractionOrder: index,
        createdAt: now,
        updatedAt: now,
      };
    });

    // Title to Concept mapping
    const titleToConceptMap = new Map<string, ConceptRecord>();
    for (const concept of concepts) {
      titleToConceptMap.set(normalizeConceptTitle(concept.title), concept);
    }

    // Map prerequisite titles to dependencies
    const dependencies: ConceptDependencyRecord[] = [];
    const unresolvedPrerequisites: UnresolvedPrerequisite[] = [];
    const dependencyPairSet = new Set<string>();

    for (let i = 0; i < deduplicated.length; i++) {
      const dto = deduplicated[i];
      const dependentConcept = concepts[i];

      for (const prereqTitle of dto.prerequisiteTitles) {
        const normPrereq = normalizeConceptTitle(prereqTitle);
        const prereqConcept = titleToConceptMap.get(normPrereq);

        if (prereqConcept && prereqConcept.id !== dependentConcept.id) {
          const pairKey = `${prereqConcept.id}->${dependentConcept.id}`;
          if (!dependencyPairSet.has(pairKey)) {
            dependencyPairSet.add(pairKey);
            dependencies.push({
              id: generateId(),
              prerequisiteId: prereqConcept.id,
              dependentConceptId: dependentConcept.id,
              confidence: Math.min(dependentConcept.confidence, prereqConcept.confidence),
              removed: false,
              createdAt: now,
            });
          }
        } else {
          unresolvedPrerequisites.push({
            conceptTitle: dependentConcept.title,
            prerequisiteTitle: prereqTitle,
          });
        }
      }
    }

    // Run deterministic dependency graph pipeline
    const graphResult = buildDependencyGraph({
      concepts,
      dependencies,
      chunks,
    });

    const finalConcepts = graphResult.orderedConcepts;
    const finalDependencies: ConceptDependencyRecord[] = graphResult.allEdges.map((e) => ({
      id: e.id,
      prerequisiteId: e.prerequisiteId,
      dependentConceptId: e.dependentConceptId,
      confidence: e.confidence,
      removed: e.removed,
      removedReason: e.removedReason,
      createdAt: e.createdAt ?? now,
    }));

    // --- STAGE 5: ATOMIC PERSISTENCE ---
    onProgress?.({
      stage: 'persisting',
      percent: 95,
      message: 'Persisting concept knowledge graph to local storage...',
      conceptsExtracted: finalConcepts.length,
    });

    doc.analysisStatus = 'completed';
    doc.updatedAt = now;
    doc.metadata = {
      ...doc.metadata,
      conceptCount: finalConcepts.length,
      dependencyCount: finalDependencies.length,
      graphMode: graphResult.graphMode,
      analyzedAt: now,
    };

    await runTransaction(
      ['concepts', 'conceptDependencies', 'documents'],
      'readwrite',
      async (tx) => {
        const conceptStore = tx.objectStore('concepts');
        for (const concept of finalConcepts) {
          await conceptStore.put(concept);
        }

        const depStore = tx.objectStore('conceptDependencies');
        for (const dep of finalDependencies) {
          await depStore.put(dep);
        }

        await tx.objectStore('documents').put(doc!);
      },
      dbName,
    );

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: `Extracted ${finalConcepts.length} concepts and ${finalDependencies.length} prerequisite relationships.`,
      conceptsExtracted: finalConcepts.length,
    });

    return {
      success: true,
      documentId,
      concepts: finalConcepts,
      dependencies: finalDependencies,
      unresolvedPrerequisites,
      hallucinatedCitationsRemoved,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Ensure document is preserved and set to 'failed' status
    if (doc) {
      try {
        const db = await openDatabase(dbName);
        doc.analysisStatus = 'failed';
        doc.updatedAt = nowIso();
        await db.put('documents', doc);
      } catch (dbErr) {
        console.warn('Failed to update document status to failed:', dbErr);
      }
    }

    onProgress?.({
      stage: 'error',
      percent: 0,
      message,
    });

    return {
      success: false,
      documentId,
      concepts: [],
      dependencies: [],
      unresolvedPrerequisites: [],
      hallucinatedCitationsRemoved: 0,
      error: message,
    };
  }
}
