# MANUAL_TASKS.md — Human Action Required

Running list of tasks that only a human can perform. Agents append items here and continue working without stopping.

---

- [ ] **Obtain and configure `GEMINI_API_KEY`** — Create a Google AI Studio API key and add it to `.env.local` for local development and to Vercel Project Settings → Environment Variables for production.
- [ ] **Vercel project setup** — Create a Vercel project, connect the repository, and configure environment variables (`GEMINI_API_KEY`, `GEMINI_MODEL`).
- [ ] **Real-device testing** — Test on physical mobile devices (iOS Safari, Android Chrome) for touch interaction, virtual keyboard behaviour, and IndexedDB persistence.
- [x] **Playwright browser installation** — Chromium browser installed and verified for E2E testing.
