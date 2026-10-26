# STEP4_DIAGNOSIS.md — Step 4 Learning-Session UI Diagnostic Report

**Date:** 2026-10-26  
**Artifact / Issue:** Step 4 Active Learning Session UI (`/learn/[materialId]/session/[sessionId]`)  
**Evidence Standard:** EXECUTED (Verified via code inspection, AST dependency traces, Vitest test suites, and Playwright DOM evaluations)

---

## 1. Visual Defect Analysis (Attached Screenshot)

The provided screenshot reveals an active session at `/learn/[materialId]/session/[sessionId]` for material `"Automatic_Ergonomic_Risk_Assess..."`:

1. **Step Indicator:** Displays `STEP 4 (ACTIVE) Study Session`.
2. **Session Header Card:** Renders a large banner with title `"Active Learning Session"`, badge `"Study Mode"`, document title, and progress `"Concept 1 of 1"` with an empty (0%) progress bar. Header controls include `Finish`, `Pause`, and `Exit`.
3. **Study Companion Card:** Displays a `TeacherAvatar` in `Ready` state, a state badge `* IDLE`, a fallback title `"Study Companion"`, and a source grounding badge `"Grounded in notes (Automatic Ergonomic Ris..)"`.
4. **Context Action Bar:** Displays a single secondary button: `Review later`.
5. **Floating Widget:** Bottom-right corner shows a floating `Tutor Assistant` hovering pill (`Hovering tab • Ready`).
6. **Critical Missing Content:**
   - **Zero Lesson Content:** No concept title, no grounded explanation, no mechanism breakdown, no examples.
   - **Zero Tutor Dialogue:** No message exchange, no Socratic question, no guided prompts.
   - **Zero Interactivity:** No answer composer, no confidence selector, no "Continue" button, no "Explain differently" button.
   - **Dead End:** The user has no forward progress action; the only available button is `Review later`.

---

## 2. Root Cause Classification (Parts A, B, C, D)

An exhaustive investigation was conducted across `src/components/workflow/step4-session-host.tsx`, `src/features/conversation/use-learning-session.ts`, `src/features/conversation/machine.ts`, `src/components/workflow/step3-choose-mode.tsx`, and `src/features/modes/controller.ts`.

All four diagnostic categories apply to this failure:

### A. Rendering Bug
- **Evidence:** `Step4SessionHost.tsx` has **no JSX element to render conversation messages** (`ConversationMessageRecord`). While the database schema (`conversationMessages` store) and domain types exist, `Step4SessionHost` only had layout slots for:
  - `<TutorHeader>` (avatar + title fallback)
  - `<Card>` with `concept.canonicalExplanation` (rendered only if `concept !== null`)
  - `<QuestionCard>` (rendered only if `machineState === 'WAITING_FOR_ANSWER' || 'EVALUATING'`)
  - `<FeedbackCard>` (rendered only if `machineState === 'FEEDBACK' || 'REVISION_DUE' || 'NEXT_CONCEPT'`)
  - `<ContextActionBar>`
- There was no message feed, no Socratic dialogue view, no example block, and no component to display tutor turns or learner turns.

### B. Session-State Bug
- **Evidence:** The conversation state machine (`machine.ts`) is stuck permanently in `IDLE`.
  - In `step3-choose-mode.tsx` (lines 164–173), Socratic Study is launched with `machineState: 'IDLE'`:
    ```ts
    const newSession: StudySessionRecord = {
      id: sessionId,
      materialId,
      currentConceptId: targetConceptId ?? 'default',
      machineState: chosenMode === 'study' ? 'IDLE' : 'WAITING_FOR_RECALL',
      sourceMode: 'document',
      startedAt: nowISO(),
      updatedAt: nowISO(),
    };
    ```
  - In `useLearningSession.ts` (lines 207–213), `loadSessionWithContext` restores `machineState = 'IDLE'`.
  - Neither `useLearningSession` nor `Step4SessionHost` has an on-mount guard or auto-dispatch for sessions in `IDLE`.
  - In `ContextActionBar.tsx` (lines 48–133), when `machineState === 'IDLE'`, none of the forward action buttons (`onReadyForRecall`, `onRequestQuestion`, `onContinue`) render. Only `Review later` is displayed.
  - The FSM requires `SELECT_CONCEPT` with `{ conceptId }` to transition from `IDLE` to `STUDYING_CONCEPT`, but this event was never dispatched on session mount.

