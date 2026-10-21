# PHASES.md — Implementation Phase Checklist

Track progress through each phase. Check off when the phase report is complete and accepted.

---

- [x] **Phase 0 — Environment & Project Rules**
      Setup validation, AGENTS.md, DECISIONS.md, PHASES.md, MANUAL_TASKS.md.

- [x] **Phase 1 — Foundation**
      Next.js + TypeScript project, Tailwind, UI primitives, linting, tests, environment validation, Vercel readiness. Responsive workspace shell and error/loading primitives.

- [x] **Phase 2 — IndexedDB Persistence**
      Schema/versioning, repositories, migrations, transactions, storage status, clear-data flow, export/import foundation. Verify persistence across reloads.

- [ ] **Phase 3 — Ingestion**
      PDF/TXT/Markdown validation, text extraction, normalisation, chunking, source provenance.

- [ ] **Phase 4 — Gemini Gateway and Concepts**
      Server-only Gemini integration, structured outputs, retries, concept extraction, Socratic explanations.

- [ ] **Phase 5 — DAG and Study Path**
      Dependency graph, cycle handling, topological sort, tiers, path visualisation.

- [ ] **Phase 6 — Conversation State Machine and Recall**
      All 13 states, guarded transitions, grounded questions, adaptive difficulty.

- [ ] **Phase 7 — Hybrid Evaluation and Mastery**
      Browser-compatible embeddings, Gemini judge, score synthesis, confidence calibration, mastery state.

- [ ] **Phase 8 — SM-2 and Revision**
      Scheduling, weak-concept loopback, due-review dashboard and review invitations on app startup.

- [ ] **Phase 9 — Full UI and Avatar**
      Eleven expressions, feedback rubric, history, settings, responsive polish and accessibility.

- [ ] **Phase 10 — Resilience, QA, Deployment**
      Offline/degraded modes, storage limits, export/import hardening, rate/abuse controls, end-to-end tests, Vercel deployment verification, documentation.
