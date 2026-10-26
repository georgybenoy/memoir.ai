# REFACTOR_DECISIONS.md — Refactor Decision Log

Running architectural decision record for the EduMentor workflow refactor. Each entry records the decision and a one-line rationale.

---

## D-R1-001: Safety checkpoint created via local git tag `pre-workflow-refactor`
Created local tag `pre-workflow-refactor` on commit `45c5762` on branch `main` without pushing upstream.
**Rationale:** Preserves exact pre-refactor state for zero-risk rollbacks while adhering to the hard constraint never to push to remotes.

## D-R1-002: Isolation of pre-existing splash screen test failures in baseline audit
Documented 5 pre-existing Playwright test failures caused by `splash-screen.tsx` (missing `aria-label`/`aria-labelledby` on `<div role="progressbar">` and strict locator collision on `EduMentor` title during ~4.5s load hold) in `docs/BASELINE.md` without modifying application code in Phase R1.
**Rationale:** Phase R1 strictly forbids application code modifications; separating pre-existing test failures ensures they are not mistaken for refactor regressions in future phases.

## D-R1-003: 4-Step Workflow conceptual model & boundary specification
The target 4-step workflow maps to: (1) Add Material (`/app/workflow/add` or step 1), (2) Organise Material (`/app/workflow/organise` or step 2), (3) Choose Learning Mode (`/app/workflow/mode` or step 3), (4) Learning Session (`/app/workflow/session` or step 4).
**Rationale:** Directly implements the requested guided learning experience without requiring users to manually coordinate separate tabs for ingestion, graph exploration, and session initialization.

## D-R1-004: Additive schema migration strategy (Version 2) in Phase R2
Retain all 14 existing schema v1 object stores unchanged and introduce an additive `learningUnits` object store and optional `learningUnitId` foreign key indexes in Schema Version 2.
**Rationale:** Guarantees zero data loss for existing users, allows old databases to upgrade deterministically, and provides a clean container linking materials, concepts, and sessions.

## D-R1-005: Dual-environment seed data generation script in `scripts/seed-data.ts`
Implement `scripts/seed-data.ts` with pure data factory functions compatible with both Node.js (via `fake-indexeddb` and JSON backup envelope) and in-browser execution.
**Rationale:** Enables headless automated regression testing for migrations (R2) while allowing direct browser evaluation in E2E tests.

---

## D-R2-001: Schema Version 2 introducing `learningUnits`, `processing`, and `materialFiles` stores
Added three object stores with compound indexes and deterministic backward-compatible legacy record backfilling.
**Rationale:** Ensures materials are processed and stored once, providing stable unit grouping without breaking legacy databases.

## D-R2-002: Dual cryptographic hashing for duplicate detection
Computed SHA-256 over raw file bytes (`fileHash`) and normalized extracted text (`contentHash`).
**Rationale:** Distinguishes exact byte-for-byte duplicates from filename collisions with different content.

---

## D-R3-001: Next.js App Router hierarchy for guided workflow
Created `/learn` (workflow home), `/learn/new` (Step 1), `/learn/[materialId]/organise` (Step 2), `/learn/[materialId]/mode` (Step 3), and `/learn/[materialId]/session/[sessionId]` (Step 4).
**Rationale:** Reuses Next.js App Router with URL deep-linking and state restoration across page reloads.

## D-R3-002: Schema Version 3 introducing `workflowState` store
Added `workflowState` IndexedDB store keyed by `materialId` persisting only selection preferences and mode choice.
**Rationale:** Keeps transient navigation state in memory while persisting user preferences in IndexedDB without polluting learning records.

## D-R3-003: Pure function step derivation (`deriveStepForMaterial`)
Derive the valid step and redirection targets from real persisted material processing state and session state.
**Rationale:** Guarantees deep links and refreshes land on the correct step without relying on React component state or sessionStorage.

## D-R3-004: Boundary-validated `LearningLaunchContext` contract
Defined `LearningLaunchContext` with strict validation that material exists, selected units belong to material, and mode is valid.
**Rationale:** Decouples workflow orchestration from mode execution and enforces strict boundary validation before launching Step 4.

## D-R3-005: Adapter-based Step 4 Session Host
Host the existing `useLearningSession` mode engine inside a unified session header without rebuilding mode internals in R3.
**Rationale:** Respects phase discipline by leaving mode engine rewrites to R4 while providing unified session controls (Pause, Exit, Finish).

