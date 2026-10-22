import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as generateQuestionHandler } from '@/app/api/ai/generate-question/route';
import { _setGeminiClient } from '@/lib/ai/gemini';
import { _resetRateLimiter } from '@/lib/ai/guard';

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
    },
  })),
}));

describe('POST /api/ai/generate-question Route (generate-question-route.test.ts)', () => {
  const originalEnv = process.env.GEMINI_API_KEY;
  const SECRET_KEY_VALUE = 'secret-test-key-AIzaSyFakeKey987654321';

  beforeEach(() => {
    _resetRateLimiter();
    _setGeminiClient(null);
    process.env.GEMINI_API_KEY = SECRET_KEY_VALUE;
  });

  afterEach(() => {
    _resetRateLimiter();
    _setGeminiClient(null);
    process.env.GEMINI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  const validPayload = {
    concept: {
      id: 'concept-1',
      title: 'Mitochondrial ATP Synthesis',
      summary: 'ATP synthesis via oxidative phosphorylation across the inner membrane.',
      canonicalExplanation: 'Cristae provide surface area for ATP synthase complexes.',
      keyTerms: ['cristae', 'ATP synthase', 'matrix'],
    },
    sourceChunks: [
      {
        id: 'chunk-1',
        text: 'The inner mitochondrial membrane is folded into cristae to expand surface area for ATP synthase.',
      },
      {
        id: 'chunk-2',
        text: 'Proton gradients drive the rotation of the ATP synthase rotor.',
      },
    ],
    difficultyLevel: 3,
    preferredStyle: 'explanation',
  };

  it('returns 503 AI_NOT_CONFIGURED when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    _setGeminiClient(null);

    const req = new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await generateQuestionHandler(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('returns 400 INVALID_REQUEST when request body is empty or malformed', async () => {
    const req = new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficultyLevel: 99 }), // missing concept and sourceChunks
    });

    const res = await generateQuestionHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 MODEL_NOT_ALLOWED when an unauthorized model name is requested', async () => {
    const req = new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, model: 'gpt-4o-dangerous' }),
    });

    const res = await generateQuestionHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('MODEL_NOT_ALLOWED');
  });

  it('successfully generates structured question and validates citations subset', async () => {
    const mockStructuredResult = {
      prompt: 'Explain how cristae folding directly facilitates ATP generation.',
      style: 'explanation',
      expectedKeyPoints: [
        'Increases membrane surface area',
        'Accommodates more ATP synthase complexes',
      ],
      sourceChunkIds: ['chunk-1'],
    };

    // Configure mock Gemini client
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockStructuredResult),
    });

    _setGeminiClient({
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as import('@google/genai').GoogleGenAI);

    const req = new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await generateQuestionHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe(mockStructuredResult.prompt);
    expect(body.style).toBe('explanation');
    expect(body.sourceChunkIds).toEqual(['chunk-1']);
    expect(body.expectedKeyPoints.length).toBe(2);
  });

  it('filters out hallucinated sourceChunkIds not in the provided source chunks', async () => {
    const mockWithHallucinatedChunk = {
      prompt: 'Compare the matrix to cristae structure in mitochondria.',
      style: 'comparison',
      expectedKeyPoints: ['Matrix contains enzymes', 'Cristae contain electron chain'],
      // 'chunk-ghost' was NOT in validPayload.sourceChunks!
      sourceChunkIds: ['chunk-1', 'chunk-ghost'],
    };

    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockWithHallucinatedChunk),
    });

    _setGeminiClient({
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as import('@google/genai').GoogleGenAI);

    const req = new Request('http://localhost/api/ai/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const res = await generateQuestionHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceChunkIds).toEqual(['chunk-1']);
    expect(body.sourceChunkIds).not.toContain('chunk-ghost');
  });
});
