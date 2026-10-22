import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from '@/lib/config/ingestion';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { computeSha256 } from '@/lib/utils/hash';
import { type DocumentChunkRecord } from '@/types/domain';
import {
  type NormalizedDocument,
  type NormalizedHeading,
  type NormalizedPageBoundary,
} from './types';

export interface ChunkOptions {
  targetSize?: number;
  overlap?: number;
  minSize?: number;
}

/**
 * Determine the active hierarchical heading path at a given character offset.
 */
export function getHeadingPathAtOffset(
  headings: NormalizedHeading[] | undefined,
  offset: number,
): string[] | undefined {
  if (!headings || headings.length === 0) {
    return undefined;
  }

  const stack: NormalizedHeading[] = [];
  for (const h of headings) {
    if (h.offset <= offset) {
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      stack.push(h);
    } else {
      break;
    }
  }

  return stack.length > 0 ? stack.map((h) => h.title) : undefined;
}

/**
 * Determine the page span [pageStart, pageEnd] covering a chunk offset range.
 */
export function getPageSpanAtRange(
  pages: NormalizedPageBoundary[] | undefined,
  startOffset: number,
  endOffset: number,
): { pageStart?: number; pageEnd?: number } {
  if (!pages || pages.length === 0) {
    return {};
  }

  const overlapping = pages.filter(
    (p) => p.startOffset < endOffset && p.endOffset > startOffset,
  );

  if (overlapping.length === 0) {
    return {};
  }

  return {
    pageStart: overlapping[0].pageNumber,
    pageEnd: overlapping[overlapping.length - 1].pageNumber,
  };
}

/**
 * Find the most suitable cut point near idealEnd that respects
 * paragraphs, newlines, sentences, or word boundaries.
 */
function findBestSplitPoint(
  text: string,
  start: number,
  idealEnd: number,
  minEnd: number,
): number {
  const boundedIdeal = Math.min(idealEnd, text.length);
  if (boundedIdeal >= text.length) {
    return text.length;
  }

  const searchStart = Math.max(minEnd, start);
  const searchSlice = text.slice(searchStart, boundedIdeal);

  // 1. Paragraph boundary: double newline \n\n
  const lastParagraph = searchSlice.lastIndexOf('\n\n');
  if (lastParagraph !== -1) {
    return searchStart + lastParagraph + 2;
  }

  // 2. Line boundary: single newline \n
  const lastNewline = searchSlice.lastIndexOf('\n');
  if (lastNewline !== -1) {
    return searchStart + lastNewline + 1;
  }

  // 3. Sentence boundaries (Latin and CJK/multilingual punctuation)
  const sentenceRegex = /[.!?。！？](\s|$)/g;
  let lastSentenceEnd = -1;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(searchSlice)) !== null) {
    lastSentenceEnd = match.index + match[0].length;
  }
  if (lastSentenceEnd !== -1) {
    return searchStart + lastSentenceEnd;
  }

  // 4. Word boundary: whitespace
  const lastSpace = searchSlice.lastIndexOf(' ');
  if (lastSpace !== -1) {
    return searchStart + lastSpace + 1;
  }

  // 5. Look slightly ahead (up to 20% past idealEnd) for a word or sentence break
  const lookaheadLimit = Math.min(text.length, boundedIdeal + Math.floor((idealEnd - start) * 0.2));
  const lookaheadSlice = text.slice(boundedIdeal, lookaheadLimit);
  const nextBreak = lookaheadSlice.search(/[\s.!?。！？]/);
  if (nextBreak !== -1) {
    return boundedIdeal + nextBreak + 1;
  }

  // 6. Hard cut if unbroken string
  return boundedIdeal;
}

/**
 * Find next chunk start offset with clean word or sentence boundary near (end - overlap).
 */
