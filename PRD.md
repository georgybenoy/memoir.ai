# EduMentor — Product Requirements Document (PRD)

**Product tagline:** Your notes. Your recall. Your mastery.  
**Version:** 2.0 — Browser-Local Persistence Edition  
**Status:** Implementation specification for Google Antigravity  
**Deployment:** Vercel  
**AI provider:** Google Gemini  
**Authentication:** None  
**External database:** None  
**Persistence:** IndexedDB in the user's browser only

---

## 1. Product Overview

EduMentor is a privacy-conscious AI study companion that transforms a student's lecture materials into an adaptive learning journey. It teaches concepts in prerequisite order, encourages students to explain ideas in their own words, evaluates conceptual understanding, tracks mastery, and schedules spaced reviews.

The product's primary interface is a conversational study workspace. The complex machinery—document extraction, concept discovery, prerequisite graphs, question generation, hybrid evaluation, mastery calculations, and spaced repetition—must remain behind a calm, focused interface.

### 1.1 Product promise

A student can bring study notes, receive a structured learning path, learn each concept, test recall, receive useful feedback, and revisit weak concepts without creating an account.

### 1.2 Architecture constraints

- Deploy the web application and server-side API routes on Vercel.
- Use Google Gemini for LLM-based concept extraction, Socratic teaching, question generation, and rubric-based answer judging.
- Use IndexedDB as the only persistent application data store.
- Do not use authentication, accounts, server databases, cloud data stores, or a backend persistence layer.
- Keep Gemini credentials on the server in Vercel environment variables. Never expose the key to browser code.
- Keep learning records on the device that created them.
- Provide explicit export/import backup for portability and recovery.
- Make data-loss and notification limitations clear in the interface and documentation.

### 1.3 Important product limitation

IndexedDB is browser-local persistence, not a cloud account. Data usually survives ordinary tab closures and browser restarts, but it can be lost if the user clears site data, uses private browsing, changes browser/device, or the browser evicts storage. EduMentor cannot automatically synchronize records across devices. Users must export and safely store a backup to move or restore their learning profile.

SM-2 calculations and due-review queues work locally. Reliable notifications while the application is closed are not guaranteed by this architecture. In-app due-review prompts can be shown when the user next opens EduMentor. Browser notifications may be offered only while permission and platform behavior allow them; they are an enhancement, not a guaranteed reminder service.

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Turn PDF, TXT, and Markdown notes into source-grounded learning material.
2. Extract atomic concepts and prerequisite relationships.
3. Build a directed acyclic graph (DAG) and an ordered study path.
4. Teach concepts through empathetic Socratic explanations.
5. Generate active-recall questions grounded in the student's own notes.
6. Evaluate answers using semantic similarity and an LLM rubric.
7. Calculate mastery and schedule review with SuperMemo SM-2.
8. Automatically revisit concepts with weak answers.
9. Track confidence and provide calibrated feedback.
10. Save session, concept, answer, and review state in IndexedDB.
11. Restore local progress after normal browser restarts.
12. Allow users to export/import a complete local learning backup.
13. Provide a responsive, accessible, polished web experience.
14. Deploy on Vercel with Gemini secrets stored only in server environment variables.

### 2.2 Non-goals / deferred features

Unless a later approved change adds them, the MVP excludes:

- User accounts, login, password reset, and identity management.
- Cloud synchronization, server-side profile persistence, and shared workspaces.
- A remote database or analytics store.
- Voice input, handwriting OCR, math symbolic solving, code execution sandbox, and live video teacher.
- Multiplayer, peer chat, social feed, public leaderboards, and competitive XP/loot mechanics.
- Guaranteed push notifications or background review scheduling while the application is closed.
- Claims of permanent data retention or cross-device recovery without a user-created backup.

---

## 3. Target Users and Core Use Cases

### 3.1 Primary user

A student studying from their own notes who wants to understand concepts and retain them over time without configuring separate flashcard decks or quiz banks.

### 3.2 Core use cases

