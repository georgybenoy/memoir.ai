# EduMentor — Technical Stack and Architecture

**Version:** 2.0 — Browser-Local Persistence Edition  
**Deployment:** Vercel  
**AI:** Google Gemini  
**Persistence:** IndexedDB only  
**Authentication:** None  
**External database:** None

---

## 1. Technical Objectives

Build EduMentor as a modular TypeScript web application that can deploy to Vercel while keeping learning records in the user's browser. Gemini requests run through server-side Next.js route handlers so the API key is never shipped to the browser.

The app must not rely on serverless process memory for persistence. IndexedDB is the sole application persistence layer. Vercel route handlers are stateless and return results to the browser; the browser commits learning records locally.

### Explicit constraints

- No Supabase, Firebase, PostgreSQL, MySQL, SQLite server, Redis, KV store, or cloud database.
- No user authentication or account system.
- No server-side learning-profile storage.
- No Gemini API key in browser code or `NEXT_PUBLIC_*` variables.
- No guarantee of cross-device sync or closed-app notifications.
- Export/import is the supported portability mechanism.

---

## 2. Recommended Stack

| Layer                | Technology                                                                   | Purpose                                               |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| Framework            | Next.js App Router, current stable version                                   | UI, server-side API routes, deployment                |
| Language             | TypeScript with strict mode                                                  | Type safety across domain and UI                      |
| Runtime              | Node.js LTS supported by current Next.js/Vercel                              | Local development and server routes                   |
| Styling              | Tailwind CSS                                                                 | Responsive design tokens and utilities                |
| UI primitives        | shadcn/ui + Radix UI where useful                                            | Accessible dialogs, menus, tooltips, controls         |
| Icons                | Lucide React                                                                 | Consistent iconography                                |
| Client state         | Zustand or React context for ephemeral UI state                              | Current screen, modal, loading, selected concept      |
| Local persistence    | Native IndexedDB via `idb`                                                   | Persistent browser-local learning records             |
| Schema validation    | Zod                                                                          | API payloads, AI structured output, backup validation |
| AI SDK               | Official Google Gen AI SDK for JavaScript (`@google/genai`)                  | Gemini requests from server routes                    |
| PDF extraction       | PDF.js (`pdfjs-dist`)                                                        | Text extraction for text-based PDFs                   |
| Text chunking        | Custom TypeScript service                                                    | Overlapping, source-traceable chunks                  |
| Graph algorithms     | Custom TypeScript DAG service; optionally a small graph library if justified | Cycle handling, topological sort, depth tiers         |
| Embeddings           | Browser-compatible ONNX/WebAssembly model, evaluated before selection        | Semantic similarity pillar                            |
| Unit/component tests | Vitest + Testing Library                                                     | Deterministic unit and component tests                |
| Browser E2E          | Playwright                                                                   | Full learning workflow tests                          |
| Lint/format          | ESLint + Prettier                                                            | Code quality                                          |
| Hosting              | Vercel                                                                       | Static assets, Next.js app, serverless route handlers |
| AI secret            | Vercel environment variable `GEMINI_API_KEY`                                 | Server-only Gemini access                             |

Pin compatible versions in `package.json` and commit the lockfile. Avoid installing a dependency merely because it appears in the original Python report; this implementation is TypeScript-first.

---

## 3. Architecture Overview

```text
Browser
├── Next.js UI
│   ├── Conversational workspace
│   ├── Teacher avatar and feedback
│   ├── Study path and progress
│   ├── Import/export and local data settings
│   └── IndexedDB repositories
│       ├── Documents and chunks
│       ├── Concepts and dependency edges
│       ├── Sessions and conversation messages
│       ├── Questions and recall attempts
│       ├── Mastery and SM-2 state
│       └── Local event history
│
└── HTTPS requests (user-initiated AI operations)
    └── Vercel / Next.js route handlers
        ├── Request validation (Zod)
        ├── Input-size and output limits
        ├── Gemini SDK (server only)
        └── Structured responses
```

### Data ownership rule

The browser owns durable local state. The server handles only the AI operation requested by the browser and does not persist user data. Route handlers must not write user content to logs, files, a remote store, or process-global caches.

