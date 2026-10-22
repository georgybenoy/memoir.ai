
export type AiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_MALFORMED_RESPONSE'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'MODEL_NOT_ALLOWED'
  | 'RATE_LIMITED_LOCAL'
  | 'INTERNAL';

export interface AiErrorPayload {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface AiErrorResponse {
  error: AiErrorPayload;
}

export class AiGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: AiErrorCode,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'AiGatewayError';
  }
}

/**
 * Maps stable AI error codes to standard HTTP status codes.
 */
export function getHttpStatusForAiError(code: AiErrorCode): number {
  switch (code) {
    case 'INVALID_REQUEST':
    case 'MODEL_NOT_ALLOWED':
      return 400;
    case 'PAYLOAD_TOO_LARGE':
      return 413;
    case 'RATE_LIMITED_LOCAL':
    case 'AI_RATE_LIMITED':
      return 429;
    case 'AI_MALFORMED_RESPONSE':
      return 502;
    case 'AI_NOT_CONFIGURED':
    case 'AI_UNAVAILABLE':
      return 503;
    case 'AI_TIMEOUT':
      return 504;
    case 'INTERNAL':
    default:
      return 500;
  }
}

/**
 * Constructs a JSON NextResponse conforming to the standard EduMentor AI error contract.
 */
export function createAiErrorResponse(
  code: AiErrorCode,
  message: string,
  retryable = false,
  retryAfterMs?: number,
): Response {
  const status = getHttpStatusForAiError(code);
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
  }

  const payload: AiErrorResponse = {
    error: {
      code,
      message,
      retryable,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    },
  };

  return new Response(JSON.stringify(payload), { status, headers });
}
