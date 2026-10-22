# EduMentor

> **A browser-local, private-first Socratic learning companion.**  
> Built with Next.js App Router, strict TypeScript, Tailwind CSS, IndexedDB, and Google Gemini 2.5 Flash.

EduMentor transforms lecture notes, course slides, and reading materials into structured prerequisite concept graphs, interactive Socratic dialogues, active recall questions, and SuperMemo SM-2 spaced repetition reviews — entirely within your browser, without user accounts, tracking, or cloud databases.

---

## Architecture Overview

EduMentor follows a strict **zero-server-persistence** architectural model. All study materials, extracted concepts, mastery states, and revision schedules are stored locally in your browser's IndexedDB. Server-side code acts strictly as an ephemeral, stateless gateway to Google Gemini.

```
+-------------------------------------------------------------------------+
|                              USER BROWSER                               |
|                                                                         |
|  [ PDF / TXT / MD ]                                                     |
|          |                                                              |
|          v                                                              |
|  +--------------------+       +-------------------+                     |
|  | pdfjs-dist / Text  | ----> | Provenance Chunks |                     |
|  +--------------------+       +-------------------+                     |
|                                         |                               |
|                                         v                               |
|  +--------------------+       +-------------------+                     |
|  | UI Components      | <---> | Feature Services  |                     |
|  | (shadcn / Radix)   |       | (DAG, SM-2, State)|                     |
|  +--------------------+       +-------------------+                     |
|          ^                              |                               |
|          |                              v                               |
|  +--------------------+       +-------------------+                     |
|  | Zustand Store      | <---> | IndexedDB (idb)   |                     |
|  +--------------------+       | `edumentor-local` |                     |
|                               +-------------------+                     |
+-----------------------------------------|-------------------------------+
                                          | HTTPS JSON (Excerpts only)
                                          v
+-------------------------------------------------------------------------+
|                        VERCEL SERVERLESS EDGE / NODE                    |
|                                                                         |
|  /api/ai/extract-concepts      /api/ai/explain-concept                  |
|  /api/ai/generate-question     /api/ai/evaluate-answer                  |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Server-Only Gemini Gateway (`@google/genai`, Rate Limits, Schema) |  |
|  +-------------------------------------------------------------------+  |
|                                   | Server-Side Only                    |
|                                   v                                     |
|                        Google Gemini 2.5 Flash API                      |
+-------------------------------------------------------------------------+
```

---

## Honest Product Disclosures & Limitations

In accordance with our permanent design rules, EduMentor makes zero false claims regarding storage, scoring, or synchronization:

1. **No Cloud Synchronization**: EduMentor has no user accounts, passwords, or central cloud database. Your study notes, concept graphs, and attempt history reside strictly inside this browser profile's IndexedDB (`edumentor-local`). Your data does not sync across devices or browsers automatically.
2. **Browser Storage Quotas**: Browser storage is variable and managed by your operating system and browser disk policies. Clearing site data or encountering browser storage eviction will delete local learning records unless you have exported a safety backup.
3. **Best-Effort Spaced Review Reminders**: Concept review scheduling is computed client-side via SuperMemo SM-2. Browser notifications are best-effort; *they cannot wake closed browsers or run without the browser environment active*.
4. **Heuristic Evaluation**: The hybrid evaluation engine combines local semantic vector comparison with Gemini judge rubric analysis. Scores represent heuristic formative guidance and should not be treated as scientifically validated academic psychometrics.

---

## Prerequisites & Setup