## D-R3-006: Non-404 legacy route redirects
Mapped `/app/tutor`, `/app/review`, `/app/materials`, `/app`, and `/app/path` to the corresponding workflow routes preserving query parameters.
**Rationale:** Backward compatibility for bookmarks and links without broken routes.

## D-R3-007: Honest Revision zero-due handling
When Revision has 0 concepts due today, Step 3 displays an honest explanation and offers explicit buttons for "Study Instead" or "Recall Instead".
**Rationale:** Enforces Honesty Rules by never silently auto-switching learning modes.

---

## D-R4-001: Unified Session Controller with Modular Mode Interface
Created `ModeModule` interface (`id`, `getAvailability`, `start`, `resume`, `getProgress`, `buildSummary`) and implemented separate modules (`study-mode.ts`, `recall-mode.ts`, `revision-mode.ts`) orchestrated by `useSessionController` managing `sessionId`, `materialId`, `selection`, `status` (`active | paused | completed | abandoned`), `progress`, and draft answers with stale-request guards (`activeRequestIdRef`).
**Rationale:** Eliminates giant monolith files holding mixed tutoring, question, and review logic while preserving exact state machines and preventing race conditions or ghost updates from previous concepts/sessions.

## D-R4-002: Question Reuse Policy for Recall Mode
Implemented deterministic reuse policy in `src/features/modes/question-policy.ts`: a cached question is reused only when its `contentVersion` matches the concept's version, was not asked in the last N=3 attempts, is not asked consecutively, and prioritizes unanswered questions before generating fresh grounded questions.
**Rationale:** Minimizes redundant LLM API calls and avoids frustrating repetitions while ensuring content changes immediately invalidate stale questions.

## D-R4-003: Pure Database Derivation for Session Completion
Session completion summaries are computed by querying real IndexedDB records (`studySessions`, `recallAttempts`, `concepts`, `masteryStates`, `spacedRepetitionStates`, `learningUnits`) for the given `sessionId` via `buildSessionSummaryFromDatabase`, producing zero hardcoded or in-memory-only numbers.
**Rationale:** Guarantees honest user reporting that persists across reloads and device storage re-opens without fabricating metrics.

