/**
 * Model configuration and allowlist for EduMentor Gemini Gateway.
 * Source of truth: PRD FR-03, FR-18 and TECH_STACK §7.
 *
 * NOTE: Verify model IDs against current Gemini docs:
 * https://ai.google.dev/gemini-api/docs/models/gemini
 */

export const ALLOWED_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

export type AllowedModelId = (typeof ALLOWED_MODELS)[number];

/**
 * Default Gemini model for study concept extraction and Socratic tutoring.
 * Configured via GEMINI_MODEL env var or defaults to 'gemini-3.8-flash'.
 */
export function getDefaultModel(): AllowedModelId {
  const envModel = process.env.GEMINI_MODEL;
  if (envModel && (ALLOWED_MODELS as readonly string[]).includes(envModel)) {
    return envModel as AllowedModelId;
  }
  return 'gemini-3.8-flash';
}

/**
 * Validates whether a requested model ID is on the explicit security allowlist.
 */
export function isModelAllowed(model: string): model is AllowedModelId {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

/**
 * Model metadata for client display and token budgeting.
 */
export interface ModelInfo {
  id: AllowedModelId;
  displayName: string;
  maxOutputTokens: number;
  recommendedFor: 'fast' | 'balanced' | 'deep';
}

export const MODEL_REGISTRY: Record<AllowedModelId, ModelInfo> = {
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash (Recommended)',
    maxOutputTokens: 8192,
    recommendedFor: 'balanced',
  },
  'gemini-3.8-pro': {
    id: 'gemini-3.8-pro',
    displayName: 'Gemini 3.8 Pro',
    maxOutputTokens: 8192,
    recommendedFor: 'deep',
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    maxOutputTokens: 8192,
    recommendedFor: 'balanced',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    maxOutputTokens: 8192,
    recommendedFor: 'balanced',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    maxOutputTokens: 8192,
    recommendedFor: 'fast',
  },
  'gemini-2.0-flash-lite': {
    id: 'gemini-2.0-flash-lite',
    displayName: 'Gemini 2.0 Flash Lite',
    maxOutputTokens: 8192,
    recommendedFor: 'fast',
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    maxOutputTokens: 8192,
    recommendedFor: 'fast',
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    maxOutputTokens: 8192,
    recommendedFor: 'deep',
  },
};