---

## 4. Suggested Repository Structure

```text
edumentor/
├── public/
│   ├── avatars/
│   └── icons/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   └── ai/
│   │   │       ├── extract-concepts/route.ts
│   │   │       ├── explain-concept/route.ts
│   │   │       ├── generate-question/route.ts
│   │   │       └── evaluate-answer/route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── error.tsx
│   ├── components/
│   │   ├── chat/
│   │   ├── avatar/
│   │   ├── study-path/
│   │   ├── feedback/
│   │   ├── upload/
│   │   ├── progress/
│   │   └── settings/
│   ├── features/
│   │   ├── ingestion/
│   │   ├── concepts/
│   │   ├── dependency-graph/
│   │   ├── conversation/
│   │   ├── recall/
│   │   ├── evaluation/
│   │   ├── mastery/
│   │   └── spaced-repetition/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── gemini.ts
│   │   │   ├── prompts.ts
│   │   │   └── schemas.ts
│   │   ├── db/
│   │   │   ├── indexeddb.ts
│   │   │   ├── schema.ts
│   │   │   ├── migrations.ts
│   │   │   └── repositories/
│   │   ├── validation/
│   │   ├── config/
│   │   └── utils/
│   ├── types/
│   └── test/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .gitignore
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── PRD.md
├── TECH_STACK.md
└── README.md
```

Keep domain logic independent of React components. Components should call feature services; feature services call repositories and API clients. API route handlers must not import browser-only modules.

---

## 5. IndexedDB Design

Use native IndexedDB through the `idb` wrapper. This is local persistence in the browser profile, not a server database.

### 5.1 Database and migrations

- Database name: `edumentor-local`.
- Maintain an integer schema version.
- Add object stores and indexes through versioned `upgrade` migrations.
- Keep migrations deterministic and test them against earlier schemas.
- Use transactions for multi-record updates such as saving an attempt, mastery update, and next SM-2 state.
- Avoid storing derived values if they can be safely recomputed, unless doing so materially improves startup performance.
- Handle quota errors, private browsing restrictions, and unavailable storage explicitly.

### 5.2 Object stores

| Store                    | Key data                                                   | Useful indexes                        |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| `workspace`              | local workspace ID, preferences, schema metadata           | `updatedAt`                           |
| `documents`              | metadata, filename, type, extracted text, timestamps       | `createdAt`, `subjectId`              |
| `documentChunks`         | document ID, chunk index, text, source metadata            | `documentId`, compound document/index |
| `subjects`               | title, description, local IDs                              | `title`                               |
| `concepts`               | summary, canonical explanation, source chunk IDs, tier     | `subjectId`, `status`                 |
| `conceptDependencies`    | prerequisite ID, dependent concept ID                      | both endpoint IDs                     |
| `studySessions`          | state, current concept, progress, timestamps               | `updatedAt`, `status`                 |
| `studyPathItems`         | session ID, concept ID, order, status                      | `sessionId`, compound session/order   |
| `recallQuestions`        | concept ID, prompt, reference points, source IDs           | `conceptId`                           |
| `recallAttempts`         | answer, confidence, scores, quality grade, evaluation mode | `conceptId`, `sessionId`, `createdAt` |
| `masteryStates`          | level, percent, best score, attempt count                  | `conceptId`, `updatedAt`              |
| `spacedRepetitionStates` | repetition count, EF, interval, due date                   | `nextDueAt`, `conceptId`              |
| `conversationMessages`   | session ID, role, content, expression state                | `sessionId`, `createdAt`              |
| `learningEvents`         | event type, timestamps, non-sensitive metadata             | `eventType`, `createdAt`              |

Use UUIDs or `crypto.randomUUID()` for local IDs. IDs provide stable references, not authorization. All stores remain on the current device.

### 5.3 IndexedDB vs sessionStorage

Use IndexedDB for actual learning records because it supports structured objects, indexes, transactions, and larger capacity than `sessionStorage`. Use in-memory state or session storage only for transient UI preferences where appropriate. Do not put all notes and attempts into `sessionStorage`.

