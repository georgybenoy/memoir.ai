import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { type ZodSchema } from 'zod';
import { getDefaultModel, type AllowedModelId } from '@/lib/config/models';
import { AiGatewayError } from './types';

// Hard per-request timeout for Gemini API calls (compatible with Vercel serverless)
export const DEFAULT_AI_TIMEOUT_MS = 45000;
export const MAX_TRANSIENT_RETRIES = 2;
export const BASE_BACKOFF_MS = process.env.NODE_ENV === 'test' ? 10 : 1000;

let _geminiClient: GoogleGenAI | null = null;

/**
 * Returns singleton GoogleGenAI client initialized from process.env.GEMINI_API_KEY.
 * Produces AI_NOT_CONFIGURED if API key is missing, without leaking details.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new AiGatewayError(
      'Gemini API key is not configured on this server.',
      'AI_NOT_CONFIGURED',
      false,
    );
  }

  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({ apiKey });
  }

  return _geminiClient;
}

/** Check if Gemini API is configured in the environment */
export function isAiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/** For tests: override or reset singleton client */
export function _setGeminiClient(client: GoogleGenAI | null): void {
  _geminiClient = client;
}

/**
 * Map unknown errors or Google SDK errors to typed AiGatewayError.
 */
export function mapGeminiError(err: unknown): AiGatewayError {
  if (err instanceof AiGatewayError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number; statusCode?: number })?.status ||
    (err as { status?: number; statusCode?: number })?.statusCode;

  // Extract Retry-After if present in error headers
  let retryAfterMs: number | undefined;
  const headers = (err as { response?: { headers?: Headers | Record<string, string> } })?.response?.headers;
  if (headers) {
    const retryHeader = typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : (headers as Record<string, string>)['retry-after'];
    if (retryHeader) {
      const parsedSeconds = parseInt(retryHeader, 10);
      if (!isNaN(parsedSeconds)) {
        retryAfterMs = parsedSeconds * 1000;
      }
    }
  }

  // 1. Timeouts / Aborts (check first so timeout messages with numbers like 45000ms don't trigger status code matches)
  if (
    message.toLowerCase().includes('timeout') ||
    message.toLowerCase().includes('aborted') ||
    message.toLowerCase().includes('deadline')
  ) {
    return new AiGatewayError(
      'Gemini AI request timed out.',
      'AI_TIMEOUT',
      true,
      undefined,
      err,
    );
  }

  // 2. Rate Limiting (429 / RESOURCE_EXHAUSTED)
  if (
    status === 429 ||
    /\b429\b/.test(message) ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('quota')
  ) {
    return new AiGatewayError(
      'Gemini API rate limit exceeded. Please try again shortly.',
      'AI_RATE_LIMITED',
      true,
      retryAfterMs ?? (process.env.NODE_ENV === 'test' ? 10 : 15000),
      err,
    );
  }

  // 3. Service Unavailable / Transient Server Errors (500, 503, UNAVAILABLE)
  if (
    status === 503 ||
    status === 500 ||
    /\b(500|503)\b/.test(message) ||
    message.includes('UNAVAILABLE') ||
    message.toLowerCase().includes('service unavailable')
  ) {
    return new AiGatewayError(
      'Gemini AI service is temporarily unavailable. Please retry.',
      'AI_UNAVAILABLE',
      true,
      retryAfterMs,
      err,
    );
  }

  // Missing or Invalid API Key (401 / 403)
  if (
    status === 401 ||
    status === 403 ||
    message.toLowerCase().includes('api key') ||
    message.toLowerCase().includes('permission_denied')
  ) {
    return new AiGatewayError(
      'Gemini API authentication failed. Verify server configuration.',
      'AI_NOT_CONFIGURED',
      false,
      undefined,
      err,
    );
  }

  return new AiGatewayError(
    `AI operation failed: ${message}`,
    'INTERNAL',
    false,
    undefined,
    err,
  );
}

/**
 * Executes a function with bounded exponential backoff and jitter for transient errors.
 */
