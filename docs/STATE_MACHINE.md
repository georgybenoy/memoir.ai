# STATE_MACHINE.md — EduMentor 13-State Conversation Machine

Source of Truth: `PRD.md` §5, FR-12, FR-14; `TECH_STACK.md` §9.2; `DESIGN_DOC.md` §5.3.D–E.

---

## 1. Overview and Design Principles

The EduMentor tutoring conversation is governed by an explicit 13-state deterministic finite state machine (FSM) implemented in pure TypeScript (`src/features/conversation/machine.ts`).

### Core Invariants

1. **Pure & Predictable**: `transition(currentState, event, ctx)` is a pure function that evaluates transitions and guards, returning either `{ ok: true, next, effects }` or `{ ok: false, error, currentState }`.
2. **Never Corrupts or Throws**: An invalid or unrecognized `(state, event)` pair never throws and never mutates persisted IndexedDB state; it safely returns `{ ok: false }` with a human-readable diagnostic error.
3. **No Content Loss on Async Failure**: Transient in-flight operations (`NOTE_UPLOADING`, `ANALYZING_NOTES`, `GENERATING_QUESTION`, `EVALUATING`) transition to designated recovery states upon failure or page reload, preserving the user's source files, concept selections, draft answers, and confidence ratings.
4. **Observable Effects**: Side-effects (persisting sessions, logging learning events, initiating AI generation or evaluation) are declared as data in `effects` rather than executed directly inside the pure machine.

---

## 2. The 13 States

| # | State | Category | Description | Safe Recovery State |
|---|---|---|---|---|
| 1 | `IDLE` | Stable | Initial workspace state or between document imports. | `IDLE` |
| 2 | `NOTE_UPLOADING` | Transient | Uploading and validating source document (PDF, TXT, MD). | `IDLE` |
| 3 | `ANALYZING_NOTES` | Transient | Ingestion & Gemini concept extraction running. | `IDLE` (doc preserved) |
| 4 | `STUDY_PATH_READY` | Stable | DAG computed; study path items ready for concept selection. | `STUDY_PATH_READY` |
| 5 | `STUDYING_CONCEPT` | Stable | Socratic explanation shown; student reviewing concept. | `STUDYING_CONCEPT` |
| 6 | `WAITING_FOR_RECALL` | Stable | Student signaled "I'm ready"; question request pending. | `WAITING_FOR_RECALL` |
| 7 | `GENERATING_QUESTION` | Transient | Calling `/api/ai/generate-question` with difficulty & style. | `WAITING_FOR_RECALL` |
| 8 | `WAITING_FOR_ANSWER` | Stable | Active recall question displayed; awaiting user answer & confidence. | `WAITING_FOR_ANSWER` |
| 9 | `EVALUATING` | Transient | Evaluating answer & confidence. | `WAITING_FOR_ANSWER` (draft preserved) |
| 10 | `FEEDBACK` | Stable | Score, strengths, omissions, and next steps displayed. | `FEEDBACK` |
| 11 | `NEXT_CONCEPT` | Stable | Passed ($q \ge 3$); user ready to advance along study path. | `NEXT_CONCEPT` |
| 12 | `REVISION_DUE` | Stable | Weak concept ($q < 3$); flagged for prerequisite refresher or retry. | `REVISION_DUE` |
| 13 | `COMPLETED` | Stable | All concepts in the active study path have been completed. | `COMPLETED` |

---

## 3. Explicit Transition Table

