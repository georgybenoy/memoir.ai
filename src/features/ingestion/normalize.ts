import {
  type ExtractedDocument,
  type NormalizedDocument,
  type NormalizedHeading,
  type NormalizedPageBoundary,
} from './types';

/**
 * Conservative hyphenation repair:
 * Matches a word stem ending in a hyphen at a newline, followed immediately by
 * lowercase letters (e.g., "imple-\nmentation" -> "implementation").
 * Leaves compound words, numbers, and lists untouched.
 */
export function repairHyphenation(text: string): string {
  // Matches letters (min 2), hyphen, newline (with optional space), lowercase continuation
  return text.replace(/([A-Za-z]{2,})-\n\s*([a-z]{2,})/g, '$1$2');
}

/**
 * Normalize whitespace:
 * - Unify CRLF / CR to LF
 * - Replace vertical tabs/form feeds
 * - Remove trailing line whitespace
 * - Collapse 3+ newlines to 2 newlines (preserve paragraph separation)
 * - Collapse excessive spaces within lines
 */
export function normalizeWhitespace(text: string): string {
  let cleaned = text.replace(/\r\n|\r|\f|\v/g, '\n');

  // Strip trailing whitespace from each line
  cleaned = cleaned.replace(/[ \t]+$/gm, '');

  // Conservative hyphenation repair
  cleaned = cleaned.replace(/([A-Za-z]{2,})-\n\s*([a-z]{2,})/g, '$1$2');

  // Collapse 3 or more consecutive newlines into 2 (paragraphs)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Extract markdown headings with precise character offsets directly
 * from the normalized text.
 */
export function extractNormalizedHeadings(text: string): NormalizedHeading[] {
  const headings: NormalizedHeading[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      offset: match.index,
    });
  }

  return headings;
}

/**
 * Normalize an extracted document into clean text with deterministic
 * offset mappings for pages and headings.
 */
export function normalizeDocument(doc: ExtractedDocument): NormalizedDocument {
  const originalCharCount = doc.rawText.length;

  if (doc.fileType === 'pdf' && doc.pages && doc.pages.length > 0) {
    // PDF: Normalize page by page, tracking offsets into the combined string
    const normalizedPages: NormalizedPageBoundary[] = [];
    const textSegments: string[] = [];
    let currentOffset = 0;

    for (const page of doc.pages) {
      const pageText = normalizeWhitespace(page.text);
      if (pageText.length === 0) {
        // Skip empty pages from output
        continue;
      }

      if (textSegments.length > 0) {
        // Page separator \n\n
        currentOffset += 2;
      }

      const startOffset = currentOffset;
      const endOffset = startOffset + pageText.length;
      normalizedPages.push({
        pageNumber: page.pageNumber,
        startOffset,
        endOffset,
      });

      textSegments.push(pageText);
      currentOffset = endOffset;
    }

    const fullNormalizedText = textSegments.join('\n\n');

    return {
      text: fullNormalizedText,
      pages: normalizedPages,
      headings: [],
      originalCharCount,
      normalizedCharCount: fullNormalizedText.length,
    };
  }

  // TXT / Markdown
  const normalizedText = normalizeWhitespace(doc.rawText);
  const headings = doc.fileType === 'md' ? extractNormalizedHeadings(normalizedText) : [];

  const pages: NormalizedPageBoundary[] = normalizedText.length > 0
    ? [{ pageNumber: 1, startOffset: 0, endOffset: normalizedText.length }]
    : [];

  return {
    text: normalizedText,
    pages,
    headings,
    originalCharCount,
    normalizedCharCount: normalizedText.length,
  };
}
