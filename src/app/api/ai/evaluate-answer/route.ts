import { NextResponse } from 'next/server';
import { withAiGuard } from '@/lib/ai/guard';
import { generateStructured } from '@/lib/ai/gemini';
import {
  EVALUATION_SYSTEM_PROMPT,
  buildEvaluationPrompt,
} from '@/lib/ai/prompts';
import {
  EvaluateAnswerRequestSchema,
  EvaluateAnswerResponseSchema,
  EVALUATE_ANSWER_JSON_SCHEMA,
} from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return withAiGuard(
    req,
    '/api/ai/evaluate-answer',
    EvaluateAnswerRequestSchema,
    async ({ data, model }) => {
      const {
        question,
        expectedKeyPoints,
        sourceChunks = [],
        studentAnswer,
        confidence,
        concept,
      } = data;

      const userPrompt = buildEvaluationPrompt({
        question,
        expectedKeyPoints,
        sourceChunks,
        studentAnswer,
        confidence,
        concept,
      });

      const result = await generateStructured({
        system: EVALUATION_SYSTEM_PROMPT,
        user: userPrompt,
        jsonSchema: EVALUATE_ANSWER_JSON_SCHEMA,
        zodSchema: EvaluateAnswerResponseSchema,
        model,
        maxOutputTokens: 2048,
      });

      // The server returns the rubric only; score arithmetic is client-computed
      return NextResponse.json(result);
    },
    { maxBodyBytes: 64 * 1024 },
  );
}
