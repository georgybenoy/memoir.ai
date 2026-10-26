import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateDuplicateDecision,
  inFlightDeduplicator,
  computeFileHash,
  computeContentHash,
  evaluateBlobStorage,
  MAX_BLOB_STORAGE_BYTES,
} from '@/features/ingestion/duplicates';
import { type DocumentRecord } from '@/types/domain';

describe('Material Duplicates & Hashing (Phase R2)', () => {
  const encoder = new TextEncoder();

  const mockDocs: DocumentRecord[] = [
    {
      id: 'doc-uuid-1',
      materialId: 'doc-uuid-1',
      filename: 'Lecture1_Introduction.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      extractedText: 'Introduction to operating systems and processes.',
      analysisStatus: 'completed',
      fileHash: 'hash-aaa-111',
      contentHash: 'content-hash-aaa',
      contentVersion: 'content-hash-aaa',
      metadata: {},
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    },
    {
      id: 'doc-uuid-2',
      materialId: 'doc-uuid-2',
      filename: 'Chapter2_Memory.pdf',
      fileType: 'pdf',
      fileSize: 2048,
      extractedText: 'Virtual memory and paging algorithms.',
      analysisStatus: 'completed',
      fileHash: 'hash-bbb-222',
      contentHash: 'content-hash-bbb',
      contentVersion: 'content-hash-bbb',
      metadata: {},
      createdAt: '2026-10-25T11:00:00.000Z',
      updatedAt: '2026-10-25T11:00:00.000Z',
    },
  ];

  beforeEach(() => {
    inFlightDeduplicator.clear();
  });

  describe('Hashing', () => {
    it('computes deterministic SHA-256 for identical raw bytes', async () => {
      const bytesA = encoder.encode('Deterministic file bytes content 12345');
      const bytesB = encoder.encode('Deterministic file bytes content 12345');

      const hashA = await computeFileHash(bytesA);
      const hashB = await computeFileHash(bytesB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computes normalized content hash ignoring trailing whitespace and CRLF', async () => {
      const textA = 'Line one\r\nLine two  \nLine three';
      const textB = 'Line one\nLine two\nLine three';

      const hashA = await computeContentHash(textA);
      const hashB = await computeContentHash(textB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different content hashes for distinct text', async () => {
      const hashA = await computeContentHash('Hello World');
      const hashB = await computeContentHash('Goodbye World');

      expect(hashA).not.toBe(hashB);
    });
  });

  describe('Duplicate Decision Logic', () => {
    it('detects EXACT_DUPLICATE when bytes match, even with the same filename', () => {
      const decision = evaluateDuplicateDecision(
        'hash-aaa-111',
        'Lecture1_Introduction.pdf',
        mockDocs,
      );

      expect(decision.type).toBe('EXACT_DUPLICATE');
      expect(decision.existingDocument?.id).toBe('doc-uuid-1');
      expect(decision.options.some((o) => o.action === 'open_existing')).toBe(true);
      expect(decision.options.some((o) => o.action === 'import_copy')).toBe(true);
    });

    it('detects EXACT_DUPLICATE when bytes match under a DIFFERENT filename', () => {
      const decision = evaluateDuplicateDecision(
        'hash-aaa-111',
        'My_Renamed_Lecture1.pdf',
        mockDocs,
      );

      expect(decision.type).toBe('EXACT_DUPLICATE');
      expect(decision.existingDocument?.id).toBe('doc-uuid-1');
    });

    it('detects FILENAME_COLLISION when same filename exists with DIFFERENT content bytes', () => {
      const decision = evaluateDuplicateDecision(
        'hash-completely-new-999',
        'Lecture1_Introduction.pdf',
        mockDocs,
      );

      expect(decision.type).toBe('FILENAME_COLLISION');
      expect(decision.existingDocument?.id).toBe('doc-uuid-1');
      expect(decision.options.some((o) => o.action === 'import_new')).toBe(true);
      expect(decision.options.some((o) => o.action === 'replace_existing')).toBe(true);
    });

    it('detects UNIQUE when both filename and hash are unseen', () => {
      const decision = evaluateDuplicateDecision(
        'hash-unique-333',
        'Chapter3_FileSystems.pdf',
        mockDocs,
      );

      expect(decision.type).toBe('UNIQUE');
      expect(decision.existingDocument).toBeUndefined();
      expect(decision.options.some((o) => o.action === 'proceed')).toBe(true);
    });
  });

  describe('In-Flight Deduplication', () => {
    it('suppresses rapid repeated drops / file picker events for identical selection', () => {
      const sig = inFlightDeduplicator.getSignature('lecture.pdf', 1048576, 1729000000);
      expect(inFlightDeduplicator.isInFlight(sig)).toBe(false);

      const unregister = inFlightDeduplicator.register(sig);
      expect(inFlightDeduplicator.isInFlight(sig)).toBe(true);

      // Second attempt while first is in-flight is suppressed
      expect(inFlightDeduplicator.isInFlight(sig)).toBe(true);

      unregister();
      expect(inFlightDeduplicator.isInFlight(sig)).toBe(false);
    });
  });

  describe('Blob Storage Cap Policy', () => {
    it('stores blob when file size is within 10 MiB cap', () => {
      const decision = evaluateBlobStorage(5 * 1024 * 1024); // 5 MiB
      expect(decision.storeBlob).toBe(true);
      expect(decision.capBytes).toBe(MAX_BLOB_STORAGE_BYTES);
    });

    it('omits blob when file size exceeds 10 MiB cap and documents reason', () => {
      const decision = evaluateBlobStorage(15 * 1024 * 1024); // 15 MiB
      expect(decision.storeBlob).toBe(false);
      expect(decision.reason).toContain('Extracted text will be stored');
    });
  });
});
