import { NextResponse } from 'next/server';
import { withAiGuard } from '@/lib/ai/guard';
import { generateStructured } from '@/lib/ai/gemini';
import {
  CONCEPT_EXPLANATION_SYSTEM_PROMPT,
  sanitizeTagContent,
} from '@/lib/ai/prompts';
import {
  ExplainConceptRequestSchema,
  ExplainConceptResponseSchema,
  EXPLAIN_CONCEPT_JSON_SCHEMA,
} from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return withAiGuard(
    req,
    '/api/ai/explain-concept',
    ExplainConceptRequestSchema,
    async ({ data, model }) => {
      const {
        concept,
        sourceChunks = [],
        prerequisiteSummaries = [],
        conversationHistory = [],
        sourceMode,
      } = data;

      const isTopicModeWithoutChunks = sourceMode === 'topic' || sourceChunks.length === 0;

      // 1. Format concept context
      let contextText = `
<concept_context>
Title: ${concept.title}
Summary: ${concept.summary}
${concept.canonicalExplanation ? `Canonical Explanation: ${concept.canonicalExplanation}` : ''}
${concept.keyTerms && concept.keyTerms.length > 0 ? `Key Terms: ${concept.keyTerms.join(', ')}` : ''}
</concept_context>
`.trim();

      // 2. Format prerequisite summaries if available
      if (prerequisiteSummaries.length > 0) {
        const prereqList = prerequisiteSummaries
          .map((p) => `- ${p.title}: ${p.summary}`)
          .join('\n');
        contextText += `\n\n<prerequisites>\n${prereqList}\n</prerequisites>`;
      }

      // 3. Format source chunks if present
      if (sourceChunks.length > 0) {
        const formattedChunks = sourceChunks
          .map((c) => {
            const sanitized = sanitizeTagContent(c.text, 'source_chunk');
            return `<source_chunk id="${c.id}">\n${sanitized}\n</source_chunk>`;
          })
          .join('\n\n');
        contextText += `\n\n<source_materials>\n${formattedChunks}\n</source_materials>`;
      }

      // 4. Format conversation history (bounded to last turns)
      let convoText = '';
      if (conversationHistory.length > 0) {
        const formattedConvo = conversationHistory
          .map((msg) => {
            const sanitized = sanitizeTagContent(msg.content, 'message');
            return `<message role="${msg.role}">${sanitized}</message>`;
          })
          .join('\n');
        convoText = `\n\n<conversation>\n${formattedConvo}\n</conversation>`;
      }

      const isSimplify = data.mode === 'simplify';
      const focusList = data.focus ?? data.focusPoints ?? [];
      let simplifyNote = '';
      if (isSimplify) {
        const focusItems =
          focusList.length > 0
            ? `\nKey points the student missed that MUST be clarified in intuitive terms:\n${focusList.map((f) => `- ${sanitizeTagContent(f, 'focus_point')}`).join('\n')}`
            : '';
        simplifyNote = `\nREVISION MODE (SIMPLIFIED RE-EXPLANATION): The student struggled with this concept on a recent active recall test. Break this concept down into very intuitive, easily understandable steps with everyday analogies. Avoid overly dense academic jargon.${focusItems}\n`;
      }

      const instructionNote = isTopicModeWithoutChunks
        ? 'NOTE: The learner is studying in TOPIC mode without uploaded notes. Set "grounded": false, set "citedChunkIds": [], and clearly state that this explanation is based on general domain knowledge rather than imported lecture notes.'
        : 'NOTE: The learner is studying from uploaded notes. Ground your explanation in the provided <source_chunk> data, cite the exact chunk IDs in "citedChunkIds", and set "grounded": true.';

      const userPrompt = `
${instructionNote}
${simplifyNote}
Explain the concept "${concept.title}" according to Socratic pedagogy:
1. Clear plain-language explanation
2. Intuitive mental model or analogy
3. Connection to prerequisites
4. A thought-provoking follow-up question

${contextText}
${convoText}
`.trim();

      // 5. Generate structured Socratic response
      const result = await generateStructured({
        system: CONCEPT_EXPLANATION_SYSTEM_PROMPT,
        user: userPrompt,
        jsonSchema: EXPLAIN_CONCEPT_JSON_SCHEMA,
        zodSchema: ExplainConceptResponseSchema,
        model,
        maxOutputTokens: 3072,
      });

      // 6. Hard constraint verification for topic mode
      if (isTopicModeWithoutChunks) {
        result.grounded = false;
        result.citedChunkIds = [];
        const lower = result.message.toLowerCase();
        if (!lower.includes('not based on uploaded notes') && !lower.includes('uploaded notes')) {
          result.message = `*(Note: This explanation is based on general foundational knowledge rather than uploaded notes.)*\n\n${result.message}`;
        }
      }

      return NextResponse.json(result);
    },
    { maxBodyBytes: 64 * 1024 },
  );
}
