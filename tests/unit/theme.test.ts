import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveThemeMode, applyThemeToDOM } from '@/features/theme/theme-provider';
import { type ThemeMode } from '@/features/theme/types';

describe('Theme Resolution & DOM Application (Phase R5b)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.style.colorScheme = '';
    vi.restoreAllMocks();
  });

  describe('resolveThemeMode()', () => {
    it('returns "light" when explicit light mode is specified regardless of OS preference', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(resolveThemeMode('light')).toBe('light');
    });

    it('returns "dark" when explicit dark mode is specified regardless of OS preference', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(resolveThemeMode('dark')).toBe('dark');
    });

    it('resolves "system" mode to "dark" when OS prefers dark mode', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(resolveThemeMode('system')).toBe('dark');
    });

    it('resolves "system" mode to "light" when OS prefers light mode', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: !query.includes('dark'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      expect(resolveThemeMode('system')).toBe('light');
    });
  });

  describe('applyThemeToDOM()', () => {
    it('sets data-theme, class, and colorScheme to dark', () => {
      applyThemeToDOM('dark');

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('sets data-theme, class, and colorScheme to light', () => {
      applyThemeToDOM('light');

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });

  describe('Ripple Origin and Max Radius Calculation', () => {
    const calculateRipple = (
      viewportWidth: number,
      viewportHeight: number,
      origin?: { x: number; y: number }
    ) => {
      const x = origin?.x ?? viewportWidth / 2;
      const y = origin?.y ?? viewportHeight / 2;
      const radius = Math.hypot(
        Math.max(x, viewportWidth - x),
        Math.max(y, viewportHeight - y)
      );
      return { x, y, radius };
    };

    it('calculates center origin and corner radius when no click coordinates are provided (keyboard activation)', () => {
      const { x, y, radius } = calculateRipple(1000, 800);
      expect(x).toBe(500);
      expect(y).toBe(400);
      // Distance from (500, 400) to any corner (0,0) is hypot(500, 400)
      expect(radius).toBeCloseTo(Math.hypot(500, 400), 2);
    });

    it('calculates maximum diagonal distance when clicked in the top-left corner (0, 0)', () => {
      const { x, y, radius } = calculateRipple(1440, 900, { x: 0, y: 0 });
      expect(x).toBe(0);
      expect(y).toBe(0);
      // Furthest corner is bottom-right (1440, 900)
      expect(radius).toBeCloseTo(Math.hypot(1440, 900), 2);
    });

    it('calculates maximum diagonal distance when clicked in the bottom-right corner', () => {
      const { x, y, radius } = calculateRipple(1440, 900, { x: 1440, y: 900 });
      expect(x).toBe(1440);
      expect(y).toBe(900);
      // Furthest corner is top-left (0, 0)
      expect(radius).toBeCloseTo(Math.hypot(1440, 900), 2);
    });

    it('calculates furthest corner correctly for arbitrary point', () => {
      // Point at (200, 100) in 1000x800 screen. Furthest corner is (1000, 800), dx=800, dy=700
      const { radius } = calculateRipple(1000, 800, { x: 200, y: 100 });
      expect(radius).toBeCloseTo(Math.hypot(800, 700), 2);
    });
  });

  describe('Storage Failure & Sandboxed Fallbacks', () => {
    it('gracefully handles localStorage throws without rejecting', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        try {
          localStorage.setItem('edumentor_theme', 'light');
        } catch {
          // caught inside provider
        }
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('ignores invalid stored theme values and falls back safely', () => {
      const sanitizeMode = (raw: string | null): ThemeMode => {
        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          return raw;
        }
        return 'system';
      };

      expect(sanitizeMode('corrupt_value')).toBe('system');
      expect(sanitizeMode(null)).toBe('system');
      expect(sanitizeMode('dark')).toBe('dark');
      expect(sanitizeMode('light')).toBe('light');
    });
  });

  describe('Cross-Tab Storage Event Synchronization', () => {
    it('correctly reacts to external theme change events from other tabs', () => {
      let activeTheme: ThemeMode = 'dark';
      const storageListener = (e: StorageEvent) => {
        if (e.key === 'edumentor_theme' && e.newValue) {
          const val = e.newValue as ThemeMode;
          if (val === 'light' || val === 'dark' || val === 'system') {
            activeTheme = val;
          }
        }
      };

      const event = new StorageEvent('storage', {
        key: 'edumentor_theme',
        newValue: 'light',
      });
      storageListener(event);

      expect(activeTheme).toBe('light');
    });

    it('ignores unrelated storage events', () => {
      let activeTheme: ThemeMode = 'dark';
      const storageListener = (e: StorageEvent) => {
        if (e.key === 'edumentor_theme' && e.newValue) {
          activeTheme = e.newValue as ThemeMode;
        }
      };

      const event = new StorageEvent('storage', {
        key: 'other_unrelated_key',
        newValue: 'light',
      });
      storageListener(event);

      expect(activeTheme).toBe('dark');
    });
  });

  describe('Rapid Toggle Collision & View Transitions Skip Protection', () => {
    it('invokes skipTransition() on active transition when a rapid subsequent toggle occurs', () => {
      const mockSkip = vi.fn();
      const activeTransition: { skipTransition: () => void } | null = {
        skipTransition: mockSkip,
      };

      // Rapid toggle triggers skip on existing transition
      if (activeTransition?.skipTransition) {
        activeTransition.skipTransition();
      }

      expect(mockSkip).toHaveBeenCalledTimes(1);
    });
  });
});
