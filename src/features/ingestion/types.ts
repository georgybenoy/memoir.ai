import { type DocumentFileType, type DocumentRecord, type DocumentChunkRecord } from '@/types/domain';

export type ValidationErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'CORRUPT_FILE'
  | 'SIGNATURE_MISMATCH';

export type ExtractionErrorCode =
  | 'PDF_ENCRYPTED'
  | 'NO_EXTRACTABLE_TEXT'
  | 'CORRUPT_FILE'
  | 'UNSUPPORTED_FORMAT';

export interface FileValidationResult {
  valid: boolean;
  code?: ValidationErrorCode;
  error?: string;
  fileType?: DocumentFileType;
  mimeType?: string;
  sizeBytes: number;
  filename: string;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedHeading {
  title: string;
  level: number;
  charOffset: number;
}

export interface ExtractedDocument {
  filename: string;
  fileType: DocumentFileType;
  rawText: string;
  pages?: ExtractedPage[];
  headings?: ExtractedHeading[];
  metadata: {
    pageCount?: number;
    title?: string;
    author?: string;
    producer?: string;
    creationDate?: string;
    [key: string]: unknown;
  };
}

export interface NormalizedPageBoundary {
  pageNumber: number;
  startOffset: number;
  endOffset: number;
}

export interface NormalizedHeading {
  title: string;
  level: number;
  offset: number;
}

export interface NormalizedDocument {
  text: string;
  pages: NormalizedPageBoundary[];
  headings: NormalizedHeading[];
  originalCharCount: number;
  normalizedCharCount: number;
}

export interface ChunkMetadata {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  pageStart?: number;
  pageEnd?: number;
  headingPath?: string[];
  contentHash: string;
}

export type IngestionStage =
  | 'validating'
  | 'extracting'
  | 'normalizing'
  | 'chunking'
  | 'persisting'
  | 'completed'
  | 'error';

export interface IngestionProgress {
  stage: IngestionStage;
  percent: number; // 0 - 100
  message: string;
  currentPage?: number;
  totalPages?: number;
  chunkCount?: number;
}

export interface IngestFileInput {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface IngestResult {
  success: boolean;
  documentId?: string;
  document?: DocumentRecord;
  chunks?: DocumentChunkRecord[];
  alreadyImported?: boolean;
  error?: string;
  code?: ValidationErrorCode | ExtractionErrorCode | string;
}
