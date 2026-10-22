'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  FileText,
  Network,
  Brain,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { useSessionStore } from '@/lib/state/session-store';
import { Button } from '@/components/ui/button';
import { TeacherAvatar, type AvatarExpression } from '@/components/avatar';
import { SafeMarkdown } from '@/components/tutor/SafeMarkdown';
import { cn } from '@/lib/utils/cn';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { teachConcept, getOrCreateTopicConcept } from '@/features/concepts/teaching-service';
import { type ConceptRecord, type StudySessionRecord } from '@/types/domain';

export interface WorkspaceAssistantProps {
  className?: string;
  isMobileDrawer?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  expression?: AvatarExpression;
  grounded?: boolean;
  followUpQuestion?: string;
  conceptTitle?: string;
  createdAt: string;
}

const SUGGESTED_PROMPTS = [
  'How does active recall help learning?',
  'Explain how spaced repetition works',
  'What are prerequisite concept maps?',
];

function toAvatarExpression(expr?: string | null): AvatarExpression {
  if (!expr) return 'Greeting';
  const lower = expr.toLowerCase();
  switch (lower) {
    case 'greeting':
      return 'Greeting';
    case 'idle':
      return 'Idle';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking';
    case 'explaining':
      return 'Explaining';
    case 'encouraging':
      return 'Encouraging';
    case 'happy':
      return 'Happy';
    case 'almost_correct':
    case 'almost correct':
      return 'Almost correct';
    case 'supportive':
      return 'Supportive';
    case 'celebration':
      return 'Celebration';
    case 'reminder':
      return 'Reminder';
    default:
      return 'Greeting';
  }
}

