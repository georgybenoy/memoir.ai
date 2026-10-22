import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { fetchExplainConcept } from '@/lib/ai/client';
import { type AllowedModelId } from '@/lib/config/models';
import {
  type ConceptRecord,
  type ConversationMessageRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import { type AvatarExpression } from '@/lib/ai/prompts';

export interface TeachConceptOptions {
  conceptId: string;
  sessionId: string;
  userMessage?: string;
  sourceMode?: 'document' | 'topic';
  model?: AllowedModelId;
  signal?: AbortSignal;
  dbName?: string;
}

export interface TeachConceptResult {
  message: string;
  expression: AvatarExpression;
  grounded: boolean;
  citedChunkIds: string[];
  followUpQuestion: string;
  fallbackUsed: boolean;
  messageId: string;
}

/**
 * Teaching service that manages Socratic dialogue, context assembly,
 * AI gateway interaction, and deterministic offline fallback.
 */
export async function teachConcept(
  options: TeachConceptOptions,
): Promise<TeachConceptResult> {
  const {
    conceptId,
    sessionId,
    userMessage,
    sourceMode = 'document',
    model,
    signal,
    dbName = DB_NAME,
  } = options;

  const db = await openDatabase(dbName);
  const now = nowIso();

  // 1. Load current concept
  const concept = await db.get('concepts', conceptId);
  if (!concept) {
    throw new Error(`Concept with ID "${conceptId}" not found in local storage.`);
  }

  // 2. Persist user message if one was provided in this turn
  if (userMessage && userMessage.trim().length > 0) {
    const userMsgRecord: ConversationMessageRecord = {
      id: generateId(),
      sessionId,
      role: 'user',
      content: userMessage.trim(),
      createdAt: now,
    };
    await db.put('conversationMessages', userMsgRecord);
  }

  // 3. Assemble bounded context
  // A. Top source chunks
  const sourceChunks: Array<{ id: string; text: string }> = [];
  if (sourceMode === 'document' && concept.sourceChunkIds.length > 0) {
    const topChunkIds = concept.sourceChunkIds.slice(0, 4);
    for (const cid of topChunkIds) {
      const chunk: DocumentChunkRecord | undefined = await db.get('documentChunks', cid);
      if (chunk) {
        sourceChunks.push({ id: chunk.id, text: chunk.text });
      }
    }
  }

  // B. Prerequisite summaries
  const prerequisiteSummaries: Array<{ title: string; summary: string }> = [];
  const dependencies = await db.getAllFromIndex('conceptDependencies', 'by-dependent', conceptId);
  for (const dep of dependencies.slice(0, 4)) {
    const prereq: ConceptRecord | undefined = await db.get('concepts', dep.prerequisiteId);
    if (prereq) {
      prerequisiteSummaries.push({ title: prereq.title, summary: prereq.summary });
    }
  }

  // C. Recent conversation history (last 6 messages for bounded context)
  const allSessionMessages = await db.getAllFromIndex('conversationMessages', 'by-session', sessionId);
  allSessionMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const recentHistory = allSessionMessages.slice(-6).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // 4. Call AI Gateway or Fallback on failure
  try {
    const aiResult = await fetchExplainConcept(
      {
        concept: {
          id: concept.id,
          title: concept.title,
          summary: concept.summary,
          canonicalExplanation: concept.canonicalExplanation,
          keyTerms: concept.keyTerms,
        },
        sourceChunks,
        prerequisiteSummaries,
        conversationHistory: recentHistory,
        sourceMode,
        model,
      },
      { signal },
    );

    // Persist assistant response
    const assistantMsgId = generateId();
    const assistantMsgRecord: ConversationMessageRecord = {
      id: assistantMsgId,
      sessionId,
      role: 'assistant',
      content: `${aiResult.message}\n\n**Next question:** ${aiResult.followUpQuestion}`,
      expressionState: aiResult.expression,
      createdAt: nowIso(),
    };
    await db.put('conversationMessages', assistantMsgRecord);

    return {
      message: aiResult.message,
      expression: aiResult.expression as AvatarExpression,
      grounded: aiResult.grounded,
      citedChunkIds: aiResult.citedChunkIds,
      followUpQuestion: aiResult.followUpQuestion,
      fallbackUsed: false,
      messageId: assistantMsgId,
    };
  } catch (err) {
    // Deterministic Honest Fallback (never fabricate AI output!)
    const errMessage = err instanceof Error ? err.message : String(err);
    const fallbackNotice = `*(Note: The AI tutor is temporarily unavailable (${errMessage}). Below is the stored canonical explanation from your study notes.)*`;
    const fallbackMessage = `${fallbackNotice}\n\n### ${concept.title}\n\n${concept.canonicalExplanation || concept.summary}`;
    const followUpQuestion = 'How does this concept connect to your other notes? Try explaining it in your own words.';
    const expression: AvatarExpression = 'supportive';

    const fallbackMsgId = generateId();
    const fallbackMsgRecord: ConversationMessageRecord = {
      id: fallbackMsgId,
      sessionId,
      role: 'assistant',
      content: `${fallbackMessage}\n\n**Question:** ${followUpQuestion}`,
      expressionState: expression,
      createdAt: nowIso(),
    };
    await db.put('conversationMessages', fallbackMsgRecord);

    return {
      message: fallbackMessage,
      expression,
      grounded: sourceMode === 'document',
      citedChunkIds: concept.sourceChunkIds,
      followUpQuestion,
      fallbackUsed: true,
      messageId: fallbackMsgId,
    };
  }
}

/**
 * Creates or retrieves a topic-based concept for free-form study without documents.
 */
export async function getOrCreateTopicConcept(
  topicTitle: string,
  dbName = DB_NAME,
): Promise<ConceptRecord> {
  const db = await openDatabase(dbName);
  const now = nowIso();

  const allConcepts = await db.getAll('concepts');
  const existing = allConcepts.find(
    (c) => c.title.toLowerCase().trim() === topicTitle.toLowerCase().trim(),
  );

  if (existing) {
    return existing;
  }

  const newConcept: ConceptRecord = {
    id: generateId(),
    title: topicTitle.trim(),
    summary: `Free-form exploration topic: "${topicTitle}". Not bound to an uploaded document.`,
    canonicalExplanation: `Topic-based study mode for ${topicTitle}. Socratic explanations are generated from general domain knowledge.`,
    keyTerms: [topicTitle.trim()],
    sourceChunkIds: [],
    tier: 0,
    status: 'available',
    confidence: 0.8,
    extractionOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.put('concepts', newConcept);
  return newConcept;
}
