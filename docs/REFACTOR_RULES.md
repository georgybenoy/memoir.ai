# REFACTOR_RULES.md — EduMentor Workflow Refactor Permanent Rules

All engineering agents and phases working on the workflow refactor (R1 through R6) MUST strictly adhere to these rules at all times.

---

## 1. Non-Destructive Preservation
- **Do not rebuild from scratch:** This is a refactor of an existing, fully working application.
- **Never delete or overwrite working core components:**
  - Ingestion, chunking, and provenance mapping (`src/features/ingestion/*`)
  - AI extraction and prompt pipelines (`src/features/concepts/*`, `src/lib/ai/*`)
  - Pure TypeScript topological DAG cycle detection and Kahn resolution (`src/features/dependency-graph/*`)
  - Hybrid evaluation logic: ONNX embedding worker + Gemini judge rubric (`src/features/evaluation/*`)
  - SM-2 spaced repetition engine, retention scheduling, and review queue (`src/features/spaced-repetition/*`)
  - 13-state deterministic conversation machine and recovery resolvers (`src/features/conversation/*`)
  - Vector SVG teacher avatar with 11 pedagogical expressions (`src/components/avatar/*`)
  - Hardened JSON backup envelope, prototype-pollution checks, and rollback restore (`src/lib/db/backup.ts`)

---

## 2. Persistence & Cloud Boundaries
- **IndexedDB is the ONLY persistent store:** Zero auth, Supabase, Firebase, Postgres, SQLite, Redis, or cloud KV databases.
- **In-memory fallback transparency:** When IndexedDB is blocked (e.g. private mode), seamlessly instantiate `MemoryRepositories` and honestly inform the user.
- **Server route boundary:** The Gemini SDK (`@google/genai`) is server-only (`import 'server-only'`). Never prefix `GEMINI_API_KEY` with `NEXT_PUBLIC_`.
- **Environment & deployment integrity:** Keep Vercel serverless configurations, CSP headers, rate limits, and `.env.local` handling unchanged.

---

## 3. Data Integrity & Migration Discipline
- **Zero data loss:** User data must survive all upgrades without corruption, silent loss, or orphaned cascades.
- **Additive, versioned schemas:** Schema changes must increment `SCHEMA_VERSION` and register a deterministic migration in `src/lib/db/migrations.ts`.
- **Atomic transactions:** Multi-store writes must execute inside `runTransaction(storeNames, mode, fn)`.
- **Quota resilience:** All writes must detect browser `QuotaExceededError` via `safeWrite` and surface honest recovery options to the user.

---

## 4. Evidence-Based Verification Standard
- **Never claim a feature works merely because code or tests exist.**
- **Mandatory evidence levels:** Every status report must carry an explicit evidence level:
  - `EXECUTED`: Actually executed in this phase with concrete pass/fail outcomes, timings, or rendered outputs.
  - `READ`: Verified by source code inspection only.
  - `UNKNOWN`: Unverified or skipped.
- **Real test counts:** Never fabricate test outcomes. Always report actual test counts, durations, and pre-existing failures separately.

---

## 5. Phase Discipline & Autonomous Decision Protocol
- **Finish only the current phase:** Do not prematurely implement future phases (e.g., do not write R2 migration code in R1).
- **Decision logging:** When specifications are ambiguous, select the safest default, record it in `docs/REFACTOR_DECISIONS.md` with a one-line rationale, and proceed.
- **Manual tasks:** Append actions that only a human can perform (e.g., production deployment, physical mobile device audits) to `docs/MANUAL_TASKS.md`.
