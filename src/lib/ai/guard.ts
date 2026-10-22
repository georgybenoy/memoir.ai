import 'server-only';
import { createHash } from 'node:crypto';
import { type ZodSchema } from 'zod';
import { nowEpochMs, nowIso } from '@/lib/utils/clock';
import { isModelAllowed, getDefaultModel, type AllowedModelId } from '@/lib/config/models';
import {
  type AiErrorCode,
  createAiErrorResponse,
  getHttpStatusForAiError,
  AiGatewayError,
} from './types';

export const MAX_BODY_BYTES = 512 * 1024; // 512 KiB default
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const MAX_REQUESTS_PER_WINDOW = 25;
export const MAX_GLOBAL_REQUESTS_PER_WINDOW = 200;
export const MAX_CONCURRENT_REQUESTS = 8;

interface RateLimitBucket {
  timestamps: number[];
}

// In-memory sliding window rate limiter: best-effort only, resets across serverless instances
const ipBuckets = new Map<string, RateLimitBucket>();
let globalTimestamps: number[] = [];
let activeConcurrency = 0;

/** For testing: reset rate limiter state */
export function _resetRateLimiter(): void {
  ipBuckets.clear();
  globalTimestamps = [];
  activeConcurrency = 0;
}

export interface SafeLogEntry {
  route: string;
  method: string;
  status: number;
  durationMs: number;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  model?: string;
  errorCode?: string;
  hashedIp?: string;
}

/**
 * Safe logging helper:
 * Records ONLY route, error code, status, duration, and sizes.
 * Strictly NEVER logs request/response bodies, notes, student answers, keys, or raw IPs.
 */
export function safeLog(entry: SafeLogEntry): void {
  const sanitized = {
    timestamp: nowIso(),
    route: entry.route,
    method: entry.method,
    status: entry.status,
    durationMs: Math.round(entry.durationMs),
    requestSizeBytes: entry.requestSizeBytes,
    responseSizeBytes: entry.responseSizeBytes,
    model: entry.model,
    errorCode: entry.errorCode,
    hashedIp: entry.hashedIp ? `${entry.hashedIp.slice(0, 10)}...` : undefined,
  };
  console.log(`[AI-GATEWAY] ${JSON.stringify(sanitized)}`);
}

/**
 * Extracts and SHA-256 hashes the client IP from standard proxy headers.
 * Raw IPs are NEVER logged or persisted.
 */
export function getHashedClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  let rawIp = '127.0.0.1';
  if (forwarded) {
    rawIp = forwarded.split(',')[0].trim();
  } else {
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
      rawIp = realIp.trim();
    }
  }
  return createHash('sha256').update(rawIp).digest('hex');
}

/**
 * Checks in-memory sliding-window rate limit for a hashed IP and global instance cap.
 */
export function checkRateLimit(
  hashedIp: string,
  currentTimeMs: number = nowEpochMs(),
): { allowed: boolean; retryAfterMs?: number; reason?: string } {
  const cutoff = currentTimeMs - RATE_LIMIT_WINDOW_MS;

  // 1. Check global instance cap across all IPs
  globalTimestamps = globalTimestamps.filter((t) => t > cutoff);
  if (globalTimestamps.length >= MAX_GLOBAL_REQUESTS_PER_WINDOW) {
    const oldestGlobal = globalTimestamps[0];
    const retryAfterMs = Math.max(1000, oldestGlobal + RATE_LIMIT_WINDOW_MS - currentTimeMs);
    return { allowed: false, retryAfterMs, reason: 'global_cap' };
  }

  // 2. Check per-IP sliding window
  const bucket = ipBuckets.get(hashedIp) || { timestamps: [] };
  const recent = bucket.timestamps.filter((t) => t > cutoff);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = recent[0];
    const retryAfterMs = Math.max(1000, oldest + RATE_LIMIT_WINDOW_MS - currentTimeMs);
    return { allowed: false, retryAfterMs, reason: 'per_ip_limit' };
  }

  recent.push(currentTimeMs);
  globalTimestamps.push(currentTimeMs);
  ipBuckets.set(hashedIp, { timestamps: recent });
  return { allowed: true };
}

export function tryAcquireConcurrency(): boolean {
  if (activeConcurrency >= MAX_CONCURRENT_REQUESTS) {
    return false;
  }
  activeConcurrency++;
  return true;
}

export function releaseConcurrency(): void {
  activeConcurrency = Math.max(0, activeConcurrency - 1);
}

export interface GuardedContext<T> {
  data: T;
  model: AllowedModelId;
  hashedIp: string;
}

/**
 * Higher-order request handler wrapper that enforces size limits,
 * rate limiting, concurrency caps, Zod schema validation, and model validation.
 */
