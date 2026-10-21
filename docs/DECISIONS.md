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

