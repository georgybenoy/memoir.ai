import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  extractConceptsForDocument,
  partitionChunksIntoBatches,
} from '@/features/concepts/pipeline';
import {
  deduplicateConcepts,
  normalizeConceptTitle,
  computeJaccardSimilarity,
} from '@/features/concepts/deduplicate';
import {
  teachConcept,
  getOrCreateTopicConcept,
} from '@/features/concepts/teaching-service';
import { openDatabase, closeDatabase } from '@/lib/db/indexeddb';
import { type ExtractedConceptDto } from '@/lib/ai/schemas';
import { type DocumentRecord, type DocumentChunkRecord } from '@/types/domain';
import * as aiClient from '@/lib/ai/client';

describe('Concept Extraction Pipeline & Teaching Service', () => {
  const TEST_DB = `test-concepts-${Date.now()}`;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await openDatabase(TEST_DB);
  });

  afterEach(async () => {
    await closeDatabase(TEST_DB);
  });

  describe('Deduplication & Similarity Logic', () => {
    it('normalizes titles by removing leading articles, punctuation, and extra whitespace', () => {
      expect(normalizeConceptTitle('The Binary Search Tree!')).toBe('binary search tree');
      expect(normalizeConceptTitle('  An   Operating System  ')).toBe('operating system');
      expect(normalizeConceptTitle('A Linked-List')).toBe('linked-list');
    });

    it('computes Jaccard similarity correctly', () => {
      const setA = ['process', 'thread', 'memory'];
      const setB = ['thread', 'memory', 'cpu'];
      // Intersection = 2 ('thread', 'memory'), Union = 4 ('process', 'thread', 'memory', 'cpu')
      expect(computeJaccardSimilarity(setA, setB)).toBe(2 / 4);
      expect(computeJaccardSimilarity([], [])).toBe(1.0);
    });

    it('merges duplicate concepts across batches, unions source chunk IDs, and keeps highest confidence', () => {
      const rawConcepts: ExtractedConceptDto[] = [
        {
          tempId: 't1',
          title: 'Binary Search Tree',
          summary: 'A rooted binary tree data structure with sorted keys.',
          canonicalExplanation: 'For each node, left subtree has keys < node key, and right has keys > node key.',
          keyTerms: ['BST', 'In-order traversal', 'Search tree'],
          sourceChunkIds: ['c1', 'c2'],
          confidence: 0.85,
          prerequisiteTitles: ['Binary Tree'],
        },
        {
          tempId: 't2',
          title: 'The Binary Search Tree', // Same concept, different title casing/article
          summary: 'A binary tree where left child is smaller and right child is greater.',
          canonicalExplanation: 'Nodes arranged such that left < root < right. Enables O(log n) lookup.',
          keyTerms: ['BST', 'Lookup', 'Search tree'],
          sourceChunkIds: ['c2', 'c3'], // Union should be c1, c2, c3
          confidence: 0.95, // Higher confidence should be kept
          prerequisiteTitles: ['Trees'],
        },
        {
          tempId: 't3',
          title: 'Hash Tables', // Distinct concept
          summary: 'A data structure that maps keys to values using a hash function.',
          canonicalExplanation: 'Uses a bucket array and hash function for O(1) average lookup.',
          keyTerms: ['Hash map', 'Collision', 'Buckets'],
          sourceChunkIds: ['c4'],
          confidence: 0.9,
          prerequisiteTitles: ['Arrays'],
        },
      ];

      const deduplicated = deduplicateConcepts(rawConcepts);
      expect(deduplicated).toHaveLength(2);

      const bst = deduplicated.find((c) => c.title.toLowerCase().includes('binary search'));
      expect(bst).toBeDefined();
      expect(bst?.confidence).toBe(0.95);
      expect(bst?.sourceChunkIds.sort()).toEqual(['c1', 'c2', 'c3']);
      expect(bst?.keyTerms).toContain('BST');
      expect(bst?.keyTerms).toContain('In-order traversal');
      expect(bst?.keyTerms).toContain('Lookup');
      expect(bst?.prerequisiteTitles).toContain('Binary Tree');
      expect(bst?.prerequisiteTitles).toContain('Trees');

      const hashTables = deduplicated.find((c) => c.title === 'Hash Tables');
      expect(hashTables).toBeDefined();
    });
  });

  describe('partitionChunksIntoBatches', () => {
    it('partitions chunks into batches respecting count and character limits', () => {
      const mockChunks: DocumentChunkRecord[] = Array.from({ length: 25 }, (_, i) => ({
        id: `chunk-${i}`,
        documentId: 'doc-1',
        chunkIndex: i,
        text: `Chunk content number ${i}. `.repeat(20),
        startOffset: i * 500,
        endOffset: (i + 1) * 500,
        contentHash: `hash-${i}`,
        createdAt: new Date().toISOString(),
      }));

      const batches = partitionChunksIntoBatches(mockChunks);
      expect(batches.length).toBeGreaterThan(1);
      // Batch max size is 10
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('extractConceptsForDocument Pipeline & Hallucinated Citations', () => {
    it('executes pipeline, removes hallucinated chunk IDs, maps prerequisites, and commits atomically', async () => {
      const db = await openDatabase(TEST_DB);

      // Seed a document with 2 chunks
      const docRecord: DocumentRecord = {
        id: 'doc-test-1',
        filename: 'data-structures.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        extractedText: 'Binary Trees and Binary Search Trees...',
        analysisStatus: 'pending',
        contentHash: 'hash-doc-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('documents', docRecord);

      const chunk1: DocumentChunkRecord = {
        id: 'real-chunk-1',
        documentId: 'doc-test-1',
        chunkIndex: 0,
        text: 'A tree is a hierarchical data structure.',
        startOffset: 0,
        endOffset: 50,
        contentHash: 'hash-c1',
        createdAt: new Date().toISOString(),
      };
      const chunk2: DocumentChunkRecord = {
        id: 'real-chunk-2',
        documentId: 'doc-test-1',
        chunkIndex: 1,
        text: 'A binary tree has at most two children per node.',
        startOffset: 51,
        endOffset: 120,
        contentHash: 'hash-c2',
        createdAt: new Date().toISOString(),
      };
      await db.put('documentChunks', chunk1);
      await db.put('documentChunks', chunk2);

      // Mock AI extraction response:
      // - Concept A: cites real-chunk-1 and hallucinated 'nonexistent-chunk-99'
      // - Concept B: cites real-chunk-2, has Concept A as prerequisite
      // - Concept C: cites only hallucinated 'fake-chunk-xyz', has unresolved prereq 'Graph Theory'
      const mockExtractionResponse = {
        concepts: [
          {
            tempId: 'c-a',
            title: 'Trees',
            summary: 'Hierarchical node structure',
            canonicalExplanation: 'Trees have roots and leaf nodes.',
            keyTerms: ['Tree', 'Root', 'Leaf'],
            sourceChunkIds: ['real-chunk-1', 'nonexistent-chunk-99'],
            confidence: 0.95,
            prerequisiteTitles: [],
          },
          {
            tempId: 'c-b',
            title: 'Binary Tree',
            summary: 'Trees with degree <= 2',
            canonicalExplanation: 'Each node has left and right pointers.',
            keyTerms: ['Binary Tree', 'Left child', 'Right child'],
            sourceChunkIds: ['real-chunk-2'],
            confidence: 0.9,
            prerequisiteTitles: ['Trees'], // Matches Concept A
          },
          {
            tempId: 'c-c',
            title: 'Advanced Heaps',
            summary: 'Priority queue implementation',
            canonicalExplanation: 'Min-heaps and max-heaps maintain heap property.',
            keyTerms: ['Heap', 'Priority queue'],
            sourceChunkIds: ['fake-chunk-xyz'], // Hallucinated citation
            confidence: 0.85,
            prerequisiteTitles: ['Graph Theory'], // Unresolved prerequisite
          },
        ],
      };

      vi.spyOn(aiClient, 'fetchExtractConcepts').mockResolvedValue(mockExtractionResponse);

      const progressSteps: string[] = [];
      const result = await extractConceptsForDocument({
        documentId: 'doc-test-1',
        dbName: TEST_DB,
        onProgress: (p) => progressSteps.push(p.stage),
      });

      expect(result.success).toBe(true);
      expect(result.concepts).toHaveLength(3);
      expect(result.hallucinatedCitationsRemoved).toBeGreaterThanOrEqual(1);

      // Verify Concept A had hallucinated citation removed
      const conceptA = result.concepts.find((c) => c.title === 'Trees');
      expect(conceptA?.sourceChunkIds).toEqual(['real-chunk-1']);
      expect(conceptA?.tier).toBe(0); // Foundational, no prereqs

      // Verify Concept B is linked to Concept A
      const conceptB = result.concepts.find((c) => c.title === 'Binary Tree');
      expect(conceptB?.tier).toBe(1); // Core, depends on Tier 0
      const depAB = result.dependencies.find(
        (d) => d.prerequisiteId === conceptA?.id && d.dependentConceptId === conceptB?.id,
      );
      expect(depAB).toBeDefined();

      // Verify Concept C had completely hallucinated citation bound to first chunk with penalized confidence
      const conceptC = result.concepts.find((c) => c.title === 'Advanced Heaps');
      expect(conceptC?.sourceChunkIds).toEqual(['real-chunk-1']);
      expect(conceptC?.confidence).toBeLessThanOrEqual(0.4);

      // Verify unresolved prerequisite 'Graph Theory' was recorded
      expect(result.unresolvedPrerequisites).toHaveLength(1);
      expect(result.unresolvedPrerequisites[0].prerequisiteTitle).toBe('Graph Theory');

      // Verify document analysisStatus updated to completed
      const updatedDoc = await db.get('documents', 'doc-test-1');
      expect(updatedDoc?.analysisStatus).toBe('completed');
      expect(updatedDoc?.metadata?.conceptCount).toBe(3);

      // Verify progress stages were reported
      expect(progressSteps).toContain('batching');
      expect(progressSteps).toContain('extracting');
      expect(progressSteps).toContain('deduplicating');
      expect(progressSteps).toContain('persisting');
      expect(progressSteps).toContain('completed');
    });

    it('preserves document and sets status to failed if pipeline encounters an error or cancellation', async () => {
      const db = await openDatabase(TEST_DB);

      const docRecord: DocumentRecord = {
        id: 'doc-fail-1',
        filename: 'failing-notes.txt',
        fileType: 'txt',
        fileSize: 500,
        extractedText: 'Some notes text',
        analysisStatus: 'pending',
        contentHash: 'hash-f1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('documents', docRecord);

      const chunk: DocumentChunkRecord = {
        id: 'chunk-f1',
        documentId: 'doc-fail-1',
        chunkIndex: 0,
        text: 'Some notes text content',
        startOffset: 0,
        endOffset: 25,
        contentHash: 'hash-cf1',
        createdAt: new Date().toISOString(),
      };
      await db.put('documentChunks', chunk);

      // Simulate API failure
      vi.spyOn(aiClient, 'fetchExtractConcepts').mockRejectedValue(
        new Error('Gemini API quota exceeded'),
      );

      const result = await extractConceptsForDocument({
        documentId: 'doc-fail-1',
        dbName: TEST_DB,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gemini API quota exceeded');

      // Document MUST be preserved and marked as failed (not dropped or corrupted)
      const docInDb = await db.get('documents', 'doc-fail-1');
      expect(docInDb).toBeDefined();
      expect(docInDb?.analysisStatus).toBe('failed');

      // Chunks MUST still exist
      const chunksInDb = await db.getAllFromIndex('documentChunks', 'by-document', 'doc-fail-1');
      expect(chunksInDb).toHaveLength(1);
    });
  });

  describe('Teaching Service & Socratic Dialogue', () => {
    it('interacts with explain-concept API and persists dialogue in IndexedDB', async () => {
      const db = await openDatabase(TEST_DB);

      const concept = {
        id: 'concept-1',
        title: 'Merge Sort',
        summary: 'Divide and conquer sorting algorithm.',
        canonicalExplanation: 'Recursively divides array into halves and merges in sorted order.',
        keyTerms: ['Divide and conquer', 'O(n log n)'],
        sourceChunkIds: ['c1'],
        tier: 1,
        status: 'available' as const,
        confidence: 0.9,
        extractionOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('concepts', concept);

      const mockExplainResponse = {
        message: 'Merge sort splits a list into single elements and systematically merges them in order.',
        expression: 'explaining' as const,
        grounded: true,
        citedChunkIds: ['c1'],
        followUpQuestion: 'Why does Merge Sort require O(n) auxiliary space?',
      };

      vi.spyOn(aiClient, 'fetchExplainConcept').mockResolvedValue(mockExplainResponse);

      const result = await teachConcept({
        conceptId: 'concept-1',
        sessionId: 'session-100',
        userMessage: 'Can you give me an intuition for Merge Sort?',
        sourceMode: 'document',
        dbName: TEST_DB,
      });

      expect(result.fallbackUsed).toBe(false);
      expect(result.expression).toBe('explaining');
      expect(result.grounded).toBe(true);
      expect(result.followUpQuestion).toContain('auxiliary space');

      // Verify conversation messages stored in IndexedDB (1 user message, 1 assistant message)
      const messages = await db.getAllFromIndex('conversationMessages', 'by-session', 'session-100');
      expect(messages).toHaveLength(2);
      const userMsg = messages.find((m) => m.role === 'user');
      const assistantMsg = messages.find((m) => m.role === 'assistant');
      expect(userMsg).toBeDefined();
      expect(userMsg?.content).toContain('intuition for Merge Sort');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.expressionState).toBe('explaining');
    });

    it('uses honest deterministic fallback with stored canonical explanation when AI fails', async () => {
      const db = await openDatabase(TEST_DB);

      const concept = {
        id: 'concept-fallback',
        title: 'Quick Sort',
        summary: 'Partition-based sorting.',
        canonicalExplanation: 'Picks a pivot and partitions elements into lesser and greater subarrays.',
        keyTerms: ['Pivot', 'Partition'],
        sourceChunkIds: [],
        tier: 1,
        status: 'available' as const,
        confidence: 0.9,
        extractionOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('concepts', concept);

      // Simulate network / AI service down
      vi.spyOn(aiClient, 'fetchExplainConcept').mockRejectedValue(
        new Error('AI service unavailable (503)'),
      );

      const result = await teachConcept({
        conceptId: 'concept-fallback',
        sessionId: 'session-fallback',
        sourceMode: 'document',
        dbName: TEST_DB,
      });

      expect(result.fallbackUsed).toBe(true);
      expect(result.expression).toBe('supportive');
      // Verifies honest disclaimer is present (never claim AI generated it when offline)
      expect(result.message).toContain('AI tutor is temporarily unavailable');
      expect(result.message).toContain(concept.canonicalExplanation);

      // Verifies fallback message persisted in conversation messages
      const msgs = await db.getAllFromIndex('conversationMessages', 'by-session', 'session-fallback');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain('AI tutor is temporarily unavailable');
    });

    it('creates or reuses a topic-based concept without document', async () => {
      const concept1 = await getOrCreateTopicConcept('Neural Networks', TEST_DB);
      expect(concept1.title).toBe('Neural Networks');
      expect(concept1.sourceChunkIds).toEqual([]);

      // Second call returns existing record
      const concept2 = await getOrCreateTopicConcept('neural networks', TEST_DB);
      expect(concept2.id).toBe(concept1.id);
    });
  });
});