### 5.4 Storage behavior and limitations

- Data normally survives tab closure and browser restart.
- Data does not automatically move to another device or browser profile.
- Clearing site data can delete all records.
- Private browsing may have restricted or temporary storage.
- Browsers may impose quotas or evict site data under some conditions.
- `navigator.storage.persist()` may be requested after an explanatory user action, but the browser may refuse; never assume it succeeded.
- Use `navigator.storage.estimate()` where supported to show approximate storage usage.
- Detect `QuotaExceededError`, stop the failed write, explain what happened, and offer export/cleanup.
- Avoid claiming records are safely saved until the IndexedDB transaction completes.
- Offer a clear local data deletion workflow.

---

## 6. Backup and Restore

Export/import is required because there is no cloud database or account.

### Export format

Use a versioned JSON envelope:

```json
{
  "format": "edumentor-backup",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601 timestamp",
  "appVersion": "semantic version",
  "workspace": {},
  "documents": [],
  "documentChunks": [],
  "subjects": [],
  "concepts": [],
  "conceptDependencies": [],
  "studySessions": [],
  "studyPathItems": [],
  "recallQuestions": [],
  "recallAttempts": [],
  "masteryStates": [],
  "spacedRepetitionStates": [],
  "conversationMessages": [],
  "preferences": {}
}
```

Do not include Gemini API keys or environment secrets.

### Import safeguards

1. Check file size before parsing.
2. Parse and validate the envelope with Zod.
3. Check schema version and required fields.
4. Validate record counts and relationships.
5. Show a preview of the workspace being imported.
6. Ask whether to merge, replace, or cancel; never silently overwrite.
7. Use a transaction where feasible.
8. Keep an export of current data or a rollback path before replacement.
9. Report import errors without dumping note contents into logs.
10. Provide a clear warning that backup files may contain sensitive notes.

For large documents, consider a ZIP archive with JSON and original files only if memory and browser performance are tested. JSON-only backup of extracted text/chunks is the initial baseline.

---

## 7. Gemini Integration

### 7.1 Secret management

Use the official `@google/genai` SDK in server-side route handlers only.

Local `.env.local`:

```dotenv
GEMINI_API_KEY=replace_with_your_key
GEMINI_MODEL=gemini-2.5-flash
```

- `.env.local` must be gitignored.
- Add only placeholder names to `.env.example`.
- Set the actual key in Vercel Project Settings → Environment Variables.
- Never use `NEXT_PUBLIC_GEMINI_API_KEY`.
- Never send the key in a response or log.
- Use an approved model allowlist rather than accepting arbitrary model names from the client.
- Keep provider initialization in a server-only module.

### 7.2 Route contract

Suggested endpoints:

- `GET /api/health`: deployment health only; must not return secrets.
- `POST /api/ai/extract-concepts`: accepts selected text chunks and extraction options; returns schema-validated concepts and proposed dependencies.
- `POST /api/ai/explain-concept`: accepts current concept, source chunks, and bounded recent conversation; returns a teaching response.
- `POST /api/ai/generate-question`: accepts concept, source chunks, difficulty metadata, and recent question IDs; returns grounded question, expected key points, and provenance.
- `POST /api/ai/evaluate-answer`: accepts question, source chunks, answer, confidence, and relevant reference points; returns structured judge rubric.

All routes:

- Validate with Zod.
- Enforce request and text size limits.
- Use bounded prompt/context size and output tokens.
- Return consistent error objects with stable codes.
- Retry transient failures only a bounded number of times.
- Respect rate limits and avoid infinite retry loops.
- Do not store request bodies or learning records.
- Do not trust model output without validation.
- Treat uploaded notes and student answers as data, never as instructions that override system prompts.
- Send only source chunks needed for the operation.

### 7.3 Public endpoint abuse

No authentication means anyone can potentially invoke public AI routes. A hidden key alone does not prevent abuse. Implement request size limits, throttling/rate controls compatible with the no-database architecture, reasonable output limits, and clear error handling. Any in-memory rate limiter is best-effort only and may reset or vary across Vercel instances. Do not claim durable per-user quotas without a trusted identity or external state store.

