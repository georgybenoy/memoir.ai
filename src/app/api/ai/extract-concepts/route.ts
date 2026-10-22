import { NextResponse } from 'next/server';
import { withAiGuard } from '@/lib/ai/guard';
import { generateStructured } from '@/lib/ai/gemini';
import {
  CONCEPT_EXTRACTION_SYSTEM_PROMPT,
  sanitizeTagContent,
} from '@/lib/ai/prompts';
import {
  ExtractConceptsRequestSchema,
  ExtractConceptsResponseSchema,
  EXTRACT_CONCEPTS_JSON_SCHEMA,
  type ExtractedConceptDto,
} from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return withAiGuard(
    req,
    '/api/ai/extract-concepts',
    ExtractConceptsRequestSchema,
    async ({ data, model }) => {
      const validChunkIdSet = new Set(data.chunks.map((c) => c.id));

      // 1. Format chunks into hardened data containers
      const formattedChunks = data.chunks
        .map((chunk) => {
          const sanitized = sanitizeTagContent(chunk.text, 'source_chunk');
          return `<source_chunk id="${chunk.id}">\n${sanitized}\n</source_chunk>`;
        })
        .join('\n\n');

      const userPrompt = `
Analyze the following source note chunks and extract the key concepts and their prerequisite relationships.
Remember to cite ONLY the exact chunk IDs provided in the <source_chunk id="..."> tags.

${formattedChunks}
`.trim();

      // 2. Call Gemini with structured output and 1-shot repair
      const result = await generateStructured({
        system: CONCEPT_EXTRACTION_SYSTEM_PROMPT,
        user: userPrompt,
        jsonSchema: EXTRACT_CONCEPTS_JSON_SCHEMA,
        zodSchema: ExtractConceptsResponseSchema,
        model,
        maxOutputTokens: 6144,
      });

      // 3. Post-validation: enforce that cited chunk IDs exist in input chunks
      const sanitizedConcepts: ExtractedConceptDto[] = result.concepts.map((concept) => {
        const validCitations = concept.sourceChunkIds.filter((id) => validChunkIdSet.has(id));

        // If the model hallucinated all citations, attribute to the first input chunk and penalize confidence
        if (validCitations.length === 0) {
          return {
            ...concept,
            sourceChunkIds: [data.chunks[0].id],
            confidence: Math.min(concept.confidence, 0.4),
          };
        }

        return {
          ...concept,
          sourceChunkIds: validCitations,
        };
      });

      return NextResponse.json({ concepts: sanitizedConcepts });
    },
    { maxBodyBytes: 512 * 1024 },
  );
}
