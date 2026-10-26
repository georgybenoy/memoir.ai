import { test, expect } from '@playwright/test';

/**
 * Opt-In Live Google Gemini AI Integration Smoke Test
 *
 * NOTE: This test interacts with the live Google Gemini API over the network.
 * It is billable and skipped by default.
 * To execute:
 *   $env:RUN_LIVE_GEMINI="true"
 *   $env:GEMINI_API_KEY="<your-real-key>"
 *   npx playwright test tests/e2e/live-gemini-smoke.spec.ts
 */
const shouldRunLive =
  process.env.RUN_LIVE_GEMINI === 'true' && Boolean(process.env.GEMINI_API_KEY);

test.describe('Opt-In Live Gemini Smoke Test (Network & API Key Required)', () => {
  test.skip(
    !shouldRunLive,
    'Skipped by default: Requires RUN_LIVE_GEMINI=true and a valid GEMINI_API_KEY in the server environment.'
  );

  test('live health check returns AI configured and ready', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.aiConfigured).toBe(true);
    expect(data.defaultModel).toBeTruthy();
  });

  test('live extract-concepts extracts structured concepts with citations from real text', async ({
    request,
  }) => {
    const payload = {
      text: 'A process is an isolated instance of an executing program with private memory. Threads are lightweight execution units within a process sharing memory.',
      chunks: [
        {
          id: 'chunk-live-1',
          text: 'A process is an isolated instance of an executing program with private memory. Threads are lightweight execution units within a process sharing memory.',
          order: 0,
        },
      ],
      model: 'gemini-3.8-flash',
    };

    const res = await request.post('/api/ai/extract-concepts', { data: payload });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.concepts)).toBe(true);
    expect(data.concepts.length).toBeGreaterThanOrEqual(1);
    expect(data.concepts[0].title).toBeTruthy();
    expect(data.concepts[0].canonicalExplanation).toBeTruthy();
    expect(data.grounded).toBe(true);
  });

  test('live generate-question produces a grounded Socratic recall question', async ({
    request,
  }) => {
    const payload = {
      concept: {
        title: 'Process vs Thread',
        canonicalExplanation:
          'Processes own isolated virtual address spaces; threads share the process address space.',
        keyTerms: ['Process', 'Thread', 'Address Space'],
      },
      sourceChunks: [
        {
          id: 'chunk-live-1',
          text: 'Processes own isolated virtual address spaces; threads share the process address space.',
        },
      ],
      style: 'comparison',
      difficulty: 3,
    };

    const res = await request.post('/api/ai/generate-question', { data: payload });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.question).toBeTruthy();
    expect(data.question.prompt).toBeTruthy();
    expect(Array.isArray(data.question.sourceChunkIds)).toBe(true);
    expect(data.grounded).toBe(true);
  });
});
