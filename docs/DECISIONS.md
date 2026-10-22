# DECISIONS.md — Architectural Decision Record

Decisions already made for EduMentor. Each entry records the decision and a one-line rationale.

---

## D-001: Visual system follows DESIGN_DOC tokens; PRD cyan retained as `accent-cyan`

DESIGN_DOC.md defines the authoritative colour palette and typography. PRD §4.2 is a starting direction only. The PRD's `#25D8E8` cyan is kept as the `accent-cyan` token (`#67E8F9` from DESIGN_DOC is the implementation value) to honour both documents without conflict.

## D-002: Route structure

- `/` — marketing landing page.
- `/app` — workspace with sub-routes: home, materials, path, tutor, review, progress, settings.

**Rationale:** Separates public-facing landing from the authenticated-free learning workspace; sub-routes map to DESIGN_DOC §5.3 primary screens.

## D-003: Semantic similarity runs in the browser via Transformers.js

Use `@huggingface/transformers` with the quantized `all-MiniLM-L6-v2` ONNX model in a Web Worker, lazy-loaded. If the model cannot load, evaluation falls back to a clearly labelled judge-only mode.

**Rationale:** Avoids a Python server dependency; keeps answer text off third-party embedding services; ONNX/WASM runs in-browser on most modern devices; lazy-loading prevents blocking initial render.

## D-004: Gemini judge returns rubric dimensions only; numeric score is computed client-side

The Gemini judge returns structured rubric dimensions (correctness, completeness, terminology, etc.). The numeric judge score is computed deterministically in client code from configured rubric weights.

**Rationale:** Deterministic scoring is testable and reproducible; separates AI judgement from score calculation; avoids opaque LLM-generated numbers.

## D-005: Playwright E2E tests mock AI routes and control time via Playwright APIs

E2E tests mock `/api/ai/*` using Playwright request interception (`page.route()`). Time is controlled with Playwright's clock API. The server code has **no** mock flags, test modes, or conditional paths for testing.

**Rationale:** Keeps production code clean; Playwright's built-in interception is sufficient; clock API enables deterministic SM-2 and review-due testing.

## D-006: SM-2 — EF unchanged when q < 3; controlled by config flag

EF is left unchanged when `q < 3` (original SM-2 behaviour). A config flag `updateEfOnFailure` (default `false`) controls this. Intervals are whole days.

**Rationale:** Matches Wozniak's original SM-2 specification; the config flag allows future experimentation without code changes; whole-day intervals simplify due-date display and testing.

## D-007: Rate limiting is best-effort in-memory only

Server-side rate limiting uses in-memory state only (no Redis, KV, or database). It is documented as best-effort — it resets on cold starts and does not synchronise across Vercel instances.

**Rationale:** No external state store is permitted by the architecture constraints; in-memory is the only option; honesty requires documenting its limitations.

## D-008: Tailwind CSS v4 configured via @tailwindcss/postcss

Tailwind CSS v4 is compiled using `@tailwindcss/postcss` with `postcss.config.mjs` and native CSS `@theme inline` tokens, removing hardcoded turbopack loaders from `next.config.ts`.

**Rationale:** Standard, stable build integration across development (`next dev`) and optimized production builds (`next build`) in Next.js 16.

## D-009: Centralised time and ID utilities

All time access is channeled through `src/lib/utils/clock.ts` and all UUID generation through `src/lib/utils/id.ts`. Direct `new Date()` or `crypto.randomUUID()` calls in application code are strictly forbidden.

**Rationale:** Enables deterministic clock mocking in unit/E2E tests and guarantees unique, validated UUID generation across environments.

## D-010: IndexedDB schema version 1 with quota error interception

IndexedDB wrapper (`src/lib/storage/db.ts`) defines typed schema for 7 object stores (`notes`, `chunks`, `embeddings`, `evaluations`, `review_items`, `sessions`, `settings`) and wraps writes with `safeWrite` to detect browser `QuotaExceededError` and throw `StorageQuotaExceededError`.