export const WorkspaceAssistant: React.FC<WorkspaceAssistantProps> = ({ className }) => {
  const router = useRouter();
  const { rightPanelOpen } = useWorkspaceStore();
  const { currentConceptId, sessionId, setSessionId, setCurrentConceptId } = useSessionStore();

  const [isExpanded, setIsExpanded] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [activeConcept, setActiveConcept] = React.useState<ConceptRecord | null>(null);
  const [currentExpression, setCurrentExpression] = React.useState<AvatarExpression>('Greeting');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Load active concept info if available
  React.useEffect(() => {
    let isCancelled = false;

    async function loadConcept() {
      if (!currentConceptId) {
        if (!isCancelled) setActiveConcept(null);
        return;
      }

      try {
        const db = await openDatabase(DB_NAME);
        const c = await db.get('concepts', currentConceptId);
        if (!isCancelled && c) {
          setActiveConcept(c);
        }
      } catch {
        // Ignore read errors
      }
    }

    loadConcept();

    return () => {
      isCancelled = true;
    };
  }, [currentConceptId]);

  // Load existing session messages if available
  React.useEffect(() => {
    let isCancelled = false;
    if (!sessionId) return;

    openDatabase(DB_NAME)
      .then(async (db) => {
        const storedMsgs = await db.getAllFromIndex('conversationMessages', 'by-session', sessionId);
        if (isCancelled || !storedMsgs || storedMsgs.length === 0) return;

        storedMsgs.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const loaded: ChatMessage[] = storedMsgs.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          expression: toAvatarExpression(m.expressionState),
          createdAt: m.createdAt,
        }));

        setMessages(loaded);
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [sessionId]);

  // Auto-scroll to bottom of chat
  React.useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, isExpanded]);

  // Focus input when opened
  React.useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // If assistant panel is toggled off from topbar, render nothing
  if (!rightPanelOpen) {
    return null;
  }

  // 1. Collapsed State: Hovering Small Tab in bottom-right corner
  if (!isExpanded) {
    return (
      <aside
        aria-label="AI Tutor Assistant"
        role="complementary"
        className="fixed bottom-6 right-6 z-40"
      >
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="group flex items-center gap-2.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)]/95 px-4 py-2.5 shadow-xl hover:shadow-2xl hover:border-[var(--primary)]/60 hover:bg-[var(--surface-hover)] transition-all duration-200 cursor-pointer backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <div className="relative flex items-center justify-center" aria-hidden="true">
            <TeacherAvatar expression={currentExpression} size="sm" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
            </span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
              Tutor Assistant
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              {activeConcept ? `Studying: ${activeConcept.title}` : 'Hovering tab • Ready'}
            </span>
          </div>
          <Sparkles
            className="h-3.5 w-3.5 text-[var(--primary)] shrink-0 ml-1 group-hover:rotate-12 transition-transform"
            aria-hidden="true"
          />
        </button>
      </aside>
    );
  }

  // Handle sending a user inquiry
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? inputValue).trim();
    if (!query || isSending) return;

    setInputValue('');
    setErrorMessage(null);
    setIsSending(true);
    setCurrentExpression('Thinking');

    const userMsgId = generateId();
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      createdAt: nowIso(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const db = await openDatabase(DB_NAME);

      // Determine concept: use active concept if available, otherwise check DB or create topic concept
      let targetConcept: ConceptRecord;
      if (activeConcept) {
        targetConcept = activeConcept;
      } else {
        // Try to match an existing concept by title
        const allConcepts = await db.getAll('concepts');
        const match = allConcepts.find(
          (c) =>
            query.toLowerCase().includes(c.title.toLowerCase()) ||
            c.title.toLowerCase().includes(query.toLowerCase()),
        );
        if (match) {
          targetConcept = match;
        } else {
          // Create topic concept
          targetConcept = await getOrCreateTopicConcept(query, DB_NAME);
        }
        setActiveConcept(targetConcept);
        setCurrentConceptId(targetConcept.id);
      }

      // Ensure active session exists
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = generateId();
        const newSession: StudySessionRecord = {
          id: currentSessionId,
          currentConceptId: targetConcept.id,
          sourceMode: targetConcept.sourceChunkIds.length > 0 ? 'document' : 'topic',
          machineState: 'STUDYING_CONCEPT',
          startedAt: nowIso(),
          updatedAt: nowIso(),
        };
        await db.put('studySessions', newSession);
        setSessionId(currentSessionId);
      }

      // Call teaching service for Socratic explanation
      const result = await teachConcept({
        conceptId: targetConcept.id,
        sessionId: currentSessionId,
        userMessage: query,
        sourceMode: targetConcept.sourceChunkIds.length > 0 ? 'document' : 'topic',
        dbName: DB_NAME,
      });

      const nextExpr = toAvatarExpression(result.expression);
      setCurrentExpression(nextExpr);

      const assistantMsg: ChatMessage = {
        id: result.messageId,
        role: 'assistant',
        content: result.message,
        expression: nextExpr,
        grounded: result.grounded,
        followUpQuestion: result.followUpQuestion,
        conceptTitle: targetConcept.title,
        createdAt: nowIso(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setCurrentExpression('Supportive');
      const errText =
        err instanceof Error ? err.message : 'The tutor is temporarily unreachable.';
      setErrorMessage(errText);

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `I couldn't generate a live response right now: ${errText}. Your notes and local records are safe. Try asking again, or explore your study materials.`,
        expression: 'Supportive',
        grounded: false,
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 2. Expanded State: Floating Assistant Card / Drawer
  return (
    <>
      {/* Mobile backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 sm:hidden"
        onClick={() => setIsExpanded(false)}
        aria-hidden="true"
      />

      {/* Floating Assistant Card */}
      <aside
        aria-label="AI Tutor Assistant"
        role="complementary"
        className={cn(
          'fixed z-50 flex flex-col bg-[var(--surface)]/98 backdrop-blur-md border border-[var(--border-color)] shadow-2xl transition-all duration-200',
          // Mobile: bottom drawer sheet
          // Desktop: floating card hovering in bottom right
          'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[620px] sm:max-h-[85vh] sm:rounded-2xl',
          className,
        )}
      >
        {/* Assistant Header */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-4 bg-[var(--surface-raised)]/70 sm:rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TeacherAvatar expression={currentExpression} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  Tutor Assistant
                </h2>
                {activeConcept && (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface)] text-[var(--accent-blue)] border border-[var(--border-color)] truncate max-w-[120px]">
                    {activeConcept.title}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--success)] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                {activeConcept
                  ? activeConcept.sourceChunkIds.length > 0
                    ? 'Grounded in study notes'
                    : 'Topic inquiry mode'
                  : 'Ready to guide your study'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/tutor')}
              title="Open full tutor recall session"
              aria-label="Open full tutor recall session"
              className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <Brain className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              aria-label="Close assistant panel"
              className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Assistant Content Area / Chat Timeline */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-6 px-2 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--primary)] shadow-sm">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="space-y-1.5 max-w-xs">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  {activeConcept
                    ? `Ready to explore ${activeConcept.title}`
                    : 'Ready to guide your study'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {activeConcept
                    ? 'Ask any question to get a Socratic explanation grounded in your notes.'
                    : 'Ask any question to learn Socratic style, or choose a topic below to begin.'}
                </p>
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="w-full space-y-2 pt-2">
                <p className="text-[11px] font-semibold text-[var(--text-muted)] text-left flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  <span>Try asking:</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="text-left px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/70 hover:bg-[var(--surface-hover)] hover:border-[var(--primary)]/40 transition-colors text-xs text-[var(--text-primary)] group cursor-pointer flex items-center justify-between"
                    >
                      <span>{prompt}</span>
                      <Sparkles className="h-3 w-3 text-[var(--text-muted)] group-hover:text-[var(--primary)] shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Navigation Buttons */}
              <div className="pt-2 w-full flex items-center justify-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => router.push('/app/materials')}
                  className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <FileText className="h-3 w-3" />
                  <span>Import notes</span>
                </button>
                <span className="text-[var(--border-color)]">•</span>
                <button
                  type="button"
                  onClick={() => router.push('/app/path')}
                  className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Network className="h-3 w-3" />
                  <span>Concept map</span>
                </button>
                <span className="text-[var(--border-color)]">•</span>
                <button
                  type="button"
                  onClick={() => router.push('/app/tutor')}
                  className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline transition-colors cursor-pointer"
                >
                  <Brain className="h-3 w-3" />
                  <span>Full Recall</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-[var(--primary)] px-3.5 py-2.5 text-xs text-white shadow-xs">
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="max-w-[92%] rounded-2xl rounded-bl-xs bg-[var(--surface-raised)] border border-[var(--border-color)] p-3.5 space-y-2.5 shadow-xs">
                      {/* Grounding & Metadata Badge */}
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pb-1 border-b border-[var(--border-color)]/60">
                        <span className="flex items-center gap-1">
                          {msg.grounded ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-[var(--success)]" />
                              <span className="text-[var(--success)] font-medium">
                                Grounded in notes
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--accent-blue)] font-medium">
                              🌐 Topic mode (general domain)
                            </span>
                          )}
                        </span>
                        {msg.conceptTitle && (
                          <span className="text-[var(--text-muted)] truncate max-w-[130px]">
                            {msg.conceptTitle}
                          </span>
                        )}
                      </div>

                      {/* Main Explanation Body */}
                      <SafeMarkdown content={msg.content} className="text-xs leading-relaxed" />

                      {/* Socratic Follow-Up Question Highlight */}
                      {msg.followUpQuestion && (
                        <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--primary)]/30 space-y-1">
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)]">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            <span>Socratic Check:</span>
                          </div>
                          <p className="text-xs text-[var(--text-primary)] leading-relaxed italic">
                            &quot;{msg.followUpQuestion}&quot;
                          </p>
                        </div>
                      )}

                      {/* Practice Action */}
                      <div className="pt-1 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push('/app/tutor')}
                          className="h-6 text-[10px] px-2 text-[var(--accent-blue)] hover:text-white"
                        >
                          <span>Test recall in full session &rarr;</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Sending / Thinking Indicator */}
              {isSending && (
                <div className="flex items-start gap-2.5">
                  <TeacherAvatar expression="Thinking" size="sm" />
                  <div className="rounded-2xl rounded-bl-xs bg-[var(--surface-raised)] border border-[var(--border-color)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                    <span>Tutor is formulating a Socratic explanation...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Prompt composer */}
        <div className="border-t border-[var(--border-color)] p-3 bg-[var(--surface-raised)]/70 sm:rounded-b-2xl shrink-0">
          {errorMessage && (
            <p className="mb-2 text-[11px] text-[var(--danger)] text-center">{errorMessage}</p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder={
                activeConcept
                  ? `Ask about "${activeConcept.title}" or any topic...`
                  : 'Ask your tutor a question or enter a topic...'
              }
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface)] pl-3.5 pr-11 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all disabled:opacity-50"
              aria-label="Ask your tutor a question"
            />
            <Button
              type="submit"
              size="icon"
              variant="primary"
              disabled={!inputValue.trim() || isSending}
              className="absolute right-1.5 h-7 w-7 rounded-lg"
              aria-label="Send question to tutor"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)] px-1">
            <span>
              {activeConcept ? (
                <span className="text-[var(--text-secondary)]">
                  Context: <strong className="text-[var(--text-primary)]">{activeConcept.title}</strong>
                </span>
              ) : (
                <span>Topic mode • Ask anything to learn</span>
              )}
            </span>
            <span>Press Enter to send</span>
          </div>
        </div>
      </aside>
    </>
  );
};
