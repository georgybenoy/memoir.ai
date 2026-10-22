import { describe, it, expect } from 'vitest';
import { validateUploadFile } from '@/features/ingestion/validate';
import { MAX_UPLOAD_BYTES } from '@/lib/config/ingestion';

describe('Ingestion Validation Matrix', () => {
  it('rejects empty files (0 bytes)', () => {
    const res = validateUploadFile('empty.txt', 0);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('EMPTY_FILE');
    expect(res.error).toMatch(/empty/i);
  });

  it('rejects files exceeding MAX_UPLOAD_BYTES', () => {
    const res = validateUploadFile('huge.pdf', MAX_UPLOAD_BYTES + 1);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('FILE_TOO_LARGE');
    expect(res.error).toMatch(/exceeds/i);
  });

  it('rejects files without extension', () => {
    const res = validateUploadFile('README', 100);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('UNSUPPORTED_TYPE');
    expect(res.error).toMatch(/no file extension/i);
  });

  it('rejects unsupported extensions (.docx, .png, .exe, .html)', () => {
    for (const ext of ['.docx', '.png', '.exe', '.html', '.zip']) {
      const res = validateUploadFile(`file${ext}`, 500);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('UNSUPPORTED_TYPE');
    }
  });

  it('accepts valid extensions (.pdf, .txt, .md)', () => {
    expect(validateUploadFile('notes.pdf', 1024).valid).toBe(true);
    expect(validateUploadFile('lecture.txt', 1024).valid).toBe(true);
    expect(validateUploadFile('chapter.md', 1024).valid).toBe(true);
  });

  it('validates PDF magic bytes (%PDF-)', () => {
    const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    const res = validateUploadFile('lecture.pdf', 500, 'application/pdf', validPdfHeader);
    expect(res.valid).toBe(true);
    expect(res.fileType).toBe('pdf');
  });

  it('rejects disguised plain text files with .pdf extension (SIGNATURE_MISMATCH)', () => {
    const fakePdfBytes = new TextEncoder().encode('This is plain text with a .pdf extension.');
    const res = validateUploadFile('disguised.pdf', fakePdfBytes.length, 'application/pdf', fakePdfBytes);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('SIGNATURE_MISMATCH');
    expect(res.error).toMatch(/missing %PDF- header/i);
  });

  it('rejects plain text/markdown containing NUL bytes (SIGNATURE_MISMATCH)', () => {
    const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]); // "Hello\0World"
    const res = validateUploadFile('binary.txt', binaryData.length, 'text/plain', binaryData);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('SIGNATURE_MISMATCH');
    expect(res.error).toMatch(/binary data/i);
  });

  it('rejects invalid UTF-8 byte sequences in text files (CORRUPT_FILE)', () => {
    // 0xFF 0xFF is an invalid UTF-8 sequence
    const corruptUtf8 = new Uint8Array([0xff, 0xff, 0x80, 0xbf]);
    const res = validateUploadFile('corrupt.txt', corruptUtf8.length, 'text/plain', corruptUtf8);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('CORRUPT_FILE');
    expect(res.error).toMatch(/invalid UTF-8/i);
  });

  it('accepts multi-byte non-Latin UTF-8 text files', () => {
    const greekJapanese = new TextEncoder().encode('Ελληνικά και 日本語');
    const res = validateUploadFile('notes.txt', greekJapanese.length, 'text/plain', greekJapanese);
    expect(res.valid).toBe(true);
    expect(res.fileType).toBe('txt');
  });
});
