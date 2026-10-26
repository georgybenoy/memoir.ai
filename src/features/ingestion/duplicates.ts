import { type DocumentRecord } from '@/types/domain';
import { computeSha256 } from '@/lib/utils/hash';

/**
 * Maximum size (10 MiB) for storing original raw binary files in IndexedDB materialFiles store.
 * Files exceeding this cap rely entirely on extracted text and do not store raw Blobs.
 * Documented rule: Backups exclude raw blobs by default to maintain compact portable exports.
 */
export const MAX_BLOB_STORAGE_BYTES = 10 * 1024 * 1024; // 10 MiB

export type DuplicateDecisionType = 'EXACT_DUPLICATE' | 'FILENAME_COLLISION' | 'UNIQUE';

export type DuplicateAction =
  | 'open_existing'
  | 'import_copy'
  | 'import_new'
  | 'replace_existing'
  | 'proceed';

export interface DuplicateOption {
  action: DuplicateAction;
  label: string;
  description: string;
}

export interface DuplicateDecision {
  type: DuplicateDecisionType;
  fileHash: string;
  existingDocument?: DocumentRecord;
  message: string;
  options: DuplicateOption[];
}

export interface BlobStorageDecision {
  storeBlob: boolean;
  sizeBytes: number;
  capBytes: number;
  reason?: string;
}

/**
 * Compute SHA-256 hash of raw file bytes.
 */
export async function computeFileHash(data: ArrayBuffer | Uint8Array): Promise<string> {
  return computeSha256(data);
}

/**
 * Normalize extracted text before hashing to ensure cross-platform CRLF and trailing whitespace invariance.
 */
export function normalizeDocumentTextForHash(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

/**
 * Compute SHA-256 hash of normalized extracted text.
 */
export async function computeContentHash(text: string): Promise<string> {
  return computeSha256(normalizeDocumentTextForHash(text));
}

/**
 * In-flight interaction deduplicator:
 * Prevents identical file selection events from triggering duplicate simultaneous pipeline runs
 * (e.g. accidental double-drops, repeated file-picker selection events).
 */
export class InFlightSelectionDeduplicator {
  private activeSignatures = new Set<string>();

  /**
   * Generates a stable interaction signature for a file based on name, size, and lastModified.
   */
  getSignature(filename: string, size: number, lastModified?: number): string {
    return `${filename}:${size}:${lastModified ?? 0}`;
  }

  /**
   * Checks if a file interaction is currently active/in-flight.
   */
  isInFlight(signature: string): boolean {
    return this.activeSignatures.has(signature);
  }

  /**
   * Registers a file as in-flight and returns an unregister callback to release it.
   */
  register(signature: string): () => void {
    this.activeSignatures.add(signature);
    return () => {
      this.activeSignatures.delete(signature);
    };
  }

  clear(): void {
    this.activeSignatures.clear();
  }
}

export const inFlightDeduplicator = new InFlightSelectionDeduplicator();

/**
 * Evaluate whether an uploaded file is an exact duplicate, filename collision, or unique material.
 *
 * Rules:
 * 1. Same bytes (fileHash matches) -> EXACT_DUPLICATE: "Already in your library"
 *    Options: "Open existing material" or "Import as separate copy".
 * 2. Same filename but different bytes -> FILENAME_COLLISION: "Same filename, different content"
 *    Never auto-merge by name!
 *    Options: "Import as new material" or "Replace existing material".
 * 3. Distinct bytes & filename -> UNIQUE: "Process material".
 */
export function evaluateDuplicateDecision(
  fileHash: string,
  filename: string,
  existingDocs: DocumentRecord[],
): DuplicateDecision {
  // Check for exact byte match first
  const exactMatch = existingDocs.find(
    (doc) => (doc.fileHash && doc.fileHash === fileHash) || doc.contentHash === fileHash,
  );

  if (exactMatch) {
    return {
      type: 'EXACT_DUPLICATE',
      fileHash,
      existingDocument: exactMatch,
      message: `"${filename}" is already in your library.`,
      options: [
        {
          action: 'open_existing',
          label: 'Open existing material',
          description: 'View the already processed material in your library.',
        },
        {
          action: 'import_copy',
          label: 'Import as separate copy',
          description: 'Create an independent duplicate copy with a new material ID.',
        },
      ],
    };
  }

  // Check for filename collision with different content
  const filenameMatch = existingDocs.find(
    (doc) => doc.filename.toLowerCase() === filename.toLowerCase(),
  );

  if (filenameMatch) {
    return {
      type: 'FILENAME_COLLISION',
      fileHash,
      existingDocument: filenameMatch,
      message: `A document named "${filename}" already exists with different content.`,
      options: [
        {
          action: 'import_new',
          label: 'Import as new material',
          description: 'Keep existing material and import this as a new, distinct document.',
        },
        {
          action: 'replace_existing',
          label: 'Replace existing material',
          description:
            'Update the existing document with this new content (matched concepts preserve study history).',
        },
      ],
    };
  }

  return {
    type: 'UNIQUE',
    fileHash,
    message: `Ready to process "${filename}".`,
    options: [
      {
        action: 'proceed',
        label: 'Process material',
        description: 'Extract structure, analyze concepts, and build learning units.',
      },
    ],
  };
}

/**
 * Evaluate whether the raw file should be stored as a Blob in materialFiles store.
 * Files > 10 MiB are not stored as Blobs to protect IndexedDB quota, but are fully
 * supported via extracted text and chunks.
 */
export function evaluateBlobStorage(
  sizeBytes: number,
  capBytes = MAX_BLOB_STORAGE_BYTES,
): BlobStorageDecision {
  if (sizeBytes <= capBytes) {
    return {
      storeBlob: true,
      sizeBytes,
      capBytes,
    };
  }

  return {
    storeBlob: false,
    sizeBytes,
    capBytes,
    reason: `File size (${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB) exceeds the 10 MiB blob storage cap. Extracted text will be stored, but the raw binary file will not be stored in IndexedDB.`,
  };
}
