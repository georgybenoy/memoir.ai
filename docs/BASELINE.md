# BASELINE.md — Pre-Refactor Baseline Test & Audit Results

**Date:** 2026-10-25  
**Checkpoint Tag:** `pre-workflow-refactor` (Commit: `45c5762`)  
**Node Version:** v22+  
**Operating System:** Windows (PowerShell)  
**Package Manager:** npm (pinned via `package-lock.json`)

---

## 1. Executive Summary Table

| Check / Command | Command Executed | Duration | Status | Summary / Real Counts |
| :--- | :--- | :--- | :--- | :--- |
| **Dependency Tree** | `npm ls --depth=0` | 2,618 ms | **PASS** | Exit 0; all top-level dependencies resolved cleanly |
| **Code Linting** | `npm run lint` | 141,646 ms | **PASS** | Exit 0; 0 errors, 0 warnings across full codebase |
| **TypeScript Check** | `npm run typecheck` | 7,935 ms | **PASS** | Exit 0; 0 type errors (`tsc --noEmit`) |
| **Unit & Integration** | `npm run test` | 68,821 ms | **PASS** | Exit 0; 47 test files passed (47/47), 422 tests passed (422/422) |
| **Client Bundle Security** | `npm run check:bundle` | 1,020 ms | **PASS** | Exit 0; 38 client files scanned; 0 secrets / 0 `@google/genai` client imports |
| **Stateless Server Check** | `npm run check:persistence` | 980 ms | **PASS** | Exit 0; 0 database or auth packages detected; 100% stateless |
| **WCAG 2.2 AA Contrast** | `npm run check-contrast` | 1,054 ms | **PASS** | Exit 0; all 14 evaluated token pairs meet or exceed AA standards |
| **Production Build** | `npm run build` | 52,909 ms | **PASS** | Exit 0; all 18 routes compiled successfully with Turbopack |
| **End-to-End (E2E)** | `npm run test:e2e` | 82,649 ms | **PARTIAL** | 16 passed, 5 failed (all 5 pre-existing due to recent splash screen commits) |

---

## 2. Command-by-Command Detailed Outputs

### 2.1 Dependency Tree (`npm ls --depth=0`)
- **Duration:** 2,618 ms
- **Exit Code:** 0
- **Summary:** Verified all 45 production and development dependencies are installed and compatible without missing peer dependencies.

### 2.2 Code Linting (`npm run lint`)
- **Duration:** 141,646 ms (~2m 21s)
- **Exit Code:** 0
- **Tool:** ESLint 9.39.5 with `eslint-config-next` and `typescript-eslint`
- **Output:**
  ```text
  > edumentor@0.1.0 lint
  > eslint .
  ```
- **Result:** Clean pass with zero errors and zero warnings.

### 2.3 TypeScript Static Typecheck (`npm run typecheck`)
- **Duration:** 7,935 ms (~7.9s)
- **Exit Code:** 0
- **Tool:** TypeScript 5.9.3 (`tsc --noEmit`)
- **Result:** 0 type diagnostics. Full strict mode compliance across all domain, feature, UI, and test modules.

### 2.4 Unit & Integration Tests (`npm run test`)
- **Duration:** 68,821 ms (~68.8s)
- **Exit Code:** 0
- **Tool:** Vitest 3.2.7 with JSDOM environment
- **Summary:**
  - **Test Files:** 47 passed (47)
  - **Tests:** 422 passed (422)
  - **Core Tested Subsystems:**
    - `ingestion-extract.test.ts` (5 tests): PDF extraction, encrypted PDF rejection, multi-page layout.
    - `ingestion-normalize-chunk.test.ts` (13 tests): Provenance slicing invariant across all fixtures.
    - `ai-gemini.test.ts` (13 tests): Retry with exponential backoff on 503, JSON 1-shot repair loop.
    - `dependency-graph.test.ts` (20 tests): Tarjan cycle breaking, Kahn topological sort, stable tie-breaking.
    - `backup.test.ts` (16 tests): Prototype-pollution security checks, rollback export safety.
    - `resilience-quota.test.ts` (8 tests): `QuotaExceededError` detection and transaction rollback across all 5 write paths.
    - `conversation-machine.test.ts` (23 tests): 13-state transitions, recovery state resolvers, safe error handling.
    - `sm2.test.ts` (16 tests): Wozniak interval updates, easiness factors, retention calculations.
    - `scoring.test.ts` (18 tests): Deterministic rubric weighting, quality grade calibration.
    - `hybrid-evaluator.test.ts` (12 tests): ONNX embedding similarity + Gemini rubric evaluation.
    - `avatar.test.ts` (11 tests): Deterministic expression state mapping for all 11 pedagogical emotions.

### 2.5 Security, Persistence & Contrast Checks
- **Client Bundle (`npm run check:bundle`):**
  - Scanned 38 client files. Zero secrets, `GEMINI_API_KEY`, `@google/genai`, or `AIza` keys found in client bundles.
- **Server Persistence (`npm run check:persistence`):**
  - Verified package manifests and server routes. Zero external DB, Redis, KV, or auth libraries found.
- **Color Contrast (`npm run check-contrast`):**
  - Text-primary on background: 18.19:1 (threshold >= 4.5:1)
  - Text-secondary on background: 10.30:1 (threshold >= 4.5:1)
  - Accent-blue on background: 7.76:1 (threshold >= 4.5:1)
  - Accent-cyan on background: 13.62:1 (threshold >= 4.5:1)

