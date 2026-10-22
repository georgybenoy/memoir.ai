/**
 * Injectable clock for time access.
 * All application code must use this instead of `new Date()` or `Date.now()` directly.
 * Tests can override `_setNow` to control time deterministically.
 */

export type NowFn = () => Date;

let _nowFn: NowFn = () => new Date();

/** Returns the current time. Uses the injectable clock function. */
export function now(): Date {
  return _nowFn();
}

/** Returns the current time as an ISO string. */
export function nowISO(): string {
  return now().toISOString();
}

export const nowIso = nowISO;

/** Returns current time in epoch milliseconds. */
export function nowEpochMs(): number {
  return now().getTime();
}

/**
 * Override the clock function. For testing only.
 * @param fn - A function that returns the desired "current" time.
 */
export function _setNow(fn: NowFn): void {
  _nowFn = fn;
}

/** Reset the clock to the real system time. For testing only. */
export function _resetNow(): void {
  _nowFn = () => new Date();
}

export const _resetClock = _resetNow;
export const resetClock = _resetNow;

/**
 * Override the clock with a fixed date, epoch ms, or custom function.
 */
export function setClockOverride(dateOrFn: Date | number | NowFn): void {
  if (typeof dateOrFn === 'function') {
    _nowFn = dateOrFn;
  } else if (typeof dateOrFn === 'number') {
    _nowFn = () => new Date(dateOrFn);
  } else {
    _nowFn = () => dateOrFn;
  }
}
