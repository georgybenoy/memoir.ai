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