- Upload lecture notes and generate a study path.
- Type a topic to begin a limited topic-based session, clearly indicating when answers are not grounded in uploaded notes.
- Learn a concept and ask follow-up questions.
- Signal readiness to be tested.
- Answer a recall question in their own words.
- Select confidence before submitting.
- Receive a score, strengths, missing ideas, misconception explanations, and next steps.
- Revisit a weak concept.
- See upcoming local reviews and resume progress after reopening the browser.
- Export a backup and import it later or on another device.
- Delete local data deliberately.

---

## 4. Product Experience and Design Principles

### 4.1 Core principle

**Complexity belongs behind the interface.** The student should experience a focused chat workspace rather than a collection of disconnected admin screens.

### 4.2 Visual direction

Use a polished dark glassmorphism interface:

- Canvas: `#050608`
- Surface: `#0D1117`
- Border: `#27303B`
- Primary cyan: `#25D8E8`
- Secondary violet: `#8B5CF6`
- Primary text: `#F5F7FA`
- Muted text: `#9AA4B2`
- Typography: Inter or Manrope for headings, readable sans-serif for body.
- Subtle gradients, restrained glows, clear focus indicators, reduced-motion support.
- Responsive desktop, tablet, and mobile layouts.
- Do not use decorative effects that compromise reading, contrast, or performance.

### 4.3 Primary workspace

The workspace includes:

- Header and product identity.
- Teacher avatar and synchronized expression.
- Conversation timeline.
- Study path / current concept context.
- Unified composer for messages and supported file attachments.
- Progress and review status.
- Contextual actions such as “I'm ready”, “Try again”, “Continue”, and “Review later”.
- Clear local-data status and access to export/import/delete controls.

### 4.4 Required interface states

Loading, empty, processing, success, no extractable PDF text, unsupported file, file too large, Gemini rate limit, Gemini unavailable, malformed AI response, local storage unavailable/full, import rejected, export completed, review due, session restored, and session reset.

---

## 5. End-to-End Learning Workflow

1. User opens EduMentor without login.
2. Application opens or initializes a local workspace stored in IndexedDB.
3. User uploads notes or enters a topic.
4. The ingestion service validates file type and size, extracts text, normalizes it, and divides it into overlapping chunks.
5. The concept extraction service identifies atomic concepts, summaries, canonical explanations, and source chunk references.
6. The dependency engine creates prerequisite edges, detects cycles, resolves cycles deterministically, and topologically sorts concepts.
7. The study path is shown with foundational concepts before dependent concepts.
8. The teacher explains the selected concept using source-grounded Socratic teaching.
9. User selects “I'm ready”.
10. The system generates a recall question grounded in the concept's source chunks and modulated by difficulty.
11. User submits an explanation and selects confidence.
12. Evaluation computes semantic similarity and requests a structured rubric judgement from Gemini.
13. The synthesis engine combines the two signals, returns feedback and derives an SM-2 quality grade.
14. The mastery state and next review date are saved in IndexedDB.
15. If `q < 3`, the concept is queued for revision and the mentor guides the student through missing prerequisites or a simpler explanation.
16. If `q >= 3`, the user can continue to the next eligible concept.
17. When the user returns later in the same browser profile, the app loads the saved local state and surfaces due reviews.
18. The user can export a backup at any time and import it on another browser/device.

---

## 6. Functional Requirements

### FR-01 — Local workspace and lifecycle

- No login or account creation.
- Generate a cryptographically random local workspace identifier where supported.
- Keep the workspace identifier and application records in IndexedDB.
- The identifier is not authentication and must never be treated as a security boundary.
- On startup, detect IndexedDB availability and load the local workspace.
- If storage is unavailable, explain that progress may not persist and offer a usable in-memory session where possible.
- Show a local-data notice: data is stored in this browser/device and is not synced.
- Provide an explicit “Delete all local data” action with confirmation.
- Do not send local learning records to any server except the minimum content required for a user-triggered Gemini request.

