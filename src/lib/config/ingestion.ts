/**
 * Ingestion Configuration Constants
 * Source of truth: PRD FR-02, §10 and TECH_STACK §4
 */

/** Maximum allowed upload size (default 25 MiB = 26,214,400 bytes) */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Supported file extensions */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Supported declared MIME types */
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
] as const;

/** Target chunk size in characters (approx 250-300 words) */
export const DEFAULT_CHUNK_SIZE = 1500;

/** Chunk overlap in characters to maintain cross-boundary context */
export const DEFAULT_CHUNK_OVERLAP = 200;

/** Minimum chunk size to prevent tiny fragments */
export const MIN_CHUNK_SIZE = 100;

/** Helper to format byte counts into human-readable strings */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