async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new AiGatewayError('Operation cancelled by client.', 'AI_TIMEOUT');
    }

    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      const mapped = mapGeminiError(err);

      // Do NOT retry non-retryable errors (e.g. 400, validation, 401, max retries reached)
      if (!mapped.retryable || attempt === MAX_TRANSIENT_RETRIES) {
        throw mapped;
      }

      // Compute backoff with jitter
      let backoffMs = mapped.retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      backoffMs = Math.min(10000, backoffMs + jitter);

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw mapGeminiError(lastError);
}

export interface GenerateStructuredParams<T> {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: ZodSchema<T>;
  maxOutputTokens?: number;
  model?: AllowedModelId;
  signal?: AbortSignal;
}

/**
 * Generates schema-validated JSON from Gemini with automatic repair retry on malformed outputs.
 */
export async function generateStructured<T>(
  params: GenerateStructuredParams<T>,
): Promise<T> {
  const {
    system,
    user,
    jsonSchema,
    zodSchema,
    maxOutputTokens = 4096,
    model = getDefaultModel(),
    signal,
  } = params;

  const client = getGeminiClient();

  // Helper to invoke Gemini with timeout and signal
  const callModel = async (promptContent: string): Promise<string> => {
    return withRetry(async () => {
      const response = await client.models.generateContent({
        model,
        contents: promptContent,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseSchema: jsonSchema as unknown as Record<string, unknown>,
          maxOutputTokens,
          temperature: 0.2,
          abortSignal: signal,
        },
      });

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new AiGatewayError(
          'Model returned an empty response.',
          'AI_MALFORMED_RESPONSE',
          true,
        );
      }
      return text;
    }, signal);
  };

  // 1. First generation attempt
  const rawOutput = await callModel(user);

  // Parse and validate with Zod
  let firstParseError: string | null = null;
  try {
    const json = JSON.parse(rawOutput);
    const parsed = zodSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
    firstParseError = parsed.error.message;
  } catch (err) {
    firstParseError = err instanceof Error ? err.message : String(err);
  }

  // 2. Exactly ONE repair attempt
  const repairPrompt = `
${user}

ATTENTION: Your previous response failed schema validation.
Validation error: ${firstParseError}

Please output ONLY a valid, corrected JSON object satisfying the required schema exactly.
`.trim();

  const repairedOutput = await callModel(repairPrompt);

  try {
    const repairedJson = JSON.parse(repairedOutput);
    const repairedParsed = zodSchema.safeParse(repairedJson);
    if (repairedParsed.success) {
      return repairedParsed.data;
    }
    throw new AiGatewayError(
      `Model output failed validation after repair: ${repairedParsed.error.message}`,
      'AI_MALFORMED_RESPONSE',
    );
  } catch (err) {
    if (err instanceof AiGatewayError) throw err;
    throw new AiGatewayError(
      `Model returned unparseable JSON after repair: ${err instanceof Error ? err.message : String(err)}`,
      'AI_MALFORMED_RESPONSE',
    );
  }
}

export interface GenerateTextParams {
  system: string;
  user: string;
  maxOutputTokens?: number;
  model?: AllowedModelId;
  signal?: AbortSignal;
}

/**
 * Generates plain or markdown text from Gemini with transient error retries.
 */
export async function generateText(params: GenerateTextParams): Promise<{ text: string }> {
  const {
    system,
    user,
    maxOutputTokens = 2048,
    model = getDefaultModel(),
    signal,
  } = params;

  const client = getGeminiClient();

  const text = await withRetry(async () => {
    const response = await client.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        maxOutputTokens,
        temperature: 0.7,
        abortSignal: signal,
      },
    });

    const outputText = response.text;
    if (!outputText || outputText.trim().length === 0) {
      throw new AiGatewayError(
        'Model returned an empty response.',
        'AI_MALFORMED_RESPONSE',
        true,
      );
    }
    return outputText;
  }, signal);

  return { text };
}