## D-R4-004: Explicit Distinction Between Revision Mode and REVISION_DUE Machine State
Documented and separated "Revision Mode" (the user-initiated SM-2 spaced repetition queue presenting overdue and due-today cards) from `REVISION_DUE` (the 13-state Socratic conversation machine's remedial state triggered on weak answers during a study/recall loop).
**Rationale:** Prevents semantic collisions in state machine transitions and ensures SM-2 intervals update only upon real review answer evaluations.

## D-R4-005: Atomic Transaction for Attempt, Mastery, and SM-2 Schedules
Preserved atomic IndexedDB writes across `recallAttempts`, `masteryStates`, and `spacedRepetitionStates` in `saveAttemptAndMasteryAtomic`, ensuring that `materialId`, `unitId`, and `sessionId` are linked consistently across all persistence stores.
**Rationale:** Prevents partial state updates where an attempt is recorded without advancing mastery or scheduling the next spaced repetition interval.

---

## D-R5-001: WCAG 2.2 AA Contrast Polish on Dark Navy Theme
Replaced low-contrast `text-[var(--primary)]` (`#7c3aed`) on dark surfaces (`#07091B`, `#0D1028`, `#131735`) with high-contrast tokens (`text-[var(--text-primary)]`, `text-[var(--accent-cyan)]`, `text-purple-200`) across stepper indicators, pipeline stages, unit badges, mode alternatives, and completion summary tags. All pairs verified >= 4.5:1 (up to 18:1).
**Rationale:** Satisfies WCAG 2.2 AA (Criterion 1.4.3) without departing from the dark navy / violet / blue / cyan design language.

## D-R5-002: Minimum 44×44px Touch Targets on Mobile Viewports
All interactive controls across Steps 1 through 4 (file browse button, confirm upload, unit checkboxes, select whole material toggle, continue button, mode launch CTAs, finish/pause/exit session controls, completion navigation) enforce minimum `min-h-[44px]` and `min-w-[44px]` with safe-area spacing (`.safe-bottom`).
**Rationale:** Ensures usability on mobile touchscreens and compliance with WCAG 2.2 Target Size (Criterion 2.5.8).

## D-R5-003: WCAG 2.5.3 (Label in Name) Stepper Link Alignment
Aligned completed step link accessible names (`aria-label={`Step ${stepNum}: ${stepInfo.shortTitle} (Completed, click to revisit)`}`) with visible link content (`Step ${stepNum}: ${stepInfo.shortTitle}`), eliminating accessible name mismatches in screen reader auditing.
**Rationale:** Strict compliance with WCAG 2.5.3 (Label in Name) so voice-control and screen-reader users can activate links by speaking visible text.

## D-R5-004: Determinate vs Neutral Activity Indicators in Pipeline Stages
In Step 2 (Organise), determinate progress bars are strictly bound to real chunk/batch counts (`currentBatch` / `totalBatches`). Abstract pipeline stages (`INGESTION`, `ANALYZING`, `UNITS_BUILT`) use neutral spinner and checkmark icons with label + icon indicators, eliminating fake progress animations.
**Rationale:** Enforces Honesty Rules: no fake percentage animations or fabricated progression speeds.

## D-R5-005: Visual Viewport and Mobile Safe Area Handling in Learning Area
Integrated `env(safe-area-inset-bottom)` and `overflow-x: hidden; max-width: 100vw;` in global styling and quiet session layout, preventing on-screen keyboard clipping and eliminating horizontal overflow across all responsive viewports (320px to 1440px).
**Rationale:** Guarantees that the composer area remains distraction-free and usable with mobile on-screen keyboards.

---

## D-R5b-001: Zero-Dependency Pure CSS & Custom Context Theming System
Built a standalone theme subsystem (`src/features/theme/`) providing `useTheme()` with mode resolution (`light | dark | system`), synchronous first-paint inline initialization script (`<script id="edumentor-theme-init">` in `layout.tsx`), and cross-tab synchronization via `window.addEventListener('storage')`, rejecting `next-themes`.
**Rationale:** Keeps the bundle lean, eliminates external framework dependencies, and enables atomic DOM attribute synchronization (`data-theme="light|dark"` and CSS `color-scheme`) without hydration mismatch warnings (`suppressHydrationWarning`).

## D-R5b-002: View Transitions API Circular Ripple Reveal (`clip-path`)
Engineered circular expanding reveal for theme transitions leveraging `document.startViewTransition()`:
- CSS Animation: `clip-path: circle(0 at var(--ripple-x) var(--ripple-y))` to `circle(var(--ripple-r) at var(--ripple-x) var(--ripple-y))` applied to `::view-transition-new(root)` with `::view-transition-old(root)` frozen underneath (`animation: none; mix-blend-mode: normal;`).
- Duration and Curve: 650ms with `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out quintic).
- Coordinate Computation: Origin is click/tap coordinates `(clientX, clientY)` or center of toggle for keyboard triggers. Radius is hypotenuse distance to farthest viewport corner (`Math.hypot(max(x, w - x), max(y, h - y))`).
- Fallbacks: Browser without View Transitions receives temporary `.theme-transitioning` 250ms cross-fade. `prefers-reduced-motion` and workspace `reducedMotion: true` switch instantaneously without starting a view transition.
- Debounce & Concurrency: Rapid toggles cancel previous running transitions via `activeTransition.skipTransition()`.
**Rationale:** Delivers a state-of-the-art 60fps radial reveal without jank or DOM duplication, while strictly respecting accessibility motion preferences.

## D-R5b-003: WCAG 2.2 AA Contrast Compliance Across Dark and Light Semantic Token Palettes
Designed matching Light theme with cool off-white canvas (`#F8FAFC`), crisp elevated surfaces (`#FFFFFF`), low-contrast borders (`#E2E8F0`), and violet brand identity (`#6D28D9`), while preserving Dark Navy tokens (`#07091B`, `#0D1028`, `#131735`). All 36 semantic token pairs achieve WCAG 2.2 AA compliance (≥ 4.5:1 for standard text, ≥ 3.0:1 for large text and UI boundaries). Destructive buttons utilize dedicated high-contrast token `--danger-cta: #dc2626` (5.30:1 dark, 4.83:1 light).
**Rationale:** Retains EduMentor's violet/navy/cyan identity while providing an equally accessible and comfortable light workspace.

## D-R5b-004: Dual-Tier Theme Preference Persistence (LocalStorage & IndexedDB Envelope)
Theme preferences are written synchronously to `localStorage` for zero-flash first-paint execution and mirrored into IndexedDB workspace preferences (`workspace.preferences.theme`). On JSON backup export, the current theme is packaged in the backup envelope; on import, `handleApplyImport` immediately applies the restored theme to `localStorage` and the DOM.
**Rationale:** Respects storage hierarchy by providing instant first-paint reading from local storage while ensuring user theme choices are fully portable across backup export/import cycles without putting learning data in localStorage.



