import 'server-only';

import { z } from 'zod';

/**
 * Server-only environment variable validation.
 * GEMINI_API_KEY is optional at build/startup but required at call time.
 * This module must never be imported from client code.
 */

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${result.error.format()._errors.join('\n')}`);
  }

  return result.data;
}

/** Validated server-only environment. */
export const env = parseEnv();

/**
 * Asserts the API key is present. Call this at request time,
 * not at module initialization, so builds succeed without the key.
 */
export function requireApiKey(): string {
  const key = env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in environment variables.');
  }
  return key;
}
