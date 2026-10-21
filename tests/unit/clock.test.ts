import { describe, it, expect, beforeEach } from 'vitest';
import { now, nowIso, nowEpochMs, _setNow, _resetClock } from '@/lib/utils/clock';

describe('Clock Utility', () => {
  beforeEach(() => {
    _resetClock();
  });

  it('returns current date by default', () => {
    const before = Date.now();
    const currentDate = now();
    const after = Date.now();

    expect(currentDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(currentDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('allows overriding the clock with a deterministic timestamp', () => {
    const fixedTime = new Date('2026-05-15T12:00:00.000Z');
    _setNow(() => fixedTime);

    expect(now().toISOString()).toBe('2026-05-15T12:00:00.000Z');
    expect(nowIso()).toBe('2026-05-15T12:00:00.000Z');
    expect(nowEpochMs()).toBe(fixedTime.getTime());
  });

  it('restores default behavior when reset', () => {
    const fixedTime = new Date('2020-01-01T00:00:00.000Z');
    _setNow(() => fixedTime);
    expect(now().toISOString()).toBe('2020-01-01T00:00:00.000Z');

    _resetClock();
    expect(now().getFullYear()).toBeGreaterThanOrEqual(2025);
  });
});