export async function withAiGuard<T extends { model?: string }>(
  req: Request,
  route: string,
  schema: ZodSchema<T>,
  handler: (ctx: GuardedContext<T>) => Promise<Response>,
  options?: { maxBodyBytes?: number },
): Promise<Response> {
  const startTime = nowEpochMs();
  const hashedIp = getHashedClientIp(req);
  const effectiveMaxBytes = options?.maxBodyBytes ?? MAX_BODY_BYTES;
  let requestBytes = 0;
  let selectedModel = getDefaultModel();

  // 1. Content-Length check before reading body
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(declaredLength) && declaredLength > effectiveMaxBytes) {
      safeLog({
        route,
        method: req.method,
        status: 413,
        durationMs: nowEpochMs() - startTime,
        errorCode: 'PAYLOAD_TOO_LARGE',
        hashedIp,
      });
      return createAiErrorResponse(
        'PAYLOAD_TOO_LARGE',
        `Request body exceeds maximum size of ${effectiveMaxBytes / 1024} KiB.`,
      );
    }
  }

  // 2. Concurrency / burst protection
  if (!tryAcquireConcurrency()) {
    safeLog({
      route,
      method: req.method,
      status: 429,
      durationMs: nowEpochMs() - startTime,
      errorCode: 'RATE_LIMITED_LOCAL',
      hashedIp,
    });
    return createAiErrorResponse(
      'RATE_LIMITED_LOCAL',
      'Server is experiencing high AI concurrency. Please retry shortly.',
      true,
      2000,
    );
  }

  try {
    // 3. Rate limiting check (per-IP and global instance cap)
    const rateCheck = checkRateLimit(hashedIp);
    if (!rateCheck.allowed) {
      safeLog({
        route,
        method: req.method,
        status: 429,
        durationMs: nowEpochMs() - startTime,
        errorCode: 'RATE_LIMITED_LOCAL',
        hashedIp,
      });
      const message =
        rateCheck.reason === 'global_cap'
          ? 'Server instance rate capacity reached. Please retry shortly.'
          : 'Too many AI requests from this client. Please slow down.';
      return createAiErrorResponse(
        'RATE_LIMITED_LOCAL',
        message,
        true,
        rateCheck.retryAfterMs ?? 30000,
      );
    }

    // 4. Read body stream with byte size tracking
    const rawBuffer = await req.arrayBuffer();
    requestBytes = rawBuffer.byteLength;

    if (requestBytes > effectiveMaxBytes) {
      safeLog({
        route,
        method: req.method,
        status: 413,
        durationMs: nowEpochMs() - startTime,
        requestSizeBytes: requestBytes,
        errorCode: 'PAYLOAD_TOO_LARGE',
        hashedIp,
      });
      return createAiErrorResponse(
        'PAYLOAD_TOO_LARGE',
        `Request payload size (${Math.round(requestBytes / 1024)} KiB) exceeds limit of ${effectiveMaxBytes / 1024} KiB.`,
      );
    }

    // 5. Parse JSON
    let parsedJson: unknown;
    try {
      const text = new TextDecoder().decode(rawBuffer);
      parsedJson = JSON.parse(text);
    } catch {
      safeLog({
        route,
        method: req.method,
        status: 400,
        durationMs: nowEpochMs() - startTime,
        requestSizeBytes: requestBytes,
        errorCode: 'INVALID_REQUEST',
        hashedIp,
      });
      return createAiErrorResponse('INVALID_REQUEST', 'Invalid JSON in request body.');
    }

    // 6. Validate with Zod schema
    const parseResult = schema.safeParse(parsedJson);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors
        .map((e) => `${e.path.join('.') || 'body'}: ${e.message}`)
        .join('; ');

      safeLog({
        route,
        method: req.method,
        status: 400,
        durationMs: nowEpochMs() - startTime,
        requestSizeBytes: requestBytes,
        errorCode: 'INVALID_REQUEST',
        hashedIp,
      });
      return createAiErrorResponse('INVALID_REQUEST', `Validation failed: ${errorMsg}`);
    }

    const data = parseResult.data;

    // 7. Validate model against allowlist if specified
    if (data.model) {
      if (!isModelAllowed(data.model)) {
        safeLog({
          route,
          method: req.method,
          status: 400,
          durationMs: nowEpochMs() - startTime,
          requestSizeBytes: requestBytes,
          errorCode: 'MODEL_NOT_ALLOWED',
          hashedIp,
        });
        return createAiErrorResponse(
          'MODEL_NOT_ALLOWED',
          `Model "${data.model}" is not on the allowed models list.`,
        );
      }
      selectedModel = data.model;
    }

    // 8. Execute actual route handler
    const response = await handler({ data, model: selectedModel, hashedIp });

    safeLog({
      route,
      method: req.method,
      status: response.status,
      durationMs: nowEpochMs() - startTime,
      requestSizeBytes: requestBytes,
      model: selectedModel,
      hashedIp,
    });

    return response;
  } catch (err) {
    const code: AiErrorCode = err instanceof AiGatewayError ? err.code : 'INTERNAL';
    const message = err instanceof Error ? err.message : 'Internal error processing AI request';
    const retryable = err instanceof AiGatewayError ? err.retryable : false;
    const retryAfter = err instanceof AiGatewayError ? err.retryAfterMs : undefined;

    const status = getHttpStatusForAiError(code);
    safeLog({
      route,
      method: req.method,
      status,
      durationMs: nowEpochMs() - startTime,
      requestSizeBytes: requestBytes,
      errorCode: code,
      model: selectedModel,
      hashedIp,
    });

    return createAiErrorResponse(code, message, retryable, retryAfter);
  } finally {
    releaseConcurrency();
  }
}
