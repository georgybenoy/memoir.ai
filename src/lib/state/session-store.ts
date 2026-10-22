/**
 * Study Session Zustand Store
 * Tracks active session, current concept being studied, and selected concept in study path.
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §9.2
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { nowIso } from '@/lib/utils/clock';

export interface SessionState {
  /** Active StudySessionRecord ID */
  sessionId: string | null;
  /** Currently active concept being studied in tutor */
  currentConceptId: string | null;
  /** Active document being studied */
  activeDocumentId: string | null;
  /** Concept currently inspected in the study path detail panel */
  selectedConceptId: string | null;

  // Actions
  setSessionId: (sessionId: string | null) => void;
  setCurrentConceptId: (conceptId: string | null) => void;
  setActiveDocumentId: (documentId: string | null) => void;
  setSelectedConceptId: (conceptId: string | null) => void;
  /**
   * Action wired to "Learn this concept" button:
   * Sets current concept in memory and persists to active session in IndexedDB
   */
  learnConcept: (conceptId: string, sessionId?: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      currentConceptId: null,
      activeDocumentId: null,
      selectedConceptId: null,

      setSessionId: (sessionId) => set({ sessionId }),
      setCurrentConceptId: (conceptId) => set({ currentConceptId: conceptId }),
      setActiveDocumentId: (documentId) => set({ activeDocumentId: documentId }),
      setSelectedConceptId: (conceptId) => set({ selectedConceptId: conceptId }),

      learnConcept: async (conceptId: string, explicitSessionId?: string) => {
        const targetSessionId = explicitSessionId ?? get().sessionId;
        set({
          currentConceptId: conceptId,
          selectedConceptId: conceptId,
          ...(targetSessionId ? { sessionId: targetSessionId } : {}),
        });

        if (targetSessionId) {
          try {
            const db = await openDatabase(DB_NAME);
            const session = await db.get('studySessions', targetSessionId);
            if (session) {
              session.currentConceptId = conceptId;
              session.machineState = 'STUDYING_CONCEPT';
              session.updatedAt = nowIso();
              await db.put('studySessions', session);
            }
          } catch (err) {
            console.warn('Failed to update session currentConceptId in IndexedDB:', err);
          }
        }
      },
    }),
    {
      name: 'edumentor-session-store',
    },
  ),
);
