import { openDatabase, runTransaction, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { computeSha256 } from '@/lib/utils/hash';
import { type DocumentRecord } from '@/types/domain';
import { validateUploadFile } from './validate';
import { extractDocumentText, IngestionError } from './extract-text';
import { normalizeDocument } from './normalize';
import { chunkDocument, type ChunkOptions } from './chunk';
import {
  type IngestFileInput,
  type IngestionProgress,
  type IngestResult,
} from './types';

export interface IngestOptions {
  file: IngestFileInput;
  subjectId?: string;
  chunkOptions?: ChunkOptions;
  allowDuplicate?: boolean;
  onProgress?: (progress: IngestionProgress) => void;
  signal?: AbortSignal;
  dbName?: string;
}

/**
 * Yield execution to allow UI event loop and render cycles to process.
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Check if a document with the identical content hash already exists in IndexedDB.
 */
export async function findDuplicateDocument(
  contentHash: string,
  dbName = DB_NAME,
): Promise<DocumentRecord | null> {
  try {
    const db = await openDatabase(dbName);
    const allDocs = await db.getAll('documents');
    const match = allDocs.find((doc) => doc.contentHash === contentHash);
    return match ?? null;
  } catch (err) {
    console.warn('Failed to query documents for duplicates:', err);
    return null;
  }
}

/**
 * Ingests an uploaded document end-to-end:
 * 1. Validate extension, signature, size limits
 * 2. Extract raw text and structure (lazy-loaded PDF.js / TextDecoder)
 * 3. Check for duplicates by content hash
 * 4. Normalize whitespace, hyphens, and map offsets
 * 5. Chunk text with exact provenance
 * 6. Persist document + chunks atomically in ONE IndexedDB transaction
 */
export async function ingestDocument(options: IngestOptions): Promise<IngestResult> {
  const {
    file,
    subjectId,
    chunkOptions,
    allowDuplicate = false,
    onProgress,
    signal,
    dbName = DB_NAME,
  } = options;

  try {
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 1: VALIDATION ---
    onProgress?.({
      stage: 'validating',
      percent: 5,
      message: `Validating "${file.name}"...`,
    });

    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const headerSample = uint8.slice(0, Math.min(uint8.length, 8192));

    const validation = validateUploadFile(file.name, file.size, file.type, headerSample);
    if (!validation.valid) {
      onProgress?.({
        stage: 'error',
        percent: 0,
        message: validation.error ?? 'Validation failed',
      });
      return {
        success: false,
        code: validation.code,
        error: validation.error,
      };
    }

    await yieldToMain();
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 2: HASH & DUPLICATE CHECK ---
    const fileHash = await computeSha256(uint8);

    if (!allowDuplicate) {
      const existing = await findDuplicateDocument(fileHash, dbName);
      if (existing) {
        onProgress?.({
          stage: 'error',
          percent: 0,
          message: `Document "${file.name}" has already been imported.`,
        });
        return {
          success: false,
          alreadyImported: true,
          documentId: existing.id,
          document: existing,
          code: 'DUPLICATE_FILE',
          error: `Document "${file.name}" has already been imported into this workspace.`,
        };
      }
    }

    await yieldToMain();
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 3: EXTRACTION ---
    onProgress?.({
      stage: 'extracting',
      percent: 25,
      message: `Extracting text from "${file.name}"...`,
    });

    const extracted = await extractDocumentText(
      uint8,
      validation.fileType!,
      file.name,
      (currentPage, totalPages) => {
        const percent = Math.min(55, Math.floor(25 + (currentPage / totalPages) * 30));
        onProgress?.({
          stage: 'extracting',
          percent,
          message: `Extracting page ${currentPage} of ${totalPages}...`,
          currentPage,
          totalPages,
        });
      },
      signal,
    );

    await yieldToMain();
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 4: NORMALIZATION ---
    onProgress?.({
      stage: 'normalizing',
      percent: 65,
      message: 'Normalizing document structure and line wraps...',
    });

    const normalized = normalizeDocument(extracted);

    await yieldToMain();
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 5: CHUNKING ---
    onProgress?.({
      stage: 'chunking',
      percent: 80,
      message: 'Dividing document into semantic study chunks...',
    });

    const documentId = generateId();
    const chunks = await chunkDocument(normalized, documentId, chunkOptions);

    await yieldToMain();
    if (signal?.aborted) {
      throw new IngestionError('Ingestion cancelled.', 'CANCELLED');
    }

    // --- STAGE 6: ATOMIC PERSISTENCE ---
    onProgress?.({
      stage: 'persisting',
      percent: 92,
      message: 'Saving document and study chunks to local storage...',
      chunkCount: chunks.length,
    });

    const now = nowIso();
    const documentRecord: DocumentRecord = {
      id: documentId,
      subjectId,
      filename: file.name,
      fileType: validation.fileType!,
      fileSize: file.size,
      extractedText: normalized.text,
      analysisStatus: 'pending',
      contentHash: fileHash,
      metadata: {
        originalFilename: file.name,
        fileSize: file.size,
        fileType: validation.fileType,
        mimeType: file.type || validation.mimeType,
        lastModified: file.lastModified,
        fileHash,
        pageCount: extracted.metadata.pageCount,
        rawCharCount: extracted.rawText.length,
        normalizedCharCount: normalized.normalizedCharCount,
        chunkCount: chunks.length,
        ...extracted.metadata,
      },
      createdAt: now,
      updatedAt: now,
    };

    // Atomic transaction: document + all chunks write together or rollback completely
    await runTransaction(
      ['documents', 'documentChunks'],
      'readwrite',
      async (tx) => {
        await tx.objectStore('documents').put(documentRecord);
        const chunkStore = tx.objectStore('documentChunks');
        for (const chunk of chunks) {
          await chunkStore.put(chunk);
        }
      },
      dbName,
    );

    onProgress?.({
      stage: 'completed',
      percent: 100,
      message: `Successfully processed and stored ${chunks.length} chunks.`,
      chunkCount: chunks.length,
    });

    return {
      success: true,
      documentId,
      document: documentRecord,
      chunks,
    };
  } catch (err) {
    const code = err instanceof IngestionError ? err.code : 'INGESTION_FAILED';
    const message = err instanceof Error ? err.message : String(err);

    onProgress?.({
      stage: 'error',
      percent: 0,
      message,
    });

    return {
      success: false,
      code,
      error: message,
    };
  }
}

/**
 * Atomically delete a document and all associated documentChunks in ONE transaction.
 */
export async function deleteDocumentAndChunks(
  documentId: string,
  dbName = DB_NAME,
): Promise<void> {
  await runTransaction(
    ['documents', 'documentChunks'],
    'readwrite',
    async (tx) => {
      // Delete parent document
      await tx.objectStore('documents').delete(documentId);

      // Delete dependent chunks via 'by-document' index cursor
      const chunkStore = tx.objectStore('documentChunks');
      const index = chunkStore.index('by-document');
      let cursor = await index.openCursor(IDBKeyRange.only(documentId));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
    },
    dbName,
  );
}
