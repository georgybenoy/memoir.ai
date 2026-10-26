'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';
import { type ThemeMode, type ResolvedTheme, type ThemeContextValue } from './types';
import { getStorage } from '@/lib/db/bootstrap';

const THEME_STORAGE_KEY = 'edumentor_theme';

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function resolveThemeMode(mode: ThemeMode): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyThemeToDOM(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;

  // Sync meta theme-color from semantic CSS variable
  try {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    if (bg) {
      meta.content = bg;
    }
  } catch {
    // ignore
  }
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'system',
}) => {
  // Read initial mode from localStorage if present
  const [mode, setModeState] = React.useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return defaultMode;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // localStorage unavailable / sandboxed
    }
    return defaultMode;
  });

  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolveThemeMode(mode)
  );

  const [announcement, setAnnouncement] = React.useState<string>('');
  const activeTransitionRef = React.useRef<{ skipTransition?: () => void } | null>(null);

  // Apply resolvedTheme to DOM on mount and updates
  React.useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  // Sync to IndexedDB workspace preferences
  const syncToIndexedDb = React.useCallback(async (newMode: ThemeMode) => {
    try {
      const repos = getStorage();
      const workspace = await repos.workspace.getWorkspace();
      if (workspace && workspace.preferences.theme !== newMode) {
        await repos.workspace.updatePreferences({ theme: newMode });
      }
    } catch {
      // Ignore background persistence errors
    }
  }, []);

  // Set mode with optional circular View Transitions ripple
  const setMode = React.useCallback(
    async (newMode: ThemeMode, origin?: { x: number; y: number }) => {
      const targetResolved = resolveThemeMode(newMode);

      // Save to localStorage immediately
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newMode);
      } catch {
        // Storage full or private mode
      }

      // Check for reduced motion
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const hasViewTransitions =
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        typeof (document as unknown as { startViewTransition: unknown }).startViewTransition ===
          'function';

      // Skip previous active transition if rapid clicking occurs
      if (activeTransitionRef.current?.skipTransition) {
        try {
          activeTransitionRef.current.skipTransition();
        } catch {
          // ignore
        }
      }

      const applyStateUpdates = () => {
        applyThemeToDOM(targetResolved);
        setModeState(newMode);
        setResolvedTheme(targetResolved);
        setAnnouncement(`${targetResolved.charAt(0).toUpperCase() + targetResolved.slice(1)} theme on`);
      };

      if (!prefersReducedMotion && hasViewTransitions) {
        // Calculate origin and furthest radius
        const width = window.innerWidth;
        const height = window.innerHeight;
        const x = origin?.x ?? width / 2;
        const y = origin?.y ?? height / 2;
        const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

        document.documentElement.style.setProperty('--ripple-x', `${x}px`);
        document.documentElement.style.setProperty('--ripple-y', `${y}px`);
        document.documentElement.style.setProperty('--ripple-r', `${radius}px`);

        try {
          const docWithTransition = document as unknown as {
            startViewTransition: (callback: () => void) => {
              finished: Promise<void>;
              skipTransition: () => void;
            };
          };

          const transition = docWithTransition.startViewTransition(() => {
            flushSync(() => {
              applyStateUpdates();
            });
          });

          activeTransitionRef.current = transition;
          await transition.finished.catch(() => {});
        } catch {
          // Fallback if View Transition fails
          applyStateUpdates();
        } finally {
          activeTransitionRef.current = null;
        }
      } else if (!prefersReducedMotion) {
        // Fallback for browsers without View Transitions API
        document.documentElement.classList.add('theme-transitioning');
        applyStateUpdates();
        setTimeout(() => {
          document.documentElement.classList.remove('theme-transitioning');
        }, 250);
      } else {
        // Instant update for reduced motion
        applyStateUpdates();
      }

      // Mirror to IndexedDB asynchronously
      void syncToIndexedDb(newMode);
    },
    [syncToIndexedDb]
  );

  // Re-resolve on system color scheme changes when in 'system' mode
  React.useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e?: MediaQueryListEvent | MediaQueryList) => {
      const isDark = typeof e?.matches === 'boolean' ? e.matches : mediaQuery.matches;
      const currentResolved: ResolvedTheme = isDark ? 'dark' : 'light';
      applyThemeToDOM(currentResolved);
      setResolvedTheme(currentResolved);
      setAnnouncement(`System theme adjusted to ${currentResolved}`);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [mode]);

  // Sync across tabs via storage event
  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && event.newValue) {
        const externalMode = event.newValue as ThemeMode;
        if (externalMode === 'light' || externalMode === 'dark' || externalMode === 'system') {
          const targetResolved = resolveThemeMode(externalMode);
          applyThemeToDOM(targetResolved);
          setModeState(externalMode);
          setResolvedTheme(targetResolved);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Initial reconcile between localStorage and IndexedDB workspace preferences
  React.useEffect(() => {
    void (async () => {
      try {
        const repos = getStorage();
        const workspace = await repos.workspace.getWorkspace();
        if (workspace?.preferences?.theme) {
          const dbTheme = workspace.preferences.theme;
          const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
          if (!stored) {
            // First time load with existing DB preference: apply it
            await setMode(dbTheme);
          } else if (stored !== dbTheme) {
            // localStorage wins at load, sync to IndexedDB
            await repos.workspace.updatePreferences({ theme: stored });
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [setMode]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedTheme,
      setMode,
    }),
    [mode, resolvedTheme, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {/* Polite screen reader announcement on theme change */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </ThemeContext.Provider>
  );
};