**Rationale:** Prevents silent data loss, enforces hard architecture constraints, and prepares clean persistence for subsequent phases.

## D-011: Accessible UI primitives on Radix UI and Tailwind tokens

UI primitives (Button, Card, Input, Dialog, Toast, EmptyState, ErrorBoundary) are implemented with strict accessibility attributes (`aria-busy`, `aria-live`, focus traps, accessible names, Escape handling) and CSS variables referencing DESIGN_DOC §4.1 tokens.

**Rationale:** Enforces WCAG 2.2 AA compliance from day one, ensures consistent keyboard navigation, and provides safe error boundaries across the workspace shell.

## D-012: Complete 14-store domain schema and IndexedDB repositories

Domain entities (`workspace`, `documents`, `documentChunks`, `subjects`, `concepts`, `conceptDependencies`, `studySessions`, `studyPathItems`, `recallQuestions`, `recallAttempts`, `masteryStates`, `spacedRepetitionStates`, `conversationMessages`, `learningEvents`) are formally specified via TypeScript interfaces and strict Zod validation schemas (`SCHEMA_VERSION = 1`). IndexedDB repositories (`src/lib/db/repositories/idb-repositories.ts`) expose typed CRUD and compound index queries (`by-doc-index`, `by-next-due`, `by-prereq-dep`, etc.).

**Rationale:** Establishes a complete, single source of truth for persistent data, pre-defining fields needed by later phases to avoid unnecessary early schema migrations.

## D-013: Transparent storage probe with functional in-memory fallback

The storage layer executes a non-intrusive probe on startup (`probeStorageAvailability`). If IndexedDB is blocked or private browsing mode prevents storage writes, EduMentor seamlessly instantiates an in-memory repository adapter (`MemoryRepositories`) with identical interfaces and reports `persistenceMode: 'memory'` to the UI.

**Rationale:** Guarantees that the app remains functional in restricted or private browsing environments while honestly communicating that changes will not survive browser restarts.

## D-014: Atomic multi-store transactions and honest save status tracking

Multi-store writes execute inside `runTransaction(storeNames, mode, fn)`. If any operation fails or triggers a quota error, the transaction aborts cleanly with zero partial writes. The save status Zustand store tracks status (`idle | saving | saved | error`), transitioning to `saved` only after IndexedDB transaction commit, and surfaces honest indicators in the top bar.

**Rationale:** Guarantees ACID transactional integrity for complex learning operations (e.g., attempt + mastery + SM-2 update) and prevents false claims of persisted progress.

## D-015: Hardened JSON backup envelope, security validation, and rollback safety

Backups export to a versioned JSON envelope (`format: "edumentor-backup"`) without secrets. Imports undergo file size checks (max 50MB), prototype-pollution detection (`__proto__`, `constructor`, `prototype`), schema validation, internal duplicate ID detection, and referential integrity checks. Replace imports automatically generate a safety rollback export before clearing existing tables.

**Rationale:** Prevents security vulnerabilities (prototype pollution, script injection) and avoids catastrophic accidental data loss during restore operations.

## D-016: Server-Only Gemini Gateway with 1-Shot Repair, Timeout Bounds, and Safe Logging

The Gemini gateway (`src/lib/ai/gemini.ts`) starts with `import "server-only"`. Routes configure `runtime = "nodejs"` and `maxDuration = 60` to operate comfortably within Vercel Pro function execution limits (60s) and Gemini flash response times. Gateway calls enforce a hard 45s timeout (`DEFAULT_AI_TIMEOUT_MS = 45000`) and bounded exponential backoff with jitter (max 2 retries) for transient errors (429, 500, 503, network, timeout). Model selection is restricted to `ALLOWED_MODELS` with default `gemini-2.5-flash`; unallowed models are rejected with `MODEL_NOT_ALLOWED`. Schema-validated outputs perform exactly one repair retry on malformed JSON before failing with `AI_MALFORMED_RESPONSE`. A shared `withAiGuard` wrapper enforces 512 KiB payload limits, SHA-256 hashed client IP sliding-window rate limits (25 req/min), an 8-request concurrency cap, and `safeLog` privacy enforcement (never logging bodies, notes, answers, keys, or raw IPs).

