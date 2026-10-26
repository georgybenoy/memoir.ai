import { z } from 'zod';
import { AVATAR_EXPRESSIONS } from './prompts';

// ==========================================
// 1. EXTRACT CONCEPTS SCHEMAS
// ==========================================

export const ChunkInputSchema = z.object({
  id: z.string().min(1).max(128),
  text: z.string().min(1).max(12000),
});

export const ExtractConceptsRequestSchema = z.object({
  chunks: z.array(ChunkInputSchema).min(1).max(25),
  model: z.string().optional(),
  options: z
    .object({
      maxConcepts: z.number().int().min(1).max(30).optional(),
      subjectHint: z.string().max(200).optional(),
    })
    .optional(),
});

export type ExtractConceptsRequest = z.infer<typeof ExtractConceptsRequestSchema>;

export const ExtractedConceptSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().min(1).max(150),
  summary: z.string().min(1).max(500),
  canonicalExplanation: z.string().min(1).max(2000),
  keyTerms: z.array(z.string().min(1).max(80)).min(1).max(10),
  sourceChunkIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
  prerequisiteTitles: z.array(z.string().min(1).max(150)),
});

export type ExtractedConceptDto = z.infer<typeof ExtractedConceptSchema>;

export const ExtractConceptsResponseSchema = z.object({
  concepts: z.array(ExtractedConceptSchema),
});

export type ExtractConceptsResponse = z.infer<typeof ExtractConceptsResponseSchema>;

/**
 * Gemini JSON schema for structured output in extract-concepts.
 */
export const EXTRACT_CONCEPTS_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concepts: {
      type: 'ARRAY',
      description: 'List of teachable concepts extracted from the study notes.',
      items: {
        type: 'OBJECT',
        properties: {
          tempId: {
            type: 'STRING',
            description: 'Temporary unique identifier for this concept (e.g. c1, c2).',
          },
          title: {
            type: 'STRING',
            description: 'Specific title of the concept (e.g., "Cellular Respiration").',
          },
          summary: {
            type: 'STRING',
            description: 'Concise 1-2 sentence overview of the concept.',
          },
          canonicalExplanation: {
            type: 'STRING',
            description: 'Core 2-4 sentence explanation of the mechanism or definition.',
          },
          keyTerms: {
            type: 'ARRAY',
            description: '2 to 6 key terms or vocabulary words directly related to this concept.',
            items: { type: 'STRING' },
          },
          sourceChunkIds: {
            type: 'ARRAY',
            description: 'Exact chunk IDs from the input where this concept is substantiated.',
            items: { type: 'STRING' },
          },
          confidence: {
            type: 'NUMBER',
            description: 'Confidence score (0.0 to 1.0) on note completeness for this concept.',
          },
          prerequisiteTitles: {
            type: 'ARRAY',
            description: 'Titles of prerequisite concepts needed to understand this concept.',
            items: { type: 'STRING' },
          },
        },
        required: [
          'tempId',
          'title',
          'summary',
          'canonicalExplanation',
          'keyTerms',
          'sourceChunkIds',
          'confidence',
          'prerequisiteTitles',
        ],
      },
    },
  },
  required: ['concepts'],
};

// ==========================================
// 2. EXPLAIN CONCEPT SCHEMAS
// ==========================================

export const ExplainConceptRequestSchema = z.object({
  concept: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    summary: z.string().min(1),
    canonicalExplanation: z.string().optional(),
    keyTerms: z.array(z.string()).optional(),
  }),
  sourceChunks: z.array(ChunkInputSchema).max(10).default([]),
  prerequisiteSummaries: z
    .array(
      z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
      }),
    )
    .max(10)
    .optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(12)
    .optional(),
  sourceMode: z.enum(['document', 'topic']),
  mode: z.enum(['teach', 'simplify', 'analogy', 'example']).default('teach').optional(),
  focus: z.array(z.string().min(1)).max(10).optional(),
  focusPoints: z.array(z.string().min(1)).max(10).optional(),
  model: z.string().optional(),
});