| Source State | Event | Next State | Guards & Context Conditions | Emitted Effects |
|---|---|---|---|---|
| `*` (Any State) | `RESET_SESSION` | `IDLE` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: SESSION_RESET` |
| `*` (Any State) | `RESUME_SESSION` | `resolveRecoveryState(s)` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: SESSION_RESTORED`, `NOTIFY_USER` |
| `IDLE` | `UPLOAD_START` | `NOTE_UPLOADING` | None | `LOG_LEARNING_EVENT: UPLOAD_STARTED` |
| `IDLE` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SELECTED` |
| `NOTE_UPLOADING` | `UPLOAD_SUCCESS` | `ANALYZING_NOTES` | File validated & saved | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: UPLOAD_SUCCEEDED` |
| `NOTE_UPLOADING` | `UPLOAD_FAILURE` | `IDLE` | None | `LOG_LEARNING_EVENT: UPLOAD_FAILED`, `NOTIFY_USER` |
| `ANALYZING_NOTES` | `ANALYSIS_SUCCESS` | `STUDY_PATH_READY` | DAG constructed | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: ANALYSIS_SUCCEEDED`, `NOTIFY_USER` |
| `ANALYZING_NOTES` | `ANALYSIS_FAILURE` | `IDLE` | Source document preserved | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: ANALYSIS_FAILED`, `NOTIFY_USER` |
| `STUDY_PATH_READY` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SELECTED` |
| `STUDYING_CONCEPT` | `READY_FOR_RECALL` | `WAITING_FOR_RECALL` | Current concept active | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: STUDENT_READY_FOR_RECALL` |
| `STUDYING_CONCEPT` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SWITCHED` |
| `STUDYING_CONCEPT` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_POSTPONED` |
| `WAITING_FOR_RECALL` | `REQUEST_QUESTION` | `GENERATING_QUESTION` | None | `PERSIST_SESSION`, `TRIGGER_QUESTION_GENERATION`, `LOG_LEARNING_EVENT: QUESTION_REQUESTED` |
| `WAITING_FOR_RECALL` | `USE_FALLBACK_QUESTION` | `WAITING_FOR_ANSWER` | Fallback template ready | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: FALLBACK_QUESTION_USED`, `NOTIFY_USER` |
| `WAITING_FOR_RECALL` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SWITCHED` |
| `WAITING_FOR_RECALL` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: RECALL_POSTPONED` |
| `GENERATING_QUESTION` | `QUESTION_GENERATED` | `WAITING_FOR_ANSWER` | `questionId` present | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: QUESTION_DISPLAYED` |
| `GENERATING_QUESTION` | `QUESTION_FAILED` | `WAITING_FOR_RECALL` | None (allows retry/fallback) | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: QUESTION_GENERATION_FAILED`, `NOTIFY_USER` |
| `GENERATING_QUESTION` | `USE_FALLBACK_QUESTION` | `WAITING_FOR_ANSWER` | Fallback template ready | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: FALLBACK_QUESTION_USED`, `NOTIFY_USER` |
| `WAITING_FOR_ANSWER` | `SUBMIT_ANSWER` | `EVALUATING` | `answerText.trim() !== ''`; `confidence in [1, 2, 3]` | `PERSIST_SESSION`, `TRIGGER_EVALUATION`, `LOG_LEARNING_EVENT: ANSWER_SUBMITTED` |
| `WAITING_FOR_ANSWER` | `TRY_AGAIN` | `WAITING_FOR_RECALL` | None (re-rolls question) | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: QUESTION_REROLLED` |
| `WAITING_FOR_ANSWER` | `REVIEW_LATER` | `STUDY_PATH_READY` | None (draft answer preserved) | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: ANSWER_POSTPONED` |
| `EVALUATING` | `EVALUATION_SUCCESS` | `FEEDBACK` | `qualityGrade in [0..5]` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: EVALUATION_COMPLETED` |
| `EVALUATING` | `EVALUATION_FAILED` | `WAITING_FOR_ANSWER` | Answer & confidence preserved | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: EVALUATION_FAILED`, `NOTIFY_USER` |
| `FEEDBACK` | `CONTINUE` | `NEXT_CONCEPT` | `qualityGrade >= 3`; `hasMoreConcepts === true` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: PROCEEDED_TO_NEXT_CONCEPT` |
| `FEEDBACK` | `CONTINUE` | `COMPLETED` | `qualityGrade >= 3`; `hasMoreConcepts === false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: PATH_COMPLETED`, `NOTIFY_USER` |
| `FEEDBACK` | `REVISE` | `REVISION_DUE` | Flagged for revision | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: REVISION_FLAGGED` |
| `FEEDBACK` | `TRY_AGAIN` | `STUDYING_CONCEPT` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: REATTEMPT_REQUESTED` |
| `FEEDBACK` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: FEEDBACK_CLOSED` |
| `FEEDBACK` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SELECTED` |
| `FEEDBACK` | `COMPLETE_SESSION` | `COMPLETED` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: PATH_COMPLETED` |
| `NEXT_CONCEPT` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SELECTED` |
| `NEXT_CONCEPT` | `COMPLETE_SESSION` | `COMPLETED` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: PATH_COMPLETED` |
| `NEXT_CONCEPT` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: NEXT_CONCEPT_POSTPONED` |
| `REVISION_DUE` | `TRY_AGAIN` | `STUDYING_CONCEPT` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: REVISION_STARTED` |
| `REVISION_DUE` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | `conceptId` present; `isConceptEligible !== false` | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_SELECTED` |
| `REVISION_DUE` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: REVISION_POSTPONED` |
| `COMPLETED` | `SELECT_CONCEPT` | `STUDYING_CONCEPT` | None | `PERSIST_SESSION`, `LOG_LEARNING_EVENT: CONCEPT_REVISITED` |
| `COMPLETED` | `REVIEW_LATER` | `STUDY_PATH_READY` | None | `PERSIST_SESSION` |

---

## 4. Recovery and Session Restoration Rules

When a user refreshes the page, re-opens the browser, or experiences a process interruption:
1. The persisted `studySessions.machineState` is loaded from IndexedDB.
2. If `machineState` is one of the four `TRANSIENT_STATES`:
   - `NOTE_UPLOADING` $\rightarrow$ recovers to `IDLE` (source upload can be restarted).
   - `ANALYZING_NOTES` $\rightarrow$ recovers to `IDLE` (the document is preserved in the `documents` store and a retry button is surfaced).
   - `GENERATING_QUESTION` $\rightarrow$ recovers to `WAITING_FOR_RECALL` (the user is offered an active retry and an offline fallback question template).
   - `EVALUATING` $\rightarrow$ recovers to `WAITING_FOR_ANSWER` (the student's typed `draftAnswer` and `selectedConfidence` are completely restored).
3. A non-intrusive toast / status notification announces: `"Session restored to [State]."`
