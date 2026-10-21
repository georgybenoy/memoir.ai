# AGENTS.md — EduMentor Permanent Project Rules

All agents working on this repository must follow these rules at all times.

---

## Sources of Truth

| Priority    | Document                                                     |
| ----------- | ------------------------------------------------------------ |
| 1 (highest) | `PRD.md` — behaviour, requirements, acceptance criteria      |
| 2           | `TECH_STACK.md` — technology choices, architecture           |
| 3           | `DESIGN_DOC.md` — visuals, layout, colour tokens, typography |

Where `DESIGN_DOC.md` and `PRD.md` disagree on visual tokens (palette, fonts, colours), `DESIGN_DOC.md` wins. PRD §4.2's cyan is retained as the `accent-cyan` token. Target WCAG 2.2 AA (superset of PRD's 2.1 AA).

---

## Stack and Hard Constraints

- **Framework:** Next.js App Router with strict TypeScript.
- **Styling:** Tailwind CSS.
- **UI primitives:** shadcn/ui + Radix UI.
- **Icons:** Lucide React.
- **Client state:** Zustand.
- **Local persistence:** IndexedDB via `idb`.
- **Validation:** Zod.
- **AI SDK:** `@google/genai` — imported only from `server-only` modules; never in browser code.
- **PDF extraction:** `pdfjs-dist`.
- **Embeddings:** `@huggingface/transformers` with quantized `all-MiniLM-L6-v2` ONNX in a Web Worker, lazy-loaded.
- **Unit/component tests:** Vitest + Testing Library.
- **E2E tests:** Playwright.
- **Lint/format:** ESLint + Prettier.
- **Package manager:** npm (never switch mid-project).
- **Deployment:** Vercel.

### Forbidden

- No auth, no external DB, no server persistence, no Redis/KV, no analytics.
- `GEMINI_API_KEY` is server-only. Never prefix it `NEXT_PUBLIC_`.
- Never use `NEXT_PUBLIC_GEMINI_API_KEY`.

---

## Architecture Rules

1. Domain logic lives in `src/features/*` as pure TypeScript with **no React imports**.
2. Components call feature services; services call repositories and the API client.
3. API route handlers never import browser-only modules.
4. The Gemini SDK (`@google/genai`) is imported only from a module marked with `import 'server-only'`.
5. Keep provider initialisation in a single server-only module (`src/lib/ai/gemini.ts`).

---

## Time and IDs

- All time access goes through `src/lib/utils/clock.ts` (injectable) so tests can control time.
- All ID generation goes through `src/lib/utils/id.ts`.

---

## Security Rules

- Render all note/model/user text through a safe renderer. Never use `dangerouslySetInnerHTML`. No raw HTML in markdown rendering.
- Treat uploads, AI output, and imported backups as **untrusted** input.
- Validate everything with Zod.
- Never log note text, student answers, or secrets.
- Set secure response headers and CSP where compatible.

---

## Honesty Rules

- Never claim cross-device sync, permanent storage, guaranteed closed-app reminders, or scientific validity of scores.
- The UI must report the evaluation mode that actually ran (hybrid, judge-only, or fallback).
- Never claim a test passed unless it was actually executed.
- Do not fabricate testimonials, user metrics, or performance claims.
- Do not describe IndexedDB as a secure vault.

---

## User Content Preservation

- Never silently drop user content (uploads, answers, review state).
- On any failure, preserve content and show a recoverable state.
- On IndexedDB `QuotaExceededError`, stop the write, warn the user, offer export/cleanup; do not claim data was saved.

---

## Dependency Policy

- Use current stable versions of all dependencies.
- **Verify** the installed major version's docs/changelog before using an API from memory — Next.js, Tailwind, shadcn, Zod, `@google/genai`, and `pdfjs-dist` all change frequently.
- Pin versions in `package.json` and commit `package-lock.json`.
- Avoid unnecessary dependencies.
- Do not install a dependency merely because it appeared in an original Python report.

---

## Phase Discipline

- Finish only the current phase. Do not start the next one.
- No giant unverified code dumps.
- Each phase ends with executed tests and a Phase Report.

---

## Phase Report Format

Every phase must end with a report containing:

1. **What was built** — summary of deliverables.
2. **Commands run** — every command with real pass/fail results.
3. **Behaviours verified** — what was confirmed working.
4. **Behaviours NOT verified or skipped** — explicit list.
5. **Known issues** — outstanding problems.
6. **Manual tasks** — appended to `docs/MANUAL_TASKS.md`.
7. **Next phase** — what comes next.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
