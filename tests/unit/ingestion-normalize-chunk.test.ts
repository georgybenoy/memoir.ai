import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  repairHyphenation,
  normalizeWhitespace,
  normalizeDocument,
} from '@/features/ingestion/normalize';
import { chunkDocument } from '@/features/ingestion/chunk';
import { verifyChunkProvenance, getChunkExcerpt } from '@/features/ingestion/provenance';
import { extractDocumentText } from '@/features/ingestion/extract-text';
import { computeSha256 } from '@/lib/utils/hash';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Normalization and Line Wrap Repair', () => {
  it('conservatively repairs hyphenated line breaks', () => {
    const raw = 'This is an imple-\nmentation of the algo-\nrithm.';
    expect(repairHyphenation(raw)).toBe('This is an implementation of the algorithm.');
  });

  it('leaves intentional compound words, numbers, and dashes intact', () => {
    const compound = 'state-of-the-art\npre-1990\n- item 1\n- item 2';
    expect(repairHyphenation(compound)).toBe(compound);
  });

  it('normalizes CRLF and excessive newlines', () => {
    const raw = 'Paragraph 1\r\n\r\n\r\n\r\nParagraph 2\r\n';
    const normalized = normalizeWhitespace(raw);
    expect(normalized).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('strips trailing line whitespace', () => {
    const raw = 'Line 1   \nLine 2 \t\t\nLine 3';
    expect(normalizeWhitespace(raw)).toBe('Line 1\nLine 2\nLine 3');
  });
});

describe('Chunking Bounds & Edge Cases', () => {
  it('handles tiny documents (< target size) as exactly one chunk', async () => {
    const text = 'A brief note on calculus.';
    const normalized = normalizeDocument({
      filename: 'tiny.txt',
      fileType: 'txt',
      rawText: text,
      metadata: {},
    });

    const chunks = await chunkDocument(normalized, 'doc-tiny');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].endOffset).toBe(text.length);
    expect(chunks[0].text).toBe(text);
    expect(verifyChunkProvenance({ extractedText: normalized.text }, chunks[0])).toBe(true);
  });

  it('handles empty document gracefully', async () => {
    const normalized = normalizeDocument({
      filename: 'empty.txt',
      fileType: 'txt',
      rawText: '',
      metadata: {},
    });

    const chunks = await chunkDocument(normalized, 'doc-empty');
    expect(chunks).toHaveLength(0);
  });

  it('handles giant paragraphs without newlines safely', async () => {
    // 6,000 characters with only spaces
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    const normalized = normalizeDocument({
      filename: 'giant.txt',
      fileType: 'txt',
      rawText: words,
      metadata: {},
    });

    const chunks = await chunkDocument(normalized, 'doc-giant', { targetSize: 1500, overlap: 200 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verify all chunks obey provenance
    for (const chunk of chunks) {
      expect(verifyChunkProvenance({ extractedText: normalized.text }, chunk)).toBe(true);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('handles text with no punctuation or spaces without crashing', async () => {
    // 3,000 uninterrupted characters
    const continuous = 'A'.repeat(3000);
    const normalized = normalizeDocument({
      filename: 'continuous.txt',
      fileType: 'txt',
      rawText: continuous,
      metadata: {},
    });

    const chunks = await chunkDocument(normalized, 'doc-continuous', { targetSize: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(verifyChunkProvenance({ extractedText: normalized.text }, chunk)).toBe(true);
    }
  });

  it('provides accurate contextual excerpts for UI inspection', () => {
    const fullText = 'The quick brown fox jumps over the lazy dog in the sunny afternoon.';
    const chunk = {
      text: 'fox jumps over the lazy dog',
      startOffset: 16,
      endOffset: 43,
    };

    const excerpt = getChunkExcerpt({ extractedText: fullText }, chunk, 10);
    expect(excerpt.matched).toBe('fox jumps over the lazy dog');
    expect(excerpt.before).toBe('ick brown ');
    expect(excerpt.after).toBe(' in the su');
    expect(excerpt.fullExcerpt).toContain('fox jumps over the lazy dog');
  });
});

describe('Property-Style Provenance Invariant Across All Fixtures', () => {
  const fixtures = [
    { filename: 'sample-note.txt', type: 'txt' as const },
    { filename: 'sample-lecture.md', type: 'md' as const },
    { filename: 'non-latin.txt', type: 'txt' as const },
    { filename: 'multipage-sample.pdf', type: 'pdf' as const },
  ];

  for (const { filename, type } of fixtures) {
    it(`guarantees exact slice provenance for every chunk in ${filename}`, async () => {
      const filePath = path.join(FIXTURES_DIR, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Fixture not found: ${filePath}`);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const extracted = await extractDocumentText(fileBuffer, type, filename);
      expect(extracted.rawText.length).toBeGreaterThan(0);

      const normalized = normalizeDocument(extracted);
      expect(normalized.text.length).toBeGreaterThan(0);

      const docRecord = {
        id: `doc-${filename}`,
        filename,
        fileType: type,
        fileSize: fileBuffer.length,
        extractedText: normalized.text,
        analysisStatus: 'pending' as const,
        contentHash: await computeSha256(fileBuffer),
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
      };

      const chunks = await chunkDocument(normalized, docRecord.id, {
        targetSize: 500, // Small target size to force multi-chunk boundary tests
        overlap: 80,
      });

      expect(chunks.length).toBeGreaterThan(0);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        expect(chunk.chunkIndex).toBe(i);
        expect(chunk.documentId).toBe(docRecord.id);

        // Core Mathematical Invariant:
        // doc.extractedText.slice(startOffset, endOffset) === chunk.text
        const exactSlice = docRecord.extractedText.slice(chunk.startOffset, chunk.endOffset);
        expect(exactSlice).toBe(chunk.text);
        expect(verifyChunkProvenance(docRecord, chunk)).toBe(true);

        // Content hash verification
        const computedHash = await computeSha256(chunk.text);
        expect(chunk.contentHash).toBe(computedHash);

        // Offset sanity checks
        expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
        expect(chunk.endOffset).toBeLessThanOrEqual(docRecord.extractedText.length);
        expect(chunk.startOffset).toBeLessThan(chunk.endOffset);

        // Heading path check for Markdown
        if (type === 'md' && chunk.headingPath) {
          expect(Array.isArray(chunk.headingPath)).toBe(true);
          expect(chunk.headingPath.length).toBeGreaterThan(0);
        }

        // Page span check for PDF
        if (type === 'pdf') {
          expect(chunk.pageStart).toBeDefined();
          expect(chunk.pageEnd).toBeDefined();
          expect(chunk.pageStart!).toBeLessThanOrEqual(chunk.pageEnd!);
        }
      }
    });
  }
});