### 7.4 Gemini outage behavior

- Preserve browser data if a request fails.
- Show a retry action.
- Do not mark evaluation complete until a valid result is received or a disclosed fallback is used.
- Keep fallback mode explicit in the attempt record.
- Avoid silent retries that could incur repeated costs.
- Use deterministic local question templates from extracted concept summaries when possible.
- Do not fabricate Gemini output when the provider is unavailable.

---

## 8. Semantic Embedding Evaluation

The original design expects sentence-transformers (`all-MiniLM-L6-v2`) and cosine similarity. The Python library cannot simply be imported into a Next.js Vercel route.

### Required implementation strategy

Evaluate a browser-compatible ONNX/WebAssembly embedding model that can run locally. Requirements:

- Lazy-load only when needed.
- Measure bundle size, memory use, and inference time on representative devices.
- Cache reference embeddings in memory while the app is active.
- Avoid sending answer text to a third-party embedding service.
- Do not block initial workspace rendering on model download.
- If the model cannot load or is too costly on supported devices, disclose degraded evaluation and do not pretend the semantic pillar ran.

The initial composite remains:
`S_comp = 0.40 * S_sem + 0.60 * S_judge`

Only calculate that composite when both component scores are available and valid. If a pillar is missing, either:

1. present a clearly labelled partial evaluation without claiming it is the hybrid score; or
2. use a separately named fallback score with explicit evaluation-mode metadata.

Store `evaluationMode`, `semanticScore`, `judgeScore`, and `compositeScore` separately.

---

## 9. Concept Graph and Learning State

### 9.1 DAG

Represent concepts and prerequisite edges in TypeScript. Edge direction is prerequisite → dependent concept. Implement:

- duplicate edge removal;
- cycle detection;
- deterministic cycle resolution using a documented heuristic;
- Kahn's topological sort;
- depth tier calculation;
- stable tie-breaking;
- graph integrity validation.

Never rely on an LLM-provided order alone. The graph algorithm must validate the output.

### 9.2 Conversation state machine

Implement the 13 explicit states:
`IDLE`, `NOTE_UPLOADING`, `ANALYZING_NOTES`, `STUDY_PATH_READY`, `STUDYING_CONCEPT`, `WAITING_FOR_RECALL`, `GENERATING_QUESTION`, `WAITING_FOR_ANSWER`, `EVALUATING`, `FEEDBACK`, `NEXT_CONCEPT`, `REVISION_DUE`, `COMPLETED`.

Use a typed transition map and guards. Persist meaningful transitions in IndexedDB. Keep transient progress indicators in React state. If a request fails, transition to a recoverable state and preserve the student's draft.

### 9.3 Difficulty

Implement a bounded version of the report's four-factor difficulty model:
`D = 0.35*d_DAG + 0.25*M_session + 0.25*(5-q_prev) + 0.15*log2(n_attempts+1)`

Normalize each input to a known range before combining. The report formula must not be used with unnormalized values that could produce unpredictable scales. Document the normalization and test it.

---

## 10. Hybrid Evaluation and SM-2

### 10.1 Rubric scores

Gemini judge JSON should include:

- correctness;
- completeness;
- key terminology;
- misconceptions;
- reasoning;
- topical relevance;
- missing points;
- strengths;
- concise rationale;
- suggested next step.

Validate ranges and required fields with Zod. Do not rely on free-form text parsing where structured output is available.

### 10.2 Composite and quality grade

- Semantic score range: 0–100.
- Judge score range: 0–100.
- Composite: `0.40 * semantic + 0.60 * judge`.
- Initial grade mapping:
  - 85–100 → q5
  - 70–<85 → q4
  - 55–<70 → q3
  - 40–<55 → q2
  - 25–<40 → q1
  - 0–<25 → q0

Centralize thresholds. Unit-test boundary values.

### 10.3 SM-2

- First successful repetition: 1 day.
- Second successful repetition: 6 days.
- Later: previous interval × EF.
- EF update:
  `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))`