function findNextStartOffset(
  text: string,
  currentStart: number,
  currentEnd: number,
  overlap: number,
): number {
  if (overlap <= 0 || currentEnd >= text.length) {
    return currentEnd;
  }

  const targetStart = Math.max(currentStart + 1, currentEnd - overlap);
  // Search near targetStart for sentence or word boundary
  const searchRegionStart = Math.max(currentStart + 1, targetStart - 30);
  const searchRegionEnd = Math.min(currentEnd - 1, targetStart + 30);

  if (searchRegionStart >= searchRegionEnd) {
    return targetStart;
  }

  const slice = text.slice(searchRegionStart, searchRegionEnd);
  // Look for sentence boundary or whitespace
  const spaceIndex = slice.indexOf(' ');
  if (spaceIndex !== -1) {
    const candidate = searchRegionStart + spaceIndex + 1;
    if (candidate > currentStart && candidate < currentEnd) {
      return candidate;
    }
  }

  return targetStart;
}

/**
 * Chunks a normalized document into semantically bounded, overlapping chunks.
 * Guarantees exact provenance: doc.text.slice(startOffset, endOffset) === chunk.text
 */
export async function chunkDocument(
  doc: NormalizedDocument,
  documentId: string,
  options: ChunkOptions = {},
): Promise<DocumentChunkRecord[]> {
  const text = doc.text;
  if (!text || text.length === 0) {
    return [];
  }

  const targetSize = options.targetSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const minSize = options.minSize ?? MIN_CHUNK_SIZE;

  // Single chunk if document is small enough
  if (text.length <= targetSize) {
    const contentHash = await computeSha256(text);
    const { pageStart, pageEnd } = getPageSpanAtRange(doc.pages, 0, text.length);
    const headingPath = getHeadingPathAtOffset(doc.headings, 0);

    return [
      {
        id: generateId(),
        documentId,
        chunkIndex: 0,
        text,
        startOffset: 0,
        endOffset: text.length,
        pageStart,
        pageEnd,
        headingPath,
        contentHash,
        createdAt: nowIso(),
      },
    ];
  }

  const chunks: DocumentChunkRecord[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    // If remaining text is within 1.25x targetSize, take all remaining text in one final chunk
    if (text.length - start <= targetSize * 1.25) {
      const chunkText = text.slice(start, text.length);
      const contentHash = await computeSha256(chunkText);
      const { pageStart, pageEnd } = getPageSpanAtRange(doc.pages, start, text.length);
      const headingPath = getHeadingPathAtOffset(doc.headings, start);

      chunks.push({
        id: generateId(),
        documentId,
        chunkIndex,
        text: chunkText,
        startOffset: start,
        endOffset: text.length,
        pageStart,
        pageEnd,
        headingPath,
        contentHash,
        createdAt: nowIso(),
      });
      break;
    }

    const minEnd = start + Math.min(minSize, Math.floor(targetSize * 0.5));
    const idealEnd = start + targetSize;
    let end = findBestSplitPoint(text, start, idealEnd, minEnd);

    // Ensure forward progress
    if (end <= start) {
      end = Math.min(start + targetSize, text.length);
    }

    // If remaining text after this cut is very small, merge it into this chunk
    if (text.length - end < Math.floor(minSize * 0.5)) {
      end = text.length;
    }

    const chunkText = text.slice(start, end);
    const contentHash = await computeSha256(chunkText);
    const { pageStart, pageEnd } = getPageSpanAtRange(doc.pages, start, end);
    const headingPath = getHeadingPathAtOffset(doc.headings, start);

    chunks.push({
      id: generateId(),
      documentId,
      chunkIndex,
      text: chunkText,
      startOffset: start,
      endOffset: end,
      pageStart,
      pageEnd,
      headingPath,
      contentHash,
      createdAt: nowIso(),
    });

    if (end >= text.length) {
      break;
    }

    // Advance start with overlap
    const nextStart = findNextStartOffset(text, start, end, overlap);
    if (nextStart <= start) {
      start = end; // Fallback to avoid infinite loop
    } else {
      start = nextStart;
    }

    chunkIndex++;
  }

  return chunks;
}
