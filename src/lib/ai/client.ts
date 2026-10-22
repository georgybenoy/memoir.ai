import {
  type ExtractConceptsRequest,
  type ExtractConceptsResponse,
  type ExplainConceptRequest,
  type ExplainConceptResponse,
  type GenerateQuestionRequest,
  type GenerateQuestionResponse,
  type EvaluateAnswerRequest,
  type EvaluateAnswerResponse,
  type HealthResponse,
} from './schemas';
import { type AiErrorResponse } from './types';

export class AiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiClientError';
  }
}

/**
 * Utility to guard against out-of-order or stale asynchronous AI responses.
 */
export class StaleRequestGuard {
  private currentToken = 0;

  /** Starts a new request scope, immediately invalidating any prior requests */
  start(): number {
    this.currentToken++;
    return this.currentToken;
  }

  /** Checks if the given token is still the most current active request */
  isCurrent(token: number): boolean {
    return token === this.currentToken;
  }

  /** Invalidate all pending scopes */
  invalidate(): void {
    this.currentToken++;
  }
}

export interface AiClientOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_CLIENT_TIMEOUT_MS = 60000;

/**
 * Low-level typed fetch wrapper for AI API routes.
 * Strictly NO automatic client retries to prevent unexpected API costs.
 */
async function aiFetch<T>(
  endpoint: string,
  body: unknown,
  options: AiClientOptions = {},
): Promise<T> {
  const { signal, timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`AI request timed out after ${timeoutMs / 1000}s`));
  }, timeoutMs);

  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorPayload: AiErrorResponse | null = null;
      try {
        errorPayload = (await res.json()) as AiErrorResponse;
      } catch {
        // Non-JSON response
      }

      if (errorPayload && errorPayload.error) {
        throw new AiClientError(
          errorPayload.error.message,
          errorPayload.error.code,
          res.status,
          errorPayload.error.retryable,
          errorPayload.error.retryAfterMs,
        );
      }

      throw new AiClientError(
        `AI service returned HTTP ${res.status}: ${res.statusText}`,
        'AI_UNAVAILABLE',
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof AiClientError) {
      throw err;
    }

    if (signal?.aborted) {
      throw new AiClientError('Request was cancelled.', 'CANCELLED', 0, false);
    }

    if (controller.signal.aborted) {
      throw new AiClientError(
        `AI request timed out after ${timeoutMs / 1000}s.`,
        'AI_TIMEOUT',
        504,
        true,
      );
    }

    throw new AiClientError(
      err instanceof Error ? err.message : String(err),
      'NETWORK_ERROR',
      0,
      true,
    );
  }
}

/**
 * Call POST /api/ai/extract-concepts
 */
export async function fetchExtractConcepts(
  request: ExtractConceptsRequest,
  options?: AiClientOptions,
): Promise<ExtractConceptsResponse> {
  return aiFetch<ExtractConceptsResponse>('/api/ai/extract-concepts', request, options);
}

/**
 * Call POST /api/ai/explain-concept
 */
export async function fetchExplainConcept(
  request: ExplainConceptRequest,
  options?: AiClientOptions,
): Promise<ExplainConceptResponse> {
  return aiFetch<ExplainConceptResponse>('/api/ai/explain-concept', request, options);
}

/**
 * Call POST /api/ai/generate-question
 */
export async function fetchGenerateQuestion(
  request: GenerateQuestionRequest,
  options?: AiClientOptions,
): Promise<GenerateQuestionResponse> {
  return aiFetch<GenerateQuestionResponse>('/api/ai/generate-question', request, options);
}

/**
 * Call POST /api/ai/evaluate-answer
 */
export async function fetchEvaluateAnswer(
  request: EvaluateAnswerRequest,
  options?: AiClientOptions,
): Promise<EvaluateAnswerResponse> {
  return aiFetch<EvaluateAnswerResponse>('/api/ai/evaluate-answer', request, options);
}

/**
 * Call GET /api/health
 */
export async function fetchAiHealth(options?: AiClientOptions): Promise<HealthResponse> {
  const { signal, timeoutMs = 10000 } = options || {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const res = await fetch('/api/health', { signal: combinedSignal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`Health check returned ${res.status}`);
    }
    return (await res.json()) as HealthResponse;
  } catch {
    clearTimeout(timeoutId);
    return {
      status: 'ok',
      aiConfigured: false,
      defaultModel: 'unknown',
      allowedModels: [],
    };
  }
}