### FR-02 — Document ingestion

- Accept PDF, TXT, and Markdown files.
- Default maximum upload size: 25 MiB per file.
- Validate extension, MIME type when available, actual file signature where applicable, and file size.
- Treat uploaded content as untrusted input.
- Extract PDF text in the browser where feasible using PDF.js; support text-based PDFs.
- Clearly report scanned/image-only PDFs as unsupported by text extraction in the MVP; do not imply OCR exists.
- Normalize whitespace and remove empty pages/chunks.
- Chunk text with configurable target size and overlap.
- Store original file metadata, extracted text, chunk text, chunk index, and provenance in IndexedDB.
- Avoid unnecessary server uploads. For Gemini requests, send only the relevant selected chunks and prompt context.
- Never silently substitute external web content for source notes.

### FR-03 — Concept extraction

- Use Gemini structured output or validated JSON to extract concepts from chunks.
- Each concept includes stable local ID, title, concise summary, canonical explanation, key terms, source chunk IDs, confidence/quality indicator, and proposed prerequisites.
- Deduplicate near-identical concepts.
- Preserve source provenance for each concept.
- Validate every AI response against a schema; retry once with a repair prompt if malformed.
- If extraction fails, preserve the uploaded document and let the user retry rather than losing the source.

### FR-04 — Prerequisite dependency DAG

- Model concepts as vertices and prerequisite relations as directed edges.
- Edge direction: prerequisite concept → dependent concept.
- Use a deterministic TypeScript graph implementation; a heavyweight graph library is optional only if justified.
- Detect cycles and resolve them using a deterministic feedback-edge heuristic.
- Record or expose removed/uncertain edges for diagnostics.
- Use Kahn's topological sorting for study order.
- Compute depth tiers:
  - Tier 0: foundational primitives.
  - Tier 1: core mechanisms.
  - Tier 2+: advanced/dependent concepts.
- Never mark a dependent concept eligible before required prerequisites meet the configured mastery threshold.
- Provide a graceful fallback for disconnected concepts and graph extraction failure.

### FR-05 — Study path

- Show ordered concepts with status: locked, available, in progress, review due, mastered.
- Allow the student to inspect concept summary and source.
- Permit skipping only through an explicit user action; do not silently violate prerequisite rules.
- Recalculate eligibility after each evaluation.
- Save path order and concept status in IndexedDB.
- Provide a progress summary without public comparison or leaderboards.

### FR-06 — Socratic teacher

- Use a warm, respectful, encouraging mentor persona.
- Teach the idea in plain language, then build intuition and connect prerequisite concepts.
- Ask guiding questions instead of immediately revealing every answer.
- Keep claims grounded in uploaded notes where a document is the study source.
- Distinguish direct note content from reasonable pedagogical paraphrase.
- Do not invent citations or claim a fact appears in a source when provenance is missing.
- Explain uncertainty and ask the user to upload or select relevant notes if context is insufficient.
- Keep conversation history in IndexedDB with bounded context windows sent to Gemini.

### FR-07 — Recall question generation

- Questions must be grounded in source chunks associated with the current concept.
- Support explanation, comparison, cause/effect, process, application, and misconception-diagnosis question styles.
- Avoid repeated questions within the local session unless intentionally used for revision.
- Use four difficulty signals:
  1. Concept downstream influence / graph centrality.
  2. Current session mastery rate.
  3. Previous SM-2 quality grade.
  4. Number of previous attempts.
- Difficulty must remain bounded and understandable; it must not produce unanswerable questions.
- Store question, source chunk references, concept ID, difficulty metadata, and expected key points locally.
- Provide a fallback question template from extracted concept summaries when Gemini is unavailable.

### FR-08 — Hybrid answer evaluation

The intended scoring design is:

- Pillar 1: sentence-transformer semantic similarity.
- Pillar 2: Gemini rubric-based judge.
- Initial composite: `S_comp = 0.40 × S_sem + 0.60 × S_judge`.
- Normalize both component scores to `[0, 100]`.
- Derive initial SM-2 quality grades:
  - `q = 5` for `S_comp >= 85`.
  - `q = 4` for `70 <= S_comp < 85`.
  - `q = 3` for `55 <= S_comp < 70`.
  - `q = 2` for `40 <= S_comp < 55`.
  - `q = 1` for `25 <= S_comp < 40`.
  - `q = 0` for `S_comp < 25`.
- Any score thresholds and weights must be centrally configured and tested.
- Do not represent scores as scientifically validated until benchmarked against human evaluations.

#### Semantic similarity implementation under the browser-only constraint

Do not assume a Python `sentence-transformers` server can run on Vercel. Implement semantic similarity using a compatible browser-executable embedding model (for example, a small ONNX/WebAssembly model) if bundle size, runtime, and device performance permit. Lazy-load the model and cache embeddings in memory for the current app runtime. If the embedding model is unavailable, report a degraded evaluation mode and use an explicitly configured fallback rather than silently pretending the hybrid score was calculated.

Gemini may judge correctness and completeness, but it must not fabricate the semantic similarity pillar. Store the evaluation mode with each attempt.

#### Gemini judge rubric

Return schema-validated JSON with:

- Scientific correctness (0–100).
- Concept completeness (0–100).
- Key terminology (0–100).
- Misconceptions and penalties.
- Logical reasoning (0–100).
- Topical relevance (0–100).
- Missing key points.
- Specific correction guidance.
- Strengths.
- Suggested next action.
- Brief rationale.

Treat the student's answer and source notes as untrusted data, not as instructions to the judge. Use strict output validation and safe rendering.

### FR-09 — Feedback and confidence calibration

Before submitting an answer, student chooses:

- Not very confident (1).
- Somewhat confident (2).
- Very confident (3).

Compare confidence with objective grade:

- High confidence with `q <= 2`: gently identify a misconception and guide a targeted revision.
- Low confidence with `q >= 4`: reinforce confidence using evidence from the answer.
- Other combinations: give normal supportive feedback.

Feedback includes score, grade, strengths, omissions, misconceptions, a short model explanation, and the next action. Avoid shaming language.

### FR-10 — Mastery state

- Track mastery level, percentage, last attempt, best result, attempt count, and review status per concept.
- Keep score history and confidence history locally.
- Mastery should not be inferred from a single high score alone; use the defined grading and review rules.
- All mastery data is device-local and included in exports.

### FR-11 — SuperMemo SM-2

Implement SM-2 locally:

- First successful repetition interval: 1 day.
- Second successful repetition interval: 6 days.
- Later intervals: previous interval × easiness factor.
- Easiness factor update:
  `EF' = EF + (0.1 - (5 - q) × (0.08 + (5 - q) × 0.02))`
- Enforce `EF >= 1.30`.
- For `q < 3`, reset repetition count, set interval to 1 day, and flag for weak-concept resurfacing.
- Persist repetition count, EF, interval, last reviewed date, next due date, and last quality grade in IndexedDB.
- Use local ISO timestamps and clearly handle device clock/time-zone changes.
- The scheduler calculates due dates but does not guarantee an alert while the app is closed.
- On application startup, surface due reviews and weak concepts.

### FR-12 — Thirteen-state conversation machine

Implement explicit, testable state transitions:

1. `IDLE`
2. `NOTE_UPLOADING`
3. `ANALYZING_NOTES`
4. `STUDY_PATH_READY`
5. `STUDYING_CONCEPT`
6. `WAITING_FOR_RECALL`
7. `GENERATING_QUESTION`
8. `WAITING_FOR_ANSWER`
9. `EVALUATING`
10. `FEEDBACK`
11. `NEXT_CONCEPT`
12. `REVISION_DUE`
13. `COMPLETED`

Transitions must have guards. Invalid transitions return a safe UI error and do not corrupt persisted state. Async failures must return the state to a recoverable state and preserve user content.