export type ExplainConceptRequest = z.infer<typeof ExplainConceptRequestSchema>;

export const ExplainConceptResponseSchema = z.object({
  message: z.string().min(1),
  expression: z.enum(AVATAR_EXPRESSIONS),
  grounded: z.boolean(),
  citedChunkIds: z.array(z.string()),
  followUpQuestion: z.string().min(1),
});

export type ExplainConceptResponse = z.infer<typeof ExplainConceptResponseSchema>;

/**
 * Gemini JSON schema for structured output in explain-concept.
 */
export const EXPLAIN_CONCEPT_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: {
      type: 'STRING',
      description: 'Socratic tutoring explanation formatted in clean Markdown.',
    },
    expression: {
      type: 'STRING',
      description: 'One of the 11 avatar expressions.',
      enum: [...AVATAR_EXPRESSIONS],
    },
    grounded: {
      type: 'BOOLEAN',
      description: 'True if based on source chunks, false if in topic mode without source notes.',
    },
    citedChunkIds: {
      type: 'ARRAY',
      description: 'IDs of source chunks cited in the explanation.',
      items: { type: 'STRING' },
    },
    followUpQuestion: {
      type: 'STRING',
      description: 'Guiding Socratic question to test understanding or prompt reflection.',
    },
  },
  required: ['message', 'expression', 'grounded', 'citedChunkIds', 'followUpQuestion'],
};

// ==========================================
// 3. HEALTH API SCHEMA
// ==========================================

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  aiConfigured: z.boolean(),
  defaultModel: z.string(),
  allowedModels: z.array(z.string()),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ==========================================
// 4. GENERATE QUESTION SCHEMAS (PHASE 6)
// ==========================================

export const QUESTION_STYLES = [
  'explanation',
  'comparison',
  'cause_effect',
  'process',
  'application',
  'misconception_diagnosis',
] as const;

export type QuestionStyle = (typeof QUESTION_STYLES)[number];

export const GenerateQuestionRequestSchema = z.object({
  concept: z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(150),
    summary: z.string().min(1).max(500),
    canonicalExplanation: z.string().optional(),
    keyTerms: z.array(z.string()).optional(),
  }),
  sourceChunks: z.array(ChunkInputSchema).min(1).max(10),
  difficultyLevel: z.number().int().min(1).max(5).default(2),
  preferredStyle: z.enum(QUESTION_STYLES).optional(),
  recentQuestionPrompts: z.array(z.string()).max(10).optional(),
  model: z.string().optional(),
});

export type GenerateQuestionRequest = z.infer<typeof GenerateQuestionRequestSchema>;

export const GenerateQuestionResponseSchema = z.object({
  prompt: z.string().min(1),
  style: z.enum(QUESTION_STYLES),
  expectedKeyPoints: z.array(z.string().min(1)).min(1).max(8),
  sourceChunkIds: z.array(z.string().min(1)).min(1),
});

export type GenerateQuestionResponse = z.infer<typeof GenerateQuestionResponseSchema>;

export const GENERATE_QUESTION_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    prompt: {
      type: 'STRING',
      description: 'The active recall question for the student to answer in their own words.',
    },
    style: {
      type: 'STRING',
      description: 'The pedagogical style of the question.',
      enum: [...QUESTION_STYLES],
    },
    expectedKeyPoints: {
      type: 'ARRAY',
      description: 'Key concepts, facts, or reasoning elements expected in a complete, high-quality answer.',
      items: { type: 'STRING' },
    },
    sourceChunkIds: {
      type: 'ARRAY',
      description: 'Chunk IDs from the input that substantiate this question and its expected answer.',
      items: { type: 'STRING' },
    },
  },
  required: ['prompt', 'style', 'expectedKeyPoints', 'sourceChunkIds'],
};

// ==========================================
// 5. EVALUATE ANSWER SCHEMAS (PHASE 7)
// ==========================================

export const MisconceptionSeveritySchema = z.enum(['minor', 'moderate', 'critical']);
export type MisconceptionSeverity = z.infer<typeof MisconceptionSeveritySchema>;

