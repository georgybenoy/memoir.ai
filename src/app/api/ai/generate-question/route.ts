import { NextResponse } from 'next/server';
import { withAiGuard } from '@/lib/ai/guard';
import { generateStructured } from '@/lib/ai/gemini';
import {
  QUESTION_GENERATION_SYSTEM_PROMPT,
  buildQuestionGenerationPrompt,
} from '@/lib/ai/prompts';
import {
  GenerateQuestionRequestSchema,
  GenerateQuestionResponseSchema,
  GENERATE_QUESTION_JSON_SCHEMA,
} from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return withAiGuard(
    req,
    '/api/ai/generate-question',
    GenerateQuestionRequestSchema,
    async ({ data, model }) => {
      const {
        concept,
        sourceChunks,
        difficultyLevel,
        preferredStyle,
        recentQuestionPrompts = [],
      } = data;

      const validChunkIds = new Set(sourceChunks.map((c) => c.id));

      const userPrompt = buildQuestionGenerationPrompt({
        concept,
        sourceChunks,
        difficultyLevel: difficultyLevel ?? 3,
        preferredStyle,
        recentQuestionPrompts,
      });

      const result = await generateStructured({
        system: QUESTION_GENERATION_SYSTEM_PROMPT,
        user: userPrompt,
        jsonSchema: GENERATE_QUESTION_JSON_SCHEMA,
        zodSchema: GenerateQuestionResponseSchema,
        model,
        maxOutputTokens: 2048,
      });

      // Verification constraint (PRD FR-07, Task 6):
      // The server verifies returned sourceChunkIds ⊆ provided chunks.
      const verifiedCitations = result.sourceChunkIds.filter((id) => validChunkIds.has(id));

      result.sourceChunkIds =
        verifiedCitations.length > 0 ? verifiedCitations : [sourceChunks[0].id];

      return NextResponse.json(result);
    },
    { maxBodyBytes: 64 * 1024 },
  );
}