### FR-13 — Eleven teacher avatar expressions

Support the following semantic states:

1. Greeting
2. Idle
3. Listening
4. Thinking
5. Explaining
6. Encouraging
7. Happy
8. Almost correct
9. Supportive
10. Celebration
11. Reminder

The avatar can be a lightweight SVG/CSS illustration or a supplied asset set. Expressions must be synchronized with learning state and feedback. Avoid making a static decorative image appear to be live video or a human.

### FR-14 — Conversation history and local recovery

- Store conversation messages in IndexedDB.
- Use bounded context for each Gemini request.
- Restore the last workspace and session after normal reloads.
- Persist state transitions and relevant events locally.
- Handle schema upgrades with IndexedDB versioned migrations.
- If a migration fails, preserve recoverable data and offer export/recovery instructions.
- Never promise recovery after browser data deletion.

### FR-15 — Export and import

Because there is no cloud persistence, this is a required MVP feature.

- Export a versioned JSON backup containing documents' extracted text, chunks, concepts, dependencies, study paths, sessions, messages, recall attempts, mastery states, SM-2 state, preferences, and schema version.
- Do not include API keys or server secrets.
- Optionally offer a ZIP package with JSON plus original source files if file size and implementation cost are reasonable.
- Validate imported schema, size, record counts, IDs, relationships, and supported version before modifying current data.
- Show an import preview and conflict policy.
- Import atomically where possible; never wipe existing data silently.
- Warn users that backups may contain private study notes and should be stored securely.
- Support restore on another device by manually importing the backup.
- Provide export and delete-data controls in settings and at sensible points in the product.

### FR-16 — Notifications and review reminders

- Always show due and overdue reviews inside EduMentor on startup.
- Optional browser notification permission can be requested only after a clear user action.
- Do not request notification permission on first load.
- Do not promise reliable closed-app reminders; browser support, permission, device state, and deployment behavior vary.
- No server cron, queue, push service, or database-backed notification system is included.
- Provide next-due dates and a “Review now” action within the app.

### FR-17 — Settings

Provide:

- Gemini model selection from an approved allowlist.
- Model availability and API error status without exposing secrets.
- Learning difficulty preference.
- Reduced motion preference.
- Export/import backup.
- Clear local data.
- Storage usage estimate where supported.
- Privacy explanation and local-only data status.
- No client-side field for entering a secret Gemini API key in production. The key is a deployment secret.

### FR-18 — Error handling and fallback

- User-friendly error messages.
- Retry with bounded exponential backoff for transient Gemini errors.
- Respect rate limits and provider errors.
- Validate and limit request payload size.
- Do not log note contents, full student answers, secrets, or API keys.
- If Gemini is unavailable, retain user data and offer deterministic study/recall where possible.
- If semantic model loading fails, disclose degraded evaluation.
- If IndexedDB quota is exceeded, stop the write, warn the user, and offer export/cleanup; do not claim the data was saved.
- Never silently drop an answer, uploaded note, or review state.

---

## 7. API and Serverless Requirements

Vercel hosts the Next.js application and server-side route handlers. Routes are stateless and do not persist learning data.

Suggested routes:

- `POST /api/ai/extract-concepts`
- `POST /api/ai/explain-concept`
- `POST /api/ai/generate-question`
- `POST /api/ai/evaluate-answer`
- `GET /api/health`

Rules:

- Use server-only Gemini SDK and environment variables.
- Validate requests with Zod.
- Apply input-size limits and reasonable model output token limits.
- Send only the chunks and context needed for the current action.
- Do not create database tables, remote file storage, or server-side user profiles.
- Avoid logging request bodies.
- Return structured, typed errors.
- Configure route runtime and timeout according to current Vercel and Gemini limits.
- Do not rely on serverless process memory to preserve state across requests.

---

## 8. Privacy and Security Requirements