- Minimum EF: 1.30.
- For `q < 3`, reset repetition count and interval to 1 day and mark for weak-concept resurfacing.
- Save next due timestamp in IndexedDB.
- Show due reviews on app startup.
- No guarantee of closed-app notifications.

---

## 11. Vercel Deployment

### Build and runtime

- Deploy the Next.js app to Vercel.
- Use the current stable Next.js version and a supported Node.js LTS runtime.
- Keep server routes compatible with Vercel function limits.
- Do not rely on local filesystem persistence.
- Do not write user data to serverless `/tmp` expecting it to persist.
- Keep client components explicit for IndexedDB, PDF.js, and browser embeddings.
- Keep Gemini SDK modules server-only.

### Environment variables

Production:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- Optional non-secret feature flags or logging level.

Do not expose secrets to client bundles.

### Pre-deployment checks

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Run Playwright E2E against local production build.
6. Verify `/api/health`.
7. Verify Gemini route rejects invalid payloads and handles missing secrets safely.
8. Inspect the client bundle to ensure the Gemini key is absent.
9. Verify no server-side persistence dependency was added.
10. Verify backup export/import and IndexedDB persistence in the deployed site.

---

## 12. Security and Privacy

- No authentication means the app cannot distinguish users sharing the same browser profile.
- IndexedDB data is not automatically encrypted by the application.
- A shared OS/browser profile can expose local notes to other local users.
- XSS protection is critical: render note and model text as text/Markdown through a safe renderer, never raw HTML.
- Validate file types, file size, import size, record count, and relationships.
- Never execute uploaded content or AI output.
- Keep API keys server-only.
- Avoid sensitive logs.
- Set appropriate security headers and CSP where compatible with Next.js and any embedding runtime.
- Explain Gemini processing: relevant note excerpts and submitted answers are transmitted to Google Gemini for requested AI operations.
- Exported backup files may contain sensitive educational material.
- Include delete-data and export controls.
- Do not describe browser-local storage as a secure vault.

---

## 13. Testing

### Unit tests

- Chunking and source provenance.
- Schema validation and concept deduplication.
- DAG ordering, cycle resolution, deterministic output.
- State machine guards.
- Difficulty normalization.
- Composite score boundaries and evaluation modes.
- SM-2 intervals, EF floor, failure reset, dates.
- IndexedDB repositories, migrations, transaction failures.
- Export/import validation and conflict behavior.
- Confidence calibration and mastery updates.

### Integration tests

- API route request/response validation.
- Gemini missing key, timeout, rate limit, invalid JSON, and outage.
- IndexedDB schema upgrades.
- Quota-exceeded behavior.
- Local restore after reload.
- Full upload → concept graph → recall → evaluation → SM-2 workflow.

### E2E tests

- Open workspace without login.
- Upload sample notes.
- Generate a path with mocked Gemini.
- Complete an answer and feedback cycle.
- Reload and verify local progress.
- Export backup, clear local data, import backup.
- See a due review after advancing a controlled clock.
- Verify mobile layout and keyboard navigation.
- Confirm notification permission is not requested automatically.

Use mocked Gemini responses by default. Live provider tests should be opt-in and clearly marked as potentially billable.

---

## 14. Developer Commands

Expected `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Use the package manager and lockfile selected when the project is initialized. Do not change package managers mid-project without a reason.

---

## 15. Definition of Done

- Vercel deployment works.
- Gemini calls are server-side and secret-safe.
- No login and no external database exist.
- IndexedDB persists local learning state across ordinary reloads.
- Backup export/import is verified.
- User understands local-only storage and its limitations.
- Full learning flow and all 13 states work.
- Concept DAG and cycle handling are tested.
- Hybrid scoring truthfully reports the actual evaluation mode.
- SM-2 state persists locally and due reviews appear on startup.
- Notifications are described accurately as best-effort.
- Errors do not silently discard data.
- Core accessibility, mobile responsiveness, and security requirements pass.
- Tests are actually executed and results documented.

Do not claim cross-device synchronization, automatic cloud backup, account recovery, guaranteed reminders while closed, permanent storage, or scientific score validity in this architecture.