### C. Content Bug
- **Evidence:** Socratic lesson content was **never generated or requested**.
  - The teaching pipeline `teachConcept` (`src/features/concepts/teaching-service.ts`), which calls `fetchExplainConcept` (`POST /api/ai/explain-concept`), was only imported and called in `assistant.tsx` (the floating side widget).
  - Step 4 session initialization never triggered `teachConcept` or `fetchExplainConcept`.
  - Network inspection confirms: **0 requests were dispatched to `/api/ai/explain-concept`** during Step 4 session mount.
  - No messages were created in the `conversationMessages` store for the session.

### D. Wiring Bug (Workflow Shell ↔ Mode Engine ↔ State Machine)
- **Evidence:** Disconnection between `useSessionController` and `useLearningSession`:
  - `Step4SessionHost` instantiated two uncoordinated controllers:
    - `useSessionController({ materialId, sessionId, initialMode })`
    - `useLearningSession({ sessionId })`
  - `useSessionController` resolved `orderedConcepts` and `currentConcept`. However, `useLearningSession` was called with `{ sessionId }` without receiving `conceptId: currentConcept?.id`.
  - In `step3-choose-mode.tsx` (line 167), `targetConceptId` defaulted to `'default'` if concepts had not finished loading or were empty.
  - When `session.currentConceptId === 'default'`, `loadSessionWithContext` executed `db.get('concepts', 'default')`, which returned `null`.
  - Consequently:
    - `concept` was `null` in `useLearningSession`.
    - In `Step4SessionHost` line 230: `{concept?.title ?? 'Active Learning Session'}` fell back to `"Active Learning Session"`.
    - In `Step4SessionHost` line 344: `{concept && (<section>...Canonical Explanation</section>)}` evaluated to `false`, omitting the explanation card entirely.
    - In `TutorHeader.tsx` line 123: `{concept ? concept.title : 'Study Companion'}` fell back to `"Study Companion"`.

---

## 3. Moment-of-Failure State Snapshot

| Parameter | Observed State at Failure | Expected State |
| :--- | :--- | :--- |
| **Route** | `/learn/[materialId]/session/[sessionId]` | `/learn/[materialId]/session/[sessionId]` |
| **Workflow Step** | Step 4 (Active) | Step 4 (Active) |
| **`machineState`** | `'IDLE'` | `'STUDYING_CONCEPT'` (Study) / `'WAITING_FOR_RECALL'` (Recall) |
| **`concept` (in `useLearningSession`)** | `null` (or unmounted `'default'`) | `ConceptRecord` (first in-scope concept) |
| **`document`** | Loaded from `documents` | Loaded from `documents` |
| **`/api/ai/explain-concept` calls** | **0 calls** (never sent) | 1 call (`POST /api/ai/explain-concept`) with concept + chunk context |
| **`conversationMessages` count** | 0 records | >= 1 record (Tutor welcome + Socratic lesson + question) |
| **Rendered Heading** | `"Active Learning Session"` | Real concept title (e.g. `"Ergonomic Risk Assessment"`) |
| **Available User Actions** | `Review later`, `Finish`, `Pause`, `Exit` | `Continue`, `Explain differently`, `I'm ready for recall`, `Review later`, `Finish`, `Pause`, `Exit` |

---

## 4. Responsible Files & Functions

1. **`src/components/workflow/step3-choose-mode.tsx` (`handleLaunchMode`)**:
   - Initialized Study mode sessions with `machineState: 'IDLE'` and fallback `currentConceptId: 'default'`.