**Rationale:** Completely protects API keys from client bundling, prevents abuse and denial-of-service, bounds serverless execution costs, and enforces zero-data-leakage privacy invariants.

## D-017: Concept Extraction Pipeline, Provenance Validation, and Offline Teaching Fallback

The concept extraction pipeline (`src/features/concepts/`) batches document chunks into token-budgeted windows (max 10 chunks, 10,000 characters) and executes sequential API extraction with progress callbacks and cancellation support. Extracted concepts undergo multi-batch deduplication based on normalized titles, key term Jaccard similarity (>= 0.5), and summary token overlap. Hallucinated chunk IDs are validated against genuine document chunks and stripped, with confidence penalized to <= 0.4 if all citations were invented. Valid prerequisite titles are resolved to extracted concept IDs and assigned topological tiers (0: foundational, 1: core, 2+: advanced), with concepts, dependencies, and document status committed in one atomic IndexedDB transaction. When Gemini is unavailable, the Socratic teaching service provides a deterministic offline fallback presenting the stored canonical explanation with an honest "tutor unavailable" notice.

**Rationale:** Preserves strict source provenance, prevents false dependency claims, guarantees local data integrity across failures, and maintains honest communication without fabricating AI outputs.

## D-018: Native Pure TypeScript Dependency Graph Pipeline (No External Graph Library)

The dependency graph (`src/features/dependency-graph/`) is implemented in pure TypeScript without third-party graph libraries (such as graphology, dagre, or cytoscape). It implements Tarjan's Strongly Connected Components for cycle detection, deterministic cycle breaking (ranking candidates by lowest confidence, keeping dependent concepts with lower extractionOrder last, then lexicographic `(fromId, toId)`), Kahn's topological sort with stable tie-breaking (`extractionOrder` then `id`), longest-path depth tiers, and normalized downstream influence calculation in `[0, 1]`.

**Rationale:** A native implementation avoids heavy bundle overhead, prevents external dependency rot, guarantees byte-identical deterministic DAG resolution across runs and platforms, adheres strictly to pedagogical tie-breaking invariants, and ensures zero-overhead serialization into IndexedDB.

---

## D-019: Vector SVG Avatar, Product-Story Landing Page, and Complete Workspace Polish

The teacher avatar (`src/components/avatar/`) is built entirely as lightweight vector SVG/CSS with 11 distinct pedagogical expressions driven by a deterministic mapping table from the conversation state machine and recall evaluation grades (q=5 Celebration, q=4 Happy, q=3 Almost correct, q<=2 Supportive, Idle, Listening, Explaining, Thinking, Reminder). The landing page (`/`) implements the exact approved product-story copy from DESIGN §12, featuring authentic workspace components labelled as sample data, 3 How it works steps, 6 Learning tools cards, the constructive study loop, an accessible 7-topic FAQ accordion, and atmospheric radial gradients with a low-opacity grid texture. Settings screen exposes Gemini model allowlist selection from `/api/health`, 3-tier difficulty preferences, and an explicit `navigator.storage.persist()` caller reporting real browser outcomes, strictly adhering to zero-secret client boundaries.

---

## D-020: Standalone JSON Backup Format and Omission of Optional ZIP Packaging

EduMentor implements single-file JSON backup and restore (`format: "edumentor-backup"`). The optional ZIP packaging mentioned as an alternative in early specifications was skipped in favor of the self-contained JSON envelope.

**Rationale:** The JSON envelope already preserves all document texts, chunk offsets, concepts, graph dependencies, study paths, recall attempts, and spaced repetition states. Avoiding third-party compression libraries (such as JSZip) prevents unnecessary client bundle bloat, avoids binary parsing vulnerabilities, relies strictly on native browser JSON APIs, and guarantees 100% round-trip fidelity across devices.