### Requirements

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Google Gemini API Key**: Obtain a key from [Google AI Studio](https://aistudio.google.com/)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/your-username/edumentor.git
cd edumentor

# 2. Install dependencies
npm install

# 3. Configure server environment
cp .env.example .env.local
```

Edit `.env.local` with your Gemini API key:
```bash
GEMINI_API_KEY="AIzaSyYourActualKeyHere"
GEMINI_MODEL="gemini-3.8-flash"
LOG_LEVEL="info"
```

> **Security Rule**: Never prefix `GEMINI_API_KEY` with `NEXT_PUBLIC_`. The key must remain strictly server-side.

---

## Development & Production Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server on `http://127.0.0.1:3000` |
| `npm run build` | Compile optimized production build using Turbopack |
| `npm start` | Run production server on `http://127.0.0.1:3000` |
| `npm run lint` | Execute ESLint across all source and test files |
| `npm run typecheck` | Run TypeScript typechecker (`tsc --noEmit`) |
| `npm test` | Run Vitest unit and integration test suites |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run test:e2e` | Run Playwright E2E test suite against production build |
| `npm run check:bundle` | Scan client bundles to verify zero secrets or `@google/genai` imports |
| `npm run check:persistence` | Verify zero server databases, cloud KV, or filesystem writes |
| `npm run check-contrast` | Verify WCAG 2.2 AA token color contrast ratios |
| `npm run verify` | Complete verification chain (`lint` + `typecheck` + `test` + `check:bundle` + `check:persistence` + `check-contrast` + `build` + `test:e2e`) |

---

## Backup & Restore Guide

Because EduMentor does not maintain a server database, you are in complete control of your learning data:

### Exporting Data
1. Navigate to **Data & Settings** (`/app/settings`).
2. Click **Export backup file**.
3. A verified JSON envelope named `edumentor-backup-YYYY-MM-DD.json` will download to your device.
4. Backups include all 14 stores: documents, chunks, concepts, dependencies, study sessions, path items, recall questions, attempts, mastery states, spaced repetition schedules, messages, and events.

### Restoring Data
1. In **Data & Settings**, select or drop your backup JSON file into **Import / Restore Backup**.
2. A preview dialog inspects document count, concept count, and schema validity.
3. Select your desired conflict policy:
   - **Keep Local**: Preserves existing records; only imports new unique records.
   - **Prefer Imported**: Updates existing records with imported versions.
   - **Import as Copy**: Automatically re-keys imported documents and concepts to coexist.
   - **Replace All**: Clears local data and replaces with backup.
4. If choosing **Replace All**, EduMentor automatically creates a safety rollback snapshot. If anything goes wrong, click **Restore previous data** to immediately revert.

---

## Security & Privacy Architecture

- **Zero Client Secrets**: `scripts/check-no-secrets-in-client.mjs` verifies that no API keys or Google GenAI SDK imports ever reach the client bundle.
- **Zero Server-Side User Persistence**: `scripts/check-no-server-persistence.mjs` verifies that no external databases, KV caches, or disk file writes exist in route handlers.
- **Content Security Policy (CSP)**: Hardened headers with `frame-ancestors 'none'`, `object-src 'none'`, and explicit worker/WASM directives for local ONNX embeddings and PDF.js.
- **Safe Rendering**: All student answers, tutor dialogues, and markdown content are sanitized through React safe elements. `dangerouslySetInnerHTML` is permanently prohibited.
- **Quota Resilience**: Storage quota exceptions (`QuotaExceededError`) automatically abort transactions, preserve unsaved drafts, present a warning banner, and direct the user to export/cleanup. Work is never silently discarded.

---

## Deployment to Vercel

EduMentor is designed for effortless deployment to Vercel serverless infrastructure:

1. **Push to GitHub**: Commit your repository to a private or public GitHub repo.
2. **Import Project into Vercel**:
   - Framework Preset: **Next.js**
   - Root Directory: `./`
   - Build Command: `next build`
   - Output Directory: `.next`
3. **Configure Environment Variables**:
   - `GEMINI_API_KEY`: Set your Google Gemini API key as a production/preview secret.
   - `GEMINI_MODEL`: `gemini-3.8-flash`
   - `LOG_LEVEL`: `info`
4. **Deploy**: Click Deploy.
5. **Verify**: Check `https://your-deployment.vercel.app/api/health` to confirm gateway health.

For detailed pre-flight checks and post-deployment verification steps, see [`docs/MANUAL_TASKS.md`](docs/MANUAL_TASKS.md).

---

## Troubleshooting

- **"API Key Not Configured (Offline Fallback)" in Settings**: Ensure `GEMINI_API_KEY` is defined in `.env.local` (local) or Vercel Environment Variables (production). Restart the server after editing env files.
- **Scanned or Image-Only Document Error**: EduMentor extracts digital text layers. Scanned documents or photo-based PDFs lack character streams. Use OCR software to add a digital text layer before uploading.
- **Quota Exceeded Error**: Your browser's IndexedDB disk allocation is full. Go to `/app/settings`, click **Export backup file**, and use **Clear all local data** to free space before re-importing select notes.