- No login, account, password, or identity database.
- No external database.
- Browser-local data is not automatically encrypted by EduMentor; users who share a device or OS account may expose it to other local users.
- Do not describe IndexedDB as a secure vault.
- Use server-only `GEMINI_API_KEY`; never prefix it with `NEXT_PUBLIC_`.
- Do not send local data to Gemini without a user-triggered learning action.
- Explain that relevant note excerpts and answer text are transmitted to Gemini for AI processing.
- Do not include raw notes or answers in telemetry.
- Treat document text, model output, and imported backups as untrusted.
- Sanitize/escape content rendered in the UI.
- Use strict schemas for AI responses and imported files.
- Add request throttling/rate controls appropriate to a public serverless endpoint, while acknowledging that no-auth public endpoints can be abused.
- Set secure response headers and appropriate content security policy where compatible.
- Use least-privilege server-side code and avoid unnecessary dependencies.
- Add a privacy notice explaining local storage, Gemini processing, backups, and limitations.

### No-auth abuse limitation

Without user authentication, public Gemini endpoints can be called by third parties if exposed. A hidden API key does not by itself prevent API abuse. Implement server-side rate limiting or abuse controls compatible with the no-database architecture, and document that strong per-user quotas and durable abuse prevention are limited without trusted identity or external state.

---

## 9. Accessibility and Quality

- WCAG 2.1 AA target.
- Keyboard-accessible chat composer, file upload, dialogs, study path, and backup controls.
- Visible focus rings.
- Proper labels and semantic HTML.
- Screen-reader announcements for processing, feedback, errors, and state changes.
- Contrast-safe text and controls.
- Reduced-motion preference respected.
- Mobile-first responsive design.
- No essential action available only by hover.

---

## 10. Performance Requirements

- Keep initial JavaScript bundle lean.
- Lazy-load PDF.js and embedding inference assets.
- Lazy-load embedding model; do not block initial rendering.
- Cache embeddings only in memory unless local storage size and privacy behavior are explicitly designed and tested.
- Chunk long documents and process incrementally.
- Limit prompt context to relevant chunks and recent conversation turns.
- Debounce nonessential UI writes and batch IndexedDB transactions without risking data loss.
- Show progress for long-running extraction/evaluation.
- Use cancellation and stale-request guards.
- Treat browser storage quota as variable; estimate usage and provide export/cleanup.

---

## 11. Data Model (IndexedDB)

Use versioned IndexedDB stores, with stable IDs and explicit relationships.

Suggested object stores:

- `workspace`: local preferences and workspace metadata.
- `documents`: file metadata and extracted text.
- `documentChunks`: chunks and provenance.
- `subjects`: subject/course grouping.
- `concepts`: atomic concept records.
- `conceptDependencies`: prerequisite edges.
- `studySessions`: current and past local sessions.
- `studyPathItems`: ordered concepts per session.
- `recallQuestions`: questions and reference key points.
- `recallAttempts`: answer, confidence, component scores, composite score, quality grade, evaluation mode.
- `masteryStates`: mastery summaries.
- `spacedRepetitionStates`: SM-2 state and next due date.
- `conversationMessages`: ordered messages.
- `learningEvents`: local non-sensitive product events.

These are IndexedDB object stores, not server database tables. Use transactions for related updates. Index common lookups by document ID, concept ID, session ID, and due date. Keep the data model normalized enough to avoid inconsistency while recognizing IndexedDB is a document/object store.

---

## 12. Acceptance Criteria

The MVP is not complete until all applicable criteria pass:

1. App runs locally and deploys to Vercel.
2. No authentication flow exists.
3. No external database or cloud persistence is used.
4. Gemini API key is only accessible server-side.
5. PDF/TXT/Markdown ingestion works within configured limits.
6. Extracted text and chunks can be traced back to their source.
7. Concept extraction returns schema-valid results or a recoverable error.
8. Dependency graph is acyclic after cycle handling and produces stable topological order.
9. Student can complete the 13-state learning journey with guarded transitions.
10. Questions use source chunks associated with the current concept.
11. Answer evaluation reports which evaluation mode actually ran.
12. The hybrid score uses the configured weights when both pillars are available.
13. Weak grades trigger the revision loop.
14. SM-2 dates and state persist in IndexedDB across ordinary reloads.
15. Due reviews appear when the app is opened.
16. Export includes all required local learning data and schema version.
17. Import validates before applying and never silently overwrites local data.
18. User can deliberately clear all local data.
19. UI explains no sync, backup responsibility, Gemini processing, and notification limitations.
20. Storage quota and Gemini errors do not silently discard work.
21. Core flows are keyboard-accessible and responsive.
22. Tests cover algorithms, storage migrations, import/export, API validation, state transitions, and end-to-end learning.

Do not claim a test passed unless it was executed. Do not claim model correlation or academic validity without a documented benchmark and human-labelled dataset.

---

## 13. Testing Strategy

### Unit tests

- Chunking and source provenance.
- Concept schema validation and deduplication.
- DAG topological order, cycles, disconnected nodes, and stable output.
- Conversation-state transition guards.
- Score normalization and composite weighting.
- SM-2 intervals, EF floor, failure reset, and due-date handling.
- Confidence calibration rules.
- IndexedDB repository and transaction behavior.
- Export/import validation, schema versions, and conflict handling.

### Integration tests

- Gemini route input/output validation.
- Missing API key, rate limit, timeout, malformed output, and provider outage.
- IndexedDB migration and recovery paths.
- Storage quota failure.
- End-to-end upload → concepts → study path → recall → evaluation → review scheduling.

### End-to-end tests

- New workspace and no-auth entry.
- Upload and study a text-based sample PDF.
- Complete a learning attempt.
- Reload and confirm local progress is restored.
- Export, clear data, and import the backup.
- Verify due review presentation.
- Verify mobile and keyboard interaction.

Use deterministic mocked Gemini responses for normal automated tests; keep live Gemini tests opt-in to avoid cost and flaky CI.

---

## 14. Implementation Phases

### Phase 1 — Foundation

- Next.js + TypeScript project, Tailwind, UI primitives, linting, tests, environment validation, Vercel readiness.
- Build the responsive workspace shell and error/loading primitives.

### Phase 2 — IndexedDB persistence

- Schema/versioning, repositories, migrations, transactions, storage status, clear-data flow, export/import foundation.
- Verify persistence across reloads.

### Phase 3 — Ingestion

- PDF/TXT/Markdown validation, text extraction, normalization, chunking, source provenance.

### Phase 4 — Gemini gateway and concepts

- Server-only Gemini integration, structured outputs, retries, concept extraction, Socratic explanations.

### Phase 5 — DAG and study path

- Dependency graph, cycle handling, topological sort, tiers, path visualization.

### Phase 6 — Conversation state machine and recall

- All 13 states, guarded transitions, grounded questions, adaptive difficulty.

### Phase 7 — Hybrid evaluation and mastery

- Browser-compatible embeddings, Gemini judge, score synthesis, confidence calibration, mastery state.

### Phase 8 — SM-2 and revision

- Scheduling, weak-concept loopback, due-review dashboard and review invitations on app startup.

### Phase 9 — Full UI and avatar

- Eleven expressions, feedback rubric, history, settings, responsive polish and accessibility.

### Phase 10 — Resilience, QA, deployment

- Offline/degraded modes, storage limits, export/import hardening, rate/abuse controls, end-to-end tests, Vercel deployment verification, documentation.

Each phase must end with executed tests, a list of verified behavior, known issues, and a clear next phase. Avoid implementing all features in a single unverified code dump.

---

## 15. Definition of Done

EduMentor is done when the full workflow works end to end; local learning data persists and can be backed up/restored; Gemini secrets remain server-side; the application is deployed to Vercel; limitations are disclosed accurately; tests are executed and pass; and no feature is represented as complete without evidence.

The product must never imply cloud synchronization, account-based recovery, guaranteed closed-app reminders, or permanent storage in this browser-only architecture.
