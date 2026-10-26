# MANUAL_TASKS.md — Human Action Required

Running list of tasks that only a human can perform. Agents append items here and continue working without stopping.

---

- [x] **Playwright browser installation** — Chromium browser installed and verified for E2E testing.
- [x] **End-to-End Playwright test suite execution** — Full Playwright E2E suite executed against the production build (`next build && next start`), verifying accessibility, materials ingestion, study paths, full learning journey, backup/restore, review queues, and keyboard/mobile interactions.
- [x] **Obtain and configure `GEMINI_API_KEY` locally** — Added to `.env.local` for local execution and development.
- [x] **Push code to Git provider** — Pushed to `https://github.com/georgybenoy/memoir.ai.git` on `main` branch.
- [ ] **Vercel Production Deployment**:
  1. Go to the [Vercel Dashboard](https://vercel.com/new).
  2. In the Vercel dashboard, click **"Add New Project"** and import the repository.
  3. Framework Preset: **Next.js** (detected automatically).
  4. Root Directory: `./`
  5. Build Command: `next build`
  6. Output Directory: `.next`
  7. In **Environment Variables**, add:
     - `GEMINI_API_KEY`: `<Your-Google-AI-Studio-API-Key>` (marked Sensitive / Encrypted)
     - `GEMINI_MODEL`: `gemini-3.8-flash`
     - `LOG_LEVEL`: `info`
  8. Click **Deploy**.
- [ ] **Post-Deployment Verification Checklist**:
  1. Open `https://<your-project>.vercel.app/api/health` — confirm response:
     ```json
     { "status": "ok", "aiConfigured": true, "defaultModel": "gemini-3.8-flash" }
     ```
  2. Open `https://<your-project>.vercel.app/` — verify marketing landing page renders with zero console errors and clean layout.
  3. Click "Start learning" — enter `/app` workspace without login or authentication barriers.
  4. Navigate to `/app/settings` — confirm Gemini AI status displays "Configured & Ready" (green badge).
  5. Upload a sample note (`.txt` or `.pdf`) and click "Analyze notes" — verify concept extraction works with your live Gemini key.
  6. Open developer tools Console and Network tabs — verify:
     - Zero `dangerouslySetInnerHTML` warnings
     - Zero `NEXT_PUBLIC_GEMINI_API_KEY` in window or source scripts
     - CSP headers active and reporting zero blocked scripts.
- [ ] **Real-device testing** — Test on physical mobile devices (iOS Safari, Android Chrome) for touch interaction, virtual keyboard behaviour, and IndexedDB persistence.
- [ ] **Provider-side Quota & Budget Alerts** — Configure spending alerts in Google Cloud / Google AI Studio dashboard (e.g. $5 / $25 thresholds) to guard against unexpected usage.
- [ ] **Platform Edge Firewall Rules** — In Vercel Project Settings → Security / Firewall, consider configuring standard rate limiting or geo-blocking if deploying to public environments.
- [ ] **Optional self-hosted ONNX model assets for air-gapped environments** — The embedding pipeline defaults to downloading `all-MiniLM-L6-v2` ONNX quantized files from Hugging Face hub with browser cache persistence (`env.useBrowserCache = true`). If air-gapped offline use is required, place model assets in `public/models/all-MiniLM-L6-v2` and set `localModelPath` in config.
- [ ] **Verify In-App Review Notifications in target browser** — Open Settings → Spaced Review Reminders, click "Enable Review Notifications", verify that the browser permission prompt triggers only upon user click, and observe the honest limitation disclaimer regarding closed browser tabs.
- [ ] **Test browser storage persistence on target browser** — In Settings → Storage Status & Health, click 'Ask the browser to keep this data' to test `navigator.storage.persist()` on physical desktop and mobile browsers, noting browser-specific auto-grant vs prompt behavior.
- [ ] **Physical Mobile Browser Workflow Audit (Phase R5/R6)** — Test touch targets, virtual keyboard scrolling behavior, and screen reader announcements for the guided 4-step stepper on physical iOS Safari and Android Chrome devices.
- [ ] **Phase R2 Backup Export/Import verification with legacy user backups** — Verify that real user backups created under schema v1 import into the upgraded schema v2 workspace on physical devices and render synthesized learning units properly.
- [ ] **Phase R3 Deep Link & Back/Forward Browser Cache Audit** — Verify that browser back/forward history navigation between `/learn/[materialId]/organise`, `/learn/[materialId]/mode`, and `/learn/[materialId]/session/[sessionId]` preserves unsaved draft state smoothly across physical Safari and Firefox browsers.
- [ ] **Phase R4 Live AI Model Evaluation & Spaced Repetition Scheduling Audit** — On a deployment with live Gemini API keys (`GEMINI_API_KEY`), execute a multi-turn Study conversation and a Recall question evaluation session to verify that the Gemini API returns valid structured evaluations under production conditions, that the fallback evaluator is not inadvertently triggered, and that newly scheduled SM-2 reviews correctly populate the Revision queue on the following calendar day.
- [ ] **Phase R5 Physical Device Safe-Area & High-Contrast Audit** — On physical devices (e.g. iPhone with Dynamic Island / home bar, Android gesture navigation), verify that the `.safe-bottom` padding cleanly separates the action footer and on-screen keyboard from device hardware in landscape and portrait modes.
- [ ] **Phase R5b Cross-Browser View Transitions & Color Appearance Audit** — Verify the circular ripple animation on desktop Chromium browsers, check Safari 18+ View Transitions support vs legacy Safari fallback cross-fade, and inspect OLED dark/light theme contrast and readability under direct sunlight and low-light environments.
- [ ] **Phase R6 Live-Gemini Smoke Test Execution (Opt-In & Billable)** — To run the optional live Gemini end-to-end smoke test against the live Google Gemini API (which consumes API quota and incurs billable usage), execute:
  ```powershell
  $env:RUN_LIVE_GEMINI="true"
  $env:GEMINI_API_KEY="<Your-Real-Gemini-Key>"
  npx playwright test tests/e2e/r6-verification.spec.ts -g "Live Gemini"
  ```
  Confirm live structured concept extraction and rubric evaluations against Google AI Studio servers.
- [ ] **Phase R6 Physical Device Stepper and Virtual Keyboard Verification** — On physical iOS Safari and Android Chrome devices, perform the First-Time Learner (Scenario 1) and Recall Evaluation (Scenario 2) flows to confirm that opening the on-screen virtual keyboard does not obscure the answer textarea, that tap targets meet the 44×44px touch criterion, and that browser tab suspension does not clear IndexedDB draft state.
- [ ] **Step 4 Learning-Session UI Live Gemini Interactive Audit** — With a real `GEMINI_API_KEY` set in `.env.local` or on Vercel:
  1. Open a study session in Step 4 (`/learn/[materialId]/session/[sessionId]`).
  2. Verify that the AI tutor delivers real-time Socratic dialogue with varied avatar expressions.
  3. Use the "Explain differently" dropdown to test `Analogy`, `Example`, and `Simplify` with the live model.
  4. In Recall mode, generate a practice question, submit an answer, and verify that live rubric scores and semantic evaluation are returned.
  5. Verify that network disconnect cleanly triggers the "Tutor explanation unavailable" banner and offers stored canonical fallback.
- [ ] **Pomodoro Timer Audio Chime & Browser Notification Verification on Physical Devices**:
  1. Open a Study session in Step 4 on a physical desktop browser (Chrome/Edge, Safari, Firefox) and mobile phone (iOS Safari, Android Chrome).
  2. In the Pomodoro popover, toggle "Soft chime" ON and start a 1-minute test session. Verify the Web Audio sine chime plays gently on completion after user gesture, and fails silently without console exceptions if audio context is blocked.
  3. Toggle "Browser notification" ON: confirm browser native permission prompt triggers only when the checkbox is toggled. Switch to a different tab; verify the native browser notification fires when time expires while the document is hidden.
  4. Test laptop sleep/wake behavior: start a 5-minute focus timer, close the laptop lid for 7 minutes, and reopen. Verify the timer correctly detects elapsed clock time upon wake, transitions directly to the completed state with the message *"Your focus session finished while you were away"*, and does NOT fire a retroactive alarm sound.




