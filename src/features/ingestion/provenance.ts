import { type DocumentChunkRecord, type DocumentRecord } from '@/types/domain';

export interface ChunkExcerpt {
  before: string;
  matched: string;
  after: string;
  fullExcerpt: string;
}

/**
 * Mathematically verifies that a chunk is an exact, uncorrupted slice
 * of the document's stored normalized text:
 * document.extractedText.slice(startOffset, endOffset) === chunk.text
 */
export function verifyChunkProvenance(
  document: Pick<DocumentRecord, 'extractedText'>,
  chunk: Pick<DocumentChunkRecord, 'text' | 'startOffset' | 'endOffset'>,
): boolean {
  if (
    chunk.startOffset < 0 ||
    chunk.endOffset > document.extractedText.length ||
    chunk.startOffset > chunk.endOffset
  ) {
    return false;
  }

  const actualSlice = document.extractedText.slice(chunk.startOffset, chunk.endOffset);
  return actualSlice === chunk.text;
}

/**
 * Returns a contextual excerpt of a chunk within its parent document,
 * useful for provenance verification and UI inspection.
 */
export function getChunkExcerpt(
  document: Pick<DocumentRecord, 'extractedText'>,
  chunk: Pick<DocumentChunkRecord, 'text' | 'startOffset' | 'endOffset'>,
  contextChars = 120,
): ChunkExcerpt {
  const beforeStart = Math.max(0, chunk.startOffset - contextChars);
  const before = document.extractedText.slice(beforeStart, chunk.startOffset);
  const matched = chunk.text;
  const afterEnd = Math.min(document.extractedText.length, chunk.endOffset + contextChars);
  const after = document.extractedText.slice(chunk.endOffset, afterEnd);

  const prefix = beforeStart > 0 ? '…' : '';
  const suffix = afterEnd < document.extractedText.length ? '…' : '';

  return {
    before,
    matched,
    after,
    fullExcerpt: `${prefix}${before}${matched}${after}${suffix}`,
  };
}