### 2.6 Production Build (`npm run build`)
- **Duration:** 52,909 ms (~52.9s)
- **Exit Code:** 0
- **Tool:** Next.js 16.4.2 (Turbopack)
- **Compiled Routes (18 total):**
  - `○ /` (Static marketing landing page)
  - `○ /_not-found` (Static 404 handler)
  - `ƒ /api/ai/evaluate-answer` (Dynamic AI route)
  - `ƒ /api/ai/explain-concept` (Dynamic AI route)
  - `ƒ /api/ai/extract-concepts` (Dynamic AI route)
  - `ƒ /api/ai/generate-question` (Dynamic AI route)
  - `ƒ /api/health` (Dynamic health probe)
  - `○ /app` (Static workspace dashboard)
  - `○ /app/materials` (Static materials management)
  - `○ /app/path` (Static concept map and DAG view)
  - `○ /app/progress` (Static mastery progress dashboard)
  - `○ /app/review` (Static spaced repetition review queue)
  - `○ /app/settings` (Static data settings and backup/restore)
  - `○ /app/tutor` (Static Socratic tutoring and recall session)
  - `○ /apple-icon.png` (Static asset)
  - `○ /icon.png` (Static asset)
  - `○ /privacy` (Static privacy policy)
  - `○ /settings` (Static direct settings route)

### 2.7 End-to-End Playwright Tests (`npm run test:e2e`)
- **Duration:** 82,649 ms (~1.3m)
- **Result:** 16 passed, 5 failed (Pre-existing baseline issues documented below)
- **Passing Tests (16):**
  1. `backup.spec.ts:10` — Triggers backup file download with dated filename.
  2. `backup.spec.ts:31` — Clear-data dialog cancels cleanly without dropping records.
  3. `backup.spec.ts:46` — Clear-data proceeds upon explicit user confirmation.
  4. `learning-journey.spec.ts:7` — **Complete end-to-end journey:** no-login access, note ingestion, concept extraction, path visualization, tutor answer/feedback cycle, persistence across reload, backup/restore round-trip, overdue SM-2 queue, mobile navigation, and keyboard skip-link navigation.
  5. `materials.spec.ts:13` — Uploads TXT, MD, and PDF documents with preview and persistence across reload.
  6. `materials.spec.ts:72` — Displays honest scanned-PDF error message when PDF lacks digital text layer.
  7. `materials.spec.ts:89` — Rejects disguised plain text file with `.pdf` extension (signature mismatch).
  8. `materials.spec.ts:101` — Confirms and deletes material with dependent chunks.
  9. `materials.spec.ts:124` — Extracts concepts with progress, displays concept cards, and allows inspecting excerpt provenance.
  10. `path.spec.ts:159` — Seeded session displays locked and available concepts correctly.
  11. `path.spec.ts:195` — Toggles to Graph view and displays custom SVG layered canvas with tier badges.
  12. `persistence.spec.ts:4` — Persists difficulty and reduced motion settings in IndexedDB across reloads.
  13. `workspace-shell.spec.ts:33` — Toggles sidebar collapse on desktop.
  14. `workspace-shell.spec.ts:49` — Toggles assistant panel visibility.
  15. `workspace-shell.spec.ts:67` — Adapts cleanly to mobile viewport with drawer navigation.
  16. `workspace-shell.spec.ts:89` — Supports keyboard skip link navigation.

---

## 3. Pre-Existing Baseline Failures (Separated from Regressions)

The 5 failing E2E tests are **pre-existing issues** stemming from recent commits `e75fe72` (*feat(splash)*) and `45c5762` (*tune(splash): increase loading screen duration to ~4.5s*). Because Phase R1 prohibits modifying application code, these issues are cataloged here for resolution in subsequent refactor phases:

1. **`tests/e2e/accessibility.spec.ts:5`** (*desktop landing page has zero critical or serious a11y violations*)
   - **Failure:** Axe-core violation: `aria-progressbar-name` (serious impact).
   - **Element:** `<div class="rounded-full overflow-hidden" role="progressbar" aria-valuenow="1" ...>`
   - **Root Cause:** The full-screen splash loader in `src/components/splash/splash-screen.tsx` (line 399) renders a `<div role="progressbar">` without an `aria-label` or `aria-labelledby`.
2. **`tests/e2e/accessibility.spec.ts:20`** (*desktop workspace shell has zero critical or serious a11y violations*)
   - **Failure:** Same `aria-progressbar-name` violation on the splash progress bar on `/app`.
3. **`tests/e2e/accessibility.spec.ts:35`** (*mobile workspace shell has zero critical or serious a11y violations*)
   - **Failure:** Same `aria-progressbar-name` violation on mobile `/app`.
4. **`tests/e2e/path.spec.ts:214`** (*has zero critical or serious WCAG 2.2 AA accessibility violations on /app/path*)
   - **Failure:** Same `aria-progressbar-name` violation on `/app/path`.
5. **`tests/e2e/workspace-shell.spec.ts:4`** (*renders full three-panel layout on desktop viewport*)
   - **Failure:** Strict mode locator violation: `getByText('EduMentor', { exact: true })` resolved to 2 elements.
   - **Elements:** (1) `<h1 class="font-extrabold select-none">EduMentor</h1>` in `splash-screen.tsx`, and (2) `<span class="text-base font-bold tracking-tight ...">EduMentor</span>` in `header.tsx`.
   - **Root Cause:** The ~4.5s duration of the splash animation means the splash brand heading is present in the DOM simultaneously with the header element when the test queries `getByText('EduMentor')`.

---

## 4. Baseline Sign-Off

The baseline proves that:
1. Core application architecture, logic, algorithms, and persistence are **100% operational**.
2. All 422 unit tests pass completely.
3. Production builds and linting pass with zero warnings.
4. The complete learning journey (ingest -> concept extraction -> study path -> recall attempt -> SM-2 -> backup/restore) passes in Playwright.
5. All future refactor phases will be evaluated against this baseline.
