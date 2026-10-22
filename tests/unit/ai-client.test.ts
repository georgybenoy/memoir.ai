import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchExtractConcepts,
  fetchExplainConcept,
  fetchAiHealth,
  AiClientError,
  StaleRequestGuard,
} from '@/lib/ai/client';

describe('AI Client Library (src/lib/ai/client.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('StaleRequestGuard', () => {
    it('invalidates older tokens when start() or invalidate() is called', () => {
      const guard = new StaleRequestGuard();
      const token1 = guard.start();
      expect(guard.isCurrent(token1)).toBe(true);

      const token2 = guard.start();
      expect(guard.isCurrent(token1)).toBe(false);
      expect(guard.isCurrent(token2)).toBe(true);

      guard.invalidate();
      expect(guard.isCurrent(token2)).toBe(false);
    });
  });

  describe('fetchExtractConcepts & Error Mapping', () => {
    it('returns typed response on success and does NOT perform automatic retries', async () => {
      const mockSuccessData = {
        concepts: [
          {
            tempId: 't1',
            title: 'Concept A',
            summary: 'Summary A',
            canonicalExplanation: 'Canonical A',
            keyTerms: ['TermA'],
            sourceChunkIds: ['c1'],
            confidence: 0.9,
            prerequisiteTitles: [],
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockSuccessData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      global.fetch = fetchMock;

      const result = await fetchExtractConcepts({
        chunks: [{ id: 'c1', text: 'Text for c1' }],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].title).toBe('Concept A');
    });

    it('maps typed 429 response into AiClientError with retryable=true and retryAfterMs', async () => {
      const errorPayload = {
        error: {
          code: 'AI_RATE_LIMITED',
          message: 'Rate limit exceeded.',
          retryable: true,
          retryAfterMs: 15000,
        },
      };

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(errorPayload), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
      global.fetch = fetchMock;

      await expect(
        fetchExtractConcepts({ chunks: [{ id: 'c1', text: 'Text' }] }),
      ).rejects.toThrow(AiClientError);

      // Verify called exactly once: NO automatic hidden repeated retries on client
      expect(fetchMock).toHaveBeenCalledTimes(1);

      try {
        await fetchExtractConcepts({ chunks: [{ id: 'c1', text: 'Text' }] });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AiClientError);
        const clientErr = err as AiClientError;
        expect(clientErr.code).toBe('AI_RATE_LIMITED');
        expect(clientErr.status).toBe(429);
        expect(clientErr.retryable).toBe(true);
        expect(clientErr.retryAfterMs).toBe(15000);
      }
    });

    it('maps client-side cancellation signal into CANCELLED code', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetchExtractConcepts(
          { chunks: [{ id: 'c1', text: 'Text' }] },
          { signal: controller.signal },
        ),
      ).rejects.toThrow(AiClientError);

      try {
        await fetchExtractConcepts(
          { chunks: [{ id: 'c1', text: 'Text' }] },
          { signal: controller.signal },
        );
      } catch (err: unknown) {
        const clientErr = err as AiClientError;
        expect(clientErr.code).toBe('CANCELLED');
        expect(clientErr.retryable).toBe(false);
      }
    });
  });

  describe('fetchExplainConcept', () => {
    it('sends explain concept request and parses response', async () => {
      const mockExplainResponse = {
        message: 'Explanation text in markdown',
        expression: 'explaining',
        grounded: true,
        citedChunkIds: ['c1'],
        followUpQuestion: 'Can you give an example?',
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockExplainResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      global.fetch = fetchMock;

      const result = await fetchExplainConcept({
        concept: { title: 'Trees', summary: 'Hierarchical structure' },
        sourceChunks: [{ id: 'c1', text: 'Tree nodes and edges' }],
        sourceMode: 'document',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.expression).toBe('explaining');
      expect(result.grounded).toBe(true);
    });
  });

  describe('fetchAiHealth', () => {
    it('returns health status and handles network failure gracefully', async () => {
      // 1. Success case
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            aiConfigured: true,
            defaultModel: 'gemini-3.8-flash',
            allowedModels: ['gemini-3.8-flash'],
          }),
          { status: 200 },
        ),
      );

      const health = await fetchAiHealth();
      expect(health.aiConfigured).toBe(true);

      // 2. Failure case
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection refused'));
      const fallback = await fetchAiHealth();
      expect(fallback.aiConfigured).toBe(false);
    });
  });
});