export const EvaluatedMisconceptionSchema = z.object({
  description: z.string().min(1),
  severity: MisconceptionSeveritySchema,
  correction: z.string().min(1),
});
export type EvaluatedMisconception = z.infer<typeof EvaluatedMisconceptionSchema>;

export const EvaluateAnswerRequestSchema = z.object({
  question: z.object({
    id: z.string().optional(),
    prompt: z.string().min(1).max(1000),
    questionStyle: z.string().optional(),
  }),
  expectedKeyPoints: z.array(z.string().min(1)).min(1).max(10),
  sourceChunks: z.array(ChunkInputSchema).max(10).default([]),
  studentAnswer: z.string().min(1).max(5000),
  confidence: z.number().int().min(1).max(3),
  concept: z.object({
    id: z.string().optional(),
    title: z.string().min(1).max(150),
    summary: z.string().min(1).max(500),
    canonicalExplanation: z.string().optional(),
  }),
  model: z.string().optional(),
});
export type EvaluateAnswerRequest = z.infer<typeof EvaluateAnswerRequestSchema>;

export const EvaluateAnswerResponseSchema = z.object({
  correctness: z.number().int().min(0).max(100),
  completeness: z.number().int().min(0).max(100),
  terminology: z.number().int().min(0).max(100),
  reasoning: z.number().int().min(0).max(100),
  relevance: z.number().int().min(0).max(100),
  misconceptions: z.array(EvaluatedMisconceptionSchema),
  missingKeyPoints: z.array(z.string()),
  strengths: z.array(z.string()),
  correctionGuidance: z.string().min(1),
  suggestedNextAction: z.string().min(1),
  rationale: z.string().min(1),
});
export type EvaluateAnswerResponse = z.infer<typeof EvaluateAnswerResponseSchema>;

export const EVALUATE_ANSWER_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    correctness: {
      type: 'INTEGER',
      description: 'Scientific and factual accuracy of the answer (0-100).',
    },
    completeness: {
      type: 'INTEGER',
      description: 'Coverage of the expected key points (0-100).',
    },
    terminology: {
      type: 'INTEGER',
      description: 'Accurate usage of domain terminology and key terms (0-100).',
    },
    reasoning: {
      type: 'INTEGER',
      description: 'Logical coherence, cause-and-effect structure, and explanation clarity (0-100).',
    },
    relevance: {
      type: 'INTEGER',
      description: 'Direct topical relevance to the specific prompt without off-topic tangents (0-100).',
    },
    misconceptions: {
      type: 'ARRAY',
      description: 'Specific factual inaccuracies, inverted processes, or conceptual confusions.',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING', description: 'Brief description of the error.' },
          severity: {
            type: 'STRING',
            enum: ['minor', 'moderate', 'critical'],
            description: 'Severity: minor (small vocabulary slip), moderate (confused mechanism), critical (complete reversal of principle).',
          },
          correction: { type: 'STRING', description: 'Gentle, plain-language correction.' },
        },
        required: ['description', 'severity', 'correction'],
      },
    },
    missingKeyPoints: {
      type: 'ARRAY',
      description: 'Expected key points that were omitted or incomplete in the answer.',
      items: { type: 'STRING' },
    },
    strengths: {
      type: 'ARRAY',
      description: 'Specific accurate concepts or strong reasoning demonstrated in the answer.',
      items: { type: 'STRING' },
    },
    correctionGuidance: {
      type: 'STRING',
      description: 'Targeted constructive advice on how to improve this recall next time.',
    },
    suggestedNextAction: {
      type: 'STRING',
      description: 'Clear next step: continue to next concept, review source notes, or try another question.',
    },
    rationale: {
      type: 'STRING',
      description: 'Brief 1-2 sentence pedagogical summary of the evaluation.',
    },
  },
  required: [
    'correctness',
    'completeness',
    'terminology',
    'reasoning',
    'relevance',
    'misconceptions',
    'missingKeyPoints',
    'strengths',
    'correctionGuidance',
    'suggestedNextAction',
    'rationale',
  ],
};
