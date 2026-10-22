# Abuse Controls & Rate Limiting Architecture

This document describes the abuse prevention, payload bounds, and rate-limiting controls implemented in EduMentor.

---

## 1. Architectural Context & Hard Honesty Statement

EduMentor operates strictly under the architecture rule: **No user accounts, no server persistence, no external database, no Redis/KV cache**. All user data lives exclusively in client-side IndexedDB on the learner's device.

Because the Next.js API routes run on serverless/stateless compute without a shared coordination layer or persistent server-side store:
1. **Durable per-user quotas are impossible** without identity or external state.
2. **In-memory rate limits are strictly best-effort**. They apply only to the memory space of a single running Node.js / serverless instance.
3. **Limits reset on cold starts** and do not share state across multiple scaled serverless instances.
4. An adversarial client rotating IP addresses or waiting for serverless instances to scale can bypass single-instance in-memory counters.

---

## 2. Implemented Defense-in-Depth Measures

Despite the stateless constraint, EduMentor implements four layers of protection in `src/lib/ai/guard.ts` for every AI route:

### A. Payload Size Limits (`maxBodyBytes`)
Before and during request processing:
- **`Content-Length` validation**: Rejects oversized requests immediately before reading memory.
- **Buffer length enforcement**: Streams are capped at:
  - **64 KiB** for single-turn routes:
    - `/api/ai/evaluate-answer`
    - `/api/ai/explain-concept`
    - `/api/ai/generate-question`
  - **512 KiB** for batch chunk extraction:
    - `/api/ai/extract-concepts`
- Requests exceeding these limits receive HTTP `413 Payload Too Large`.

### B. In-Memory Sliding-Window Rate Limiting
- **Per-IP Limit**: Maximum **25 requests per 60-second window** per client IP.
  - Client IPs are extracted from standard headers (`x-forwarded-for`, `x-real-ip`) and immediately hashed via SHA-256 (`getHashedClientIp`). Raw IPs are never stored or logged.
- **Global Instance Cap**: Maximum **200 requests per 60-second window** across all clients on that instance.
- Exceeding either limit yields HTTP `429 Too Many Requests` with a calculated `retryAfterMs`.

### C. Concurrency / Burst Throttle
- Maximum **8 concurrent AI requests** active simultaneously per instance (`MAX_CONCURRENT_REQUESTS`).
- If 8 requests are currently awaiting Gemini responses, incoming requests fail fast with HTTP `429` (`RATE_LIMITED_LOCAL`) and an instruction to retry in 2 seconds, preventing event loop starvation.

### D. Strict Zod Schema & Model Validation
- All payloads are strictly parsed and stripped against Zod schemas. Extra unexpected fields are rejected.
- Models must exist in the compile-time allowlist (`gemini-2.5-flash`, `gemini-2.5-pro`). Arbitrary model strings are rejected with HTTP `400 Bad Request`.

### E. Output Token Bounds
- Server requests explicitly specify `maxOutputTokens` to prevent run-away generative responses:
  - `2048` tokens for questions, evaluations, and explanations.
  - `6144` tokens for concept extraction graphs.

---

## 3. Privacy-Preserving Safe Logging

`src/lib/ai/guard.ts` provides `safeLog()`:
- Records only: timestamp, route, HTTP method, status code, duration in milliseconds, payload size, model ID, and truncated hashed IP (e.g. `a1b2c3d4e5...`).
- **Never logs**: Prompt text, note excerpts, student answers, system instructions, or Gemini API keys.

---

## 4. Operational & Manual Follow-ups (Required for Production Operators)

Because application-level in-memory rate limiting is best-effort, production operators deploying EduMentor to Vercel/Cloudflare must configure upstream controls:

1. **Provider-Side Budget Alerts & Spend Caps (Google AI Studio / Google Cloud Console)**:
   - Configure a hard spending budget or quota alert in the Google Cloud Billing console for the project hosting the Gemini API key.
   - Set daily request quotas on the `generativelanguage.googleapis.com` API to prevent unexpected costs.
2. **Platform Firewall / WAF Rules (Vercel Firewall / Cloudflare)**:
   - Enable Vercel Attack Challenge Mode or Cloudflare WAF rate limiting on `/api/ai/*` (e.g., limit 30 requests/min per IP at the edge).
   - Configure DDoS mitigation rules to drop abusive floods before hitting serverless functions.
