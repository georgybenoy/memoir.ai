import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import {
  withAiGuard,
  checkRateLimit,
  _resetRateLimiter,
  getHashedClientIp,
  tryAcquireConcurrency,
  releaseConcurrency,
  safeLog,
  MAX_BODY_BYTES,
  MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_REQUESTS,
} from '@/lib/ai/guard';
import { setClockOverride, resetClock } from '@/lib/utils/clock';

const DummySchema = z.object({
  message: z.string().min(1).max(100),
  model: z.string().optional(),
});

describe('AI Guard & Security Controls (withAiGuard)', () => {
  beforeEach(() => {
    _resetRateLimiter();
    resetClock();
  });

  afterEach(() => {
    _resetRateLimiter();
    resetClock();
  });

  describe('Payload & Content-Length Size Limits', () => {
    it('rejects requests with declared Content-Length exceeding 512 KiB before reading body', async () => {
      const oversizedBytes = MAX_BODY_BYTES + 1024;
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(oversizedBytes),
        },
        body: JSON.stringify({ message: 'hello' }),
      });

      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(data.error.message).toContain('512 KiB');
    });

    it('rejects requests with actual payload buffer exceeding 512 KiB', async () => {
      const largeString = 'a'.repeat(MAX_BODY_BYTES + 200);
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: largeString }),
      });

      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Request Parsing & Zod Validation', () => {
    it('returns 400 INVALID_REQUEST on malformed JSON syntax', async () => {
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"message": not valid json',
      });

      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('Invalid JSON');
    });

    it('returns 400 INVALID_REQUEST on schema validation failure', async () => {
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }), // fails .min(1)
      });

      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('Validation failed');
    });

    it('rejects disallowed models with 400 MODEL_NOT_ALLOWED', async () => {
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'valid test message',
          model: 'gpt-4o-arbitrary-unallowed',
        }),
      });

      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('MODEL_NOT_ALLOWED');
      expect(data.error.message).toContain('gpt-4o-arbitrary-unallowed');
    });

    it('passes validated data and model to inner handler on success', async () => {
      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'hello tutor',
          model: 'gemini-2.5-flash',
        }),
      });

      let receivedModel = '';
      const res = await withAiGuard(req, '/api/ai/test', DummySchema, async (ctx) => {
        receivedModel = ctx.model;
        return new Response(JSON.stringify({ echoed: ctx.data.message }));
      });

      expect(res.status).toBe(200);
      expect(receivedModel).toBe('gemini-2.5-flash');
      const data = await res.json();
      expect(data.echoed).toBe('hello tutor');
    });
  });

  describe('Sliding-Window Rate Limiter & Concurrency', () => {
    it('allows requests within window limit and blocks 26th request with retryAfterMs', () => {
      const testHashedIp = 'test-ip-hash-abc';
      let currentTime = 1000000;
      setClockOverride(new Date(currentTime));

      for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
        const check = checkRateLimit(testHashedIp, currentTime);
        expect(check.allowed).toBe(true);
      }

      // 26th request within same window fails
      const blocked = checkRateLimit(testHashedIp, currentTime);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);

      // Advance time beyond 60s window
      currentTime += RATE_LIMIT_WINDOW_MS + 1000;
      setClockOverride(new Date(currentTime));

      const allowedAgain = checkRateLimit(testHashedIp, currentTime);
      expect(allowedAgain.allowed).toBe(true);
    });

    it('withAiGuard returns 429 RATE_LIMITED_LOCAL with Retry-After header when rate limited', async () => {
      const testIp = '198.51.100.42';
      const makeReq = () =>
        new Request('http://localhost/api/ai/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': testIp,
          },
          body: JSON.stringify({ message: 'ping' }),
        });

      // Burn through 25 requests
      for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
        const res = await withAiGuard(makeReq(), '/api/ai/test', DummySchema, async () => {
          return new Response(JSON.stringify({ ok: true }));
        });
        expect(res.status).toBe(200);
      }

      // 26th request gets rate limited
      const blockedRes = await withAiGuard(makeReq(), '/api/ai/test', DummySchema, async () => {
        return new Response(JSON.stringify({ ok: true }));
      });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      const body = await blockedRes.json();
      expect(body.error.code).toBe('RATE_LIMITED_LOCAL');
      expect(body.error.retryable).toBe(true);
    });

    it('enforces global concurrency limit of 8 concurrent requests', () => {
      _resetRateLimiter();
      for (let i = 0; i < MAX_CONCURRENT_REQUESTS; i++) {
        expect(tryAcquireConcurrency()).toBe(true);
      }
      // 9th concurrent request fails
      expect(tryAcquireConcurrency()).toBe(false);

      // Releasing one allows another
      releaseConcurrency();
      expect(tryAcquireConcurrency()).toBe(true);
    });

    it('enforces global instance cap across distinct IPs within window', () => {
      _resetRateLimiter();
      const currentTime = 5000000;
      setClockOverride(new Date(currentTime));

      // 200 requests from 200 distinct IPs should all pass
      for (let i = 0; i < 200; i++) {
        const check = checkRateLimit(`unique-ip-${i}`, currentTime);
        expect(check.allowed).toBe(true);
      }

      // 201st request from a new IP should fail due to global instance cap
      const blocked = checkRateLimit('unique-ip-201', currentTime);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe('global_cap');
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('enforces route-specific maxBodyBytes when specified', async () => {
      const customLimitBytes = 64 * 1024; // 64 KiB
      const largePayload = JSON.stringify({ message: 'x'.repeat(customLimitBytes + 10) });

      const req = new Request('http://localhost/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: largePayload,
      });

      const res = await withAiGuard(
        req,
        '/api/ai/test',
        DummySchema,
        async () => new Response(JSON.stringify({ ok: true })),
        { maxBodyBytes: customLimitBytes },
      );

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(data.error.message).toContain('64 KiB');
    });
  });

  describe('IP Hashing & Privacy', () => {
    it('hashes client IP with SHA-256 and never exposes raw IP', () => {
      const rawIp = '203.0.113.195';
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-forwarded-for': `${rawIp}, 10.0.0.1` },
      });

      const hashed = getHashedClientIp(req);
      expect(hashed).toHaveLength(64); // SHA-256 hex string
      expect(hashed).not.toContain(rawIp);
      expect(hashed).not.toContain('203.0.113');
    });

    it('falls back to x-real-ip when x-forwarded-for is missing', () => {
      const rawIp = '198.51.100.77';
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-real-ip': rawIp },
      });

      const hashed = getHashedClientIp(req);
      expect(hashed).toHaveLength(64);
      expect(hashed).not.toBe(rawIp);
    });
  });

  describe('Safe Logging Invariant & AST / Content Guard', () => {
    it('safeLog records metadata and sizes without raw bodies, notes, or secrets', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      safeLog({
        route: '/api/ai/test',
        method: 'POST',
        status: 200,
        durationMs: 42,
        requestSizeBytes: 1024,
        responseSizeBytes: 2048,
        model: 'gemini-2.5-flash',
        hashedIp: 'abcdef1234567890abcdef',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logString = consoleSpy.mock.calls[0][0];

      // Verifications
      expect(logString).toContain('[AI-GATEWAY]');
      expect(logString).toContain('"route":"/api/ai/test"');
      expect(logString).toContain('"durationMs":42');
      expect(logString).toContain('"requestSizeBytes":1024');
      // Truncated hashed IP, not full hashed IP
      expect(logString).toContain('abcdef1234...');
      // No sensitive content fields
      expect(logString).not.toContain('body');
      expect(logString).not.toContain('answer');
      expect(logString).not.toContain('chunk');
      expect(logString).not.toContain('secret');

      consoleSpy.mockRestore();
    });

    it('STATIC AUDIT: ensures no route or lib code logs request/response bodies or raw keys', () => {
      // Scans src/lib/ai/ and src/app/api/ to ensure no console.log calls log body, payload, chunks, or answers
      const scanDirs = [
        path.resolve(process.cwd(), 'src/lib/ai'),
        path.resolve(process.cwd(), 'src/app/api'),
      ];

      function getAllFiles(dir: string): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            results = results.concat(getAllFiles(filePath));
          } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
            results.push(filePath);
          }
        }
        return results;
      }

      const allFiles = scanDirs.flatMap((d) => (fs.existsSync(d) ? getAllFiles(d) : []));
      expect(allFiles.length).toBeGreaterThan(0);

      // Dangerous patterns that would violate PRD / AGENTS.md privacy rules
      const forbiddenPatterns = [
        /console\.log\s*\([^)]*req\.body/i,
        /console\.log\s*\([^)]*parsedJson/i,
        /console\.log\s*\([^)]*rawBuffer/i,
        /console\.log\s*\([^)]*extractedText/i,
        /console\.log\s*\([^)]*studentAnswer/i,
        /console\.log\s*\([^)]*apiKey/i,
        /console\.log\s*\([^)]*GEMINI_API_KEY/i,
        /console\.info\s*\([^)]*body/i,
      ];

      for (const file of allFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          expect(
            match,
            `Forbidden logging pattern ${pattern} found in ${path.relative(process.cwd(), file)}: "${match?.[0]}"`,
          ).toBeNull();
        }
      }
    });
  });
});
