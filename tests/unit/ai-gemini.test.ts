import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { type GoogleGenAI } from '@google/genai';
import {
  getGeminiClient,
  isAiConfigured,
  generateStructured,
  generateText,
  mapGeminiError,
  _setGeminiClient,
} from '@/lib/ai/gemini';
import { AiGatewayError } from '@/lib/ai/types';

// Mock @google/genai module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
      },
    })),
  };
});

describe('Gemini AI Gateway (gemini.ts)', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    _setGeminiClient(null);
    process.env.GEMINI_API_KEY = 'test-api-key-12345';
  });

  afterEach(() => {
    _setGeminiClient(null);
    process.env.GEMINI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Configuration & Client Initialization', () => {
    it('throws AI_NOT_CONFIGURED when GEMINI_API_KEY is missing or empty', () => {
      delete process.env.GEMINI_API_KEY;
      _setGeminiClient(null);

      expect(isAiConfigured()).toBe(false);
      expect(() => getGeminiClient()).toThrow(AiGatewayError);
      try {
        getGeminiClient();
      } catch (err: unknown) {
        const gwErr = err as AiGatewayError;
        expect(gwErr.code).toBe('AI_NOT_CONFIGURED');
        expect(gwErr.retryable).toBe(false);
        // Verify no sensitive internal traces leaked in message
        expect(gwErr.message).toBe('Gemini API key is not configured on this server.');
      }
    });

    it('returns client singleton when GEMINI_API_KEY is configured', () => {
      process.env.GEMINI_API_KEY = 'configured-key';
      _setGeminiClient(null);

      expect(isAiConfigured()).toBe(true);
      const client1 = getGeminiClient();
      const client2 = getGeminiClient();
      expect(client1).toBe(client2);
    });
  });

  describe('Error Mapping & Taxonomy (mapGeminiError)', () => {
    it('maps 429 and RESOURCE_EXHAUSTED to AI_RATE_LIMITED and extracts Retry-After header', () => {
      const errorWithHeader = {
        status: 429,
        message: 'RESOURCE_EXHAUSTED: Rate limit exceeded',
        response: {
          headers: new Headers({ 'retry-after': '20' }),
        },
      };

      const mapped = mapGeminiError(errorWithHeader);
      expect(mapped.code).toBe('AI_RATE_LIMITED');
      expect(mapped.retryable).toBe(true);
      expect(mapped.retryAfterMs).toBe(20000);
    });

    it('maps 503 UNAVAILABLE to AI_UNAVAILABLE with retryAfterMs from header', () => {
      const err = {
        status: 503,
        message: 'Service Unavailable',
        response: {
          headers: new Headers({ 'retry-after': '5' }),
        },
      };

      const mapped = mapGeminiError(err);
      expect(mapped.code).toBe('AI_UNAVAILABLE');
      expect(mapped.retryable).toBe(true);
      expect(mapped.retryAfterMs).toBe(5000);
    });

    it('maps timeout and deadline exceeded to AI_TIMEOUT', () => {
      const err = new Error('Deadline exceeded after 45000ms');
      const mapped = mapGeminiError(err);
      expect(mapped.code).toBe('AI_TIMEOUT');
      expect(mapped.retryable).toBe(true);
    });

    it('maps 401 / 403 API key errors to AI_NOT_CONFIGURED', () => {
      const err = {
        status: 401,
        message: 'API key not valid. Please pass a valid API key.',
      };
      const mapped = mapGeminiError(err);
      expect(mapped.code).toBe('AI_NOT_CONFIGURED');
      expect(mapped.retryable).toBe(false);
    });

    it('maps generic unknown errors to INTERNAL with retryable = false', () => {
      const err = new Error('Syntax error or unknown exception');
      const mapped = mapGeminiError(err);
      expect(mapped.code).toBe('INTERNAL');
      expect(mapped.retryable).toBe(false);
    });
  });

  describe('Transient Retry & Backoff Logic', () => {
    it('retries on 503 and succeeds on subsequent attempt', async () => {
      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce({ status: 503, message: 'Transient overload' })
        .mockResolvedValueOnce({ text: 'Hello, resilient student!' });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      const result = await generateText({
        system: 'System prompt',
        user: 'User prompt',
      });

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.text).toBe('Hello, resilient student!');
    });

    it('does NOT retry non-retryable errors like 400 or schema issues', async () => {
      const mockGenerate = vi
        .fn()
        .mockRejectedValue({ status: 400, message: 'INVALID_ARGUMENT: Bad model' });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      await expect(
        generateText({
          system: 'System prompt',
          user: 'User prompt',
        }),
      ).rejects.toThrow(AiGatewayError);

      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateStructured & Repair Loop', () => {
    const TestSchema = z.object({
      conceptTitle: z.string(),
      difficulty: z.number().int().min(1).max(5),
    });

    const TestJsonSchema = {
      type: 'object',
      properties: {
        conceptTitle: { type: 'string' },
        difficulty: { type: 'integer' },
      },
      required: ['conceptTitle', 'difficulty'],
    };

    it('succeeds immediately on valid schema-compliant output', async () => {
      const validPayload = { conceptTitle: 'Binary Search', difficulty: 2 };
      const mockGenerate = vi.fn().mockResolvedValue({
        text: JSON.stringify(validPayload),
      });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      const result = await generateStructured({
        system: 'System instructions',
        user: 'Extract concept',
        jsonSchema: TestJsonSchema,
        zodSchema: TestSchema,
      });

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(validPayload);
    });

    it('performs exactly ONE repair retry when model outputs malformed JSON, and succeeds if repair is valid', async () => {
      const invalidFirstOutput = '{"conceptTitle": "Binary Search", "difficulty": "two"}'; // string instead of number
      const validRepairedOutput = '{"conceptTitle": "Binary Search", "difficulty": 2}';

      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({ text: invalidFirstOutput })
        .mockResolvedValueOnce({ text: validRepairedOutput });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      const result = await generateStructured({
        system: 'System instructions',
        user: 'Extract concept',
        jsonSchema: TestJsonSchema,
        zodSchema: TestSchema,
      });

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      // Check repair prompt contained error message
      const repairCallArgs = mockGenerate.mock.calls[1][0];
      expect(repairCallArgs.contents).toContain('ATTENTION: Your previous response failed schema validation.');
      expect(result).toEqual({ conceptTitle: 'Binary Search', difficulty: 2 });
    });

    it('fails with AI_MALFORMED_RESPONSE after one failed repair attempt', async () => {
      const invalidFirstOutput = 'Not even JSON';
      const invalidRepairedOutput = '{"conceptTitle": "Binary Search"}'; // Missing required 'difficulty'

      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({ text: invalidFirstOutput })
        .mockResolvedValueOnce({ text: invalidRepairedOutput });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      let thrownError: unknown;
      try {
        await generateStructured({
          system: 'System instructions',
          user: 'Extract concept',
          jsonSchema: TestJsonSchema,
          zodSchema: TestSchema,
        });
      } catch (err) {
        thrownError = err;
      }

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(thrownError).toBeInstanceOf(AiGatewayError);
      expect((thrownError as AiGatewayError).code).toBe('AI_MALFORMED_RESPONSE');
    });

    it('throws AI_MALFORMED_RESPONSE if model returns empty response', async () => {
      const mockGenerate = vi.fn().mockResolvedValue({ text: '   ' });

      _setGeminiClient({
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI);

      await expect(
        generateStructured({
          system: 'System instructions',
          user: 'Extract concept',
          jsonSchema: TestJsonSchema,
          zodSchema: TestSchema,
        }),
      ).rejects.toThrow(AiGatewayError);
    });
  });
});
