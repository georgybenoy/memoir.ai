import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  extractTextFromBuffer,
  extractTextFromPdf,
  IngestionError,
} from '@/features/ingestion/extract-text';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Text & Markdown Extraction', () => {
  it('extracts plain text and strips UTF-8 BOM if present', () => {
    // 0xEF, 0xBB, 0xBF is the UTF-8 BOM
    const bomBuffer = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('Title: Calculus I\nLimits and continuity.')]);
    const res = extractTextFromBuffer(bomBuffer, 'txt', 'test.txt');
    expect(res.rawText.startsWith('Title: Calculus I')).toBe(true);
    expect(res.rawText.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('extracts hierarchical Markdown headings and offsets', () => {
    const md = `# Computer Science\n\n## Data Structures\n\n### Trees\n\nContent here.`;
    const res = extractTextFromBuffer(Buffer.from(md, 'utf-8'), 'md', 'test.md');
    expect(res.headings).toBeDefined();
    expect(res.headings).toHaveLength(3);
    expect(res.headings![0]).toEqual({
      level: 1,
      title: 'Computer Science',
      charOffset: 0,
    });
    expect(res.headings![1].title).toBe('Data Structures');
    expect(res.headings![2].title).toBe('Trees');
  });
});

describe('PDF Extraction using pdfjs-dist', () => {
  it('extracts multi-page text PDF with per-page text and page count', async () => {
    const pdfPath = path.join(FIXTURES_DIR, 'multipage-sample.pdf');
    const buffer = fs.readFileSync(pdfPath);

    const progressPages: number[] = [];
    const res = await extractTextFromPdf(buffer, 'multipage-sample.pdf', (curr) => {
      progressPages.push(curr);
    });

    expect(res.fileType).toBe('pdf');
    expect(res.metadata.pageCount).toBe(3);
    expect(res.pages).toHaveLength(3);
    expect(progressPages).toEqual([1, 2, 3]);

    // Check page text contents
    expect(res.pages![0].text).toContain('Foundations of Molecular Biology');
    expect(res.pages![1].text).toContain('Bioenergetics and ATP Synthesis');
    expect(res.pages![2].text).toContain('Genetics, Transcription and Translation');
  });

  it('detects scanned / image-only PDFs and throws NO_EXTRACTABLE_TEXT with OCR notice', async () => {
    const pdfPath = path.join(FIXTURES_DIR, 'scanned-sample.pdf');
    const buffer = fs.readFileSync(pdfPath);

    await expect(extractTextFromPdf(buffer, 'scanned-sample.pdf')).rejects.toThrowError(
      /Optical Character Recognition \(OCR\) is not supported in this version/i,
    );

    try {
      await extractTextFromPdf(buffer, 'scanned-sample.pdf');
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
      expect((err as IngestionError).code).toBe('NO_EXTRACTABLE_TEXT');
    }
  });

  it('detects encrypted / password-protected PDFs and throws PDF_ENCRYPTED', async () => {
    const pdfPath = path.join(FIXTURES_DIR, 'encrypted-sample.pdf');
    const buffer = fs.readFileSync(pdfPath);

    try {
      await extractTextFromPdf(buffer, 'encrypted-sample.pdf');
      // If pdfjs-dist in test environment somehow parses without error, fail
      expect.fail('Should have thrown PDF_ENCRYPTED');
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
      expect((err as IngestionError).code).toBe('PDF_ENCRYPTED');
      expect((err as Error).message).toMatch(/password-protected or encrypted/i);
    }
  });
});