2. **`src/components/workflow/step4-session-host.tsx` (`Step4SessionHost`)**:
   - Failed to coordinate `useSessionController` and `useLearningSession`.
   - Lacked an on-mount start/resume guard to transition `IDLE` to `STUDYING_CONCEPT`.
   - Lacked UI rendering for conversation messages, Socratic dialogue, examples, and mode-specific views.
   - Stacked narrow cards instead of a 2-column desktop layout.
3. **`src/features/conversation/use-learning-session.ts`**:
   - Did not provide a teaching/explanation trigger or auto-load messages for Socratic study.
4. **`src/features/modes/study-mode.ts`**:
   - `StudyModeModule.start()` set `machineState: 'IDLE'` without triggering concept selection.

---

## 5. Verified Conversation State Machine Transition Table

The following table documents every state in `src/features/conversation/machine.ts` as verified against the source code:

| FSM State | Pedagogical Meaning | UI Elements Displayed | Allowed Actions / Events | Next State | Recovery State on Interruption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`IDLE`** | Session initialized; no active concept in focus | Avatar: `Ready`. Header: Concept or Companion title. Notice to start. | `SELECT_CONCEPT(conceptId)`<br>`UPLOAD_START` | `STUDYING_CONCEPT`<br>`NOTE_UPLOADING` | `IDLE` |
| **`NOTE_UPLOADING`** | Intermediary file upload (transient) | Upload progress bar / spinner | `UPLOAD_SUCCESS`<br>`UPLOAD_FAILURE` | `ANALYZING_NOTES`<br>`IDLE` | `IDLE` |
| **`ANALYZING_NOTES`** | Concept extraction in progress (transient) | Extraction progress spinner + cancel | `ANALYSIS_SUCCESS`<br>`ANALYSIS_FAILURE` | `STUDY_PATH_READY`<br>`IDLE` | `IDLE` |
| **`STUDY_PATH_READY`** | Path constructed; concepts ready for selection | Concept overview, prerequisite roadmap | `SELECT_CONCEPT(conceptId)` | `STUDYING_CONCEPT` | `STUDY_PATH_READY` |
| **`STUDYING_CONCEPT`** | Active teaching: lesson content, example, Socratic dialogue | Lesson content (SafeMarkdown), source grounding excerpt, tutor dialogue, "Explain differently", "Ready for recall", "Review later" | `READY_FOR_RECALL`<br>`SELECT_CONCEPT(conceptId)`<br>`REVIEW_LATER` | `WAITING_FOR_RECALL`<br>`STUDYING_CONCEPT`<br>`STUDY_PATH_READY` | `STUDYING_CONCEPT` |
| **`WAITING_FOR_RECALL`** | Student is ready; waiting to generate question | Grounded recall prompt teaser, "Generate recall question" button | `REQUEST_QUESTION`<br>`USE_FALLBACK_QUESTION`<br>`SELECT_CONCEPT`<br>`REVIEW_LATER` | `GENERATING_QUESTION`<br>`WAITING_FOR_ANSWER`<br>`STUDYING_CONCEPT`<br>`STUDY_PATH_READY` | `WAITING_FOR_RECALL` |
| **`GENERATING_QUESTION`** | In-flight question generation (transient) | Skeleton loader + "Thinking...", cancel button | `QUESTION_GENERATED(questionId)`<br>`QUESTION_FAILED`<br>`USE_FALLBACK_QUESTION` | `WAITING_FOR_ANSWER`<br>`WAITING_FOR_RECALL`<br>`WAITING_FOR_ANSWER` | `WAITING_FOR_RECALL` |
| **`WAITING_FOR_ANSWER`** | Question active; awaiting learner response | QuestionCard (prompt, source provenance), answer textarea, ConfidenceSelector (1–3), Submit button | `SUBMIT_ANSWER(text, conf)`<br>`TRY_AGAIN`<br>`REVIEW_LATER` | `EVALUATING`<br>`WAITING_FOR_RECALL`<br>`STUDY_PATH_READY` | `WAITING_FOR_ANSWER` |
| **`EVALUATING`** | In-flight answer grading (transient) | Skeleton evaluation loader + "Evaluating answer...", cancel | `EVALUATION_SUCCESS(grade)`<br>`EVALUATION_FAILED` | `FEEDBACK` (grade >= 3)<br>`REVISION_DUE` (grade < 3)<br>`WAITING_FOR_ANSWER` | `WAITING_FOR_ANSWER` |
| **`FEEDBACK`** | Score and rubric review | FeedbackCard (strengths, gaps, rubric, evaluation mode), "Continue", "Try again", "Revise" | `CONTINUE`<br>`TRY_AGAIN`<br>`REVISE`<br>`COMPLETE_SESSION`<br>`REVIEW_LATER`<br>`SELECT_CONCEPT` | `NEXT_CONCEPT` or `COMPLETED`<br>`STUDYING_CONCEPT`<br>`REVISION_DUE`<br>`COMPLETED`<br>`STUDY_PATH_READY`<br>`STUDYING_CONCEPT` | `FEEDBACK` |
| **`NEXT_CONCEPT`** | Completed current concept; ready to advance | Advancement summary card, "Proceed to next concept" button | `SELECT_CONCEPT(conceptId)`<br>`COMPLETE_SESSION`<br>`REVIEW_LATER` | `STUDYING_CONCEPT`<br>`COMPLETED`<br>`STUDY_PATH_READY` | `NEXT_CONCEPT` |
| **`REVISION_DUE`** | Score was < 3 or scheduled review due | Remedial feedback, weak prerequisite notice, "Review explanation", "Retry question" | `TRY_AGAIN`<br>`REVISE`<br>`SELECT_CONCEPT`<br>`REVIEW_LATER` | `STUDYING_CONCEPT`<br>`STUDYING_CONCEPT`<br>`STUDYING_CONCEPT`<br>`STUDY_PATH_READY` | `REVISION_DUE` |
| **`COMPLETED`** | All concepts in scope mastered or session finished | SessionCompletionView (stats, time, mastery gains, next unit link) | `SELECT_CONCEPT(conceptId)`<br>`RESET_SESSION` | `STUDYING_CONCEPT`<br>`IDLE` | `COMPLETED` |

---

## 6. Implementation Remediation Plan

To permanently resolve these defects without breaking any existing contracts or dependencies:

1. **On-Mount Start/Resume Guard (`use-learning-session.ts` & `step4-session-host.tsx`):**
   - On session load, if `machineState === 'IDLE'`, automatically dispatch `SELECT_CONCEPT` for the active in-scope concept derived from `orderedConcepts` / `currentConceptId`.
   - Prevent the machine from being stranded in `IDLE`.
2. **Mode-Aware Screens (`src/components/session/`):**
   - **`StudySessionView`**: Focus on grounded lesson content (SafeMarkdown), examples, Socratic dialogue, "Continue" and "Explain differently" (calling `fetchExplainConcept` with alternate mode).
   - **`RecallSessionView`**: Grounded QuestionCard, answer composer, confidence selector, submit, and FeedbackCard with weak-answer loopback.
   - **`RevisionSessionView`**: Real SM-2 due queue, overdue items, next scheduled review date, and honest 0-due empty state.
3. **Responsive 2-Column Layout (`Step4SessionHost.tsx`):**
   - **Desktop (>= 1024px)**: 2/3 main column for lesson and tutor dialogue; 1/3 sticky sidebar for concept details, prerequisites, source provenance, and mastery metrics.
   - **Mobile (< 1024px)**: Single column with collapsable drawer/accordion for concept metadata.
   - Remove redundant outer `"Active Learning Session"` box.
4. **Honest Fallback & Error Recovery:**
   - If AI gateway fails, present canonical explanation from study notes clearly labeled as fallback with `Retry` and `Exit` options.
   - Preserve draft answer across failure and page reloads.
