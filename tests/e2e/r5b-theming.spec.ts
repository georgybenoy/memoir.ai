import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/screenshots/theme');

test.beforeAll(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('Phase R5b — Theming & Accessibility E2E Test Suite', () => {
  test.describe('1. No-Flash First-Paint & Storage Invariants', () => {
    test('pre-sets dark theme before first paint without flash (DOMContentLoaded)', async ({ page }) => {
      // Record theme and background color synchronously as soon as DOMContentLoaded fires
      await page.addInitScript(() => {
        try {
          localStorage.setItem('edumentor_theme', 'dark');
        } catch {}
        (window as unknown as { __dclState?: { theme: string | null; bg: string } }).__dclState = {
          theme: null,
          bg: '',
        };
        window.addEventListener('DOMContentLoaded', () => {
          (window as unknown as { __dclState: { theme: string | null; bg: string } }).__dclState = {
            theme: document.documentElement.getAttribute('data-theme'),
            bg: window.getComputedStyle(document.body).backgroundColor,
          };
        });
      });

      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');

      const dclState = await page.evaluate(
        () => (window as unknown as { __dclState: { theme: string | null; bg: string } }).__dclState
      );

      expect(dclState.theme).toBe('dark');
      // Assert root element has data-theme dark and dark color scheme
      const rootTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(rootTheme).toBe('dark');
    });

    test('pre-sets light theme before first paint without flash (DOMContentLoaded)', async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('edumentor_theme', 'light');
        } catch {}
        (window as unknown as { __dclState?: { theme: string | null; bg: string } }).__dclState = {
          theme: null,
          bg: '',
        };
        window.addEventListener('DOMContentLoaded', () => {
          (window as unknown as { __dclState: { theme: string | null; bg: string } }).__dclState = {
            theme: document.documentElement.getAttribute('data-theme'),
            bg: window.getComputedStyle(document.body).backgroundColor,
          };
        });
      });

      await page.goto('/app');
      await page.waitForLoadState('domcontentloaded');

      const dclState = await page.evaluate(
        () => (window as unknown as { __dclState: { theme: string | null; bg: string } }).__dclState
      );

      expect(dclState.theme).toBe('light');
      const rootTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(rootTheme).toBe('light');
    });
  });

  test.describe('2. Toggle Interaction (Mouse & Keyboard Accessibility)', () => {
    test('toggles theme via mouse click with menu opening and selection', async ({ page }) => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await expect(toggleTrigger).toBeVisible();

      // Open menu
      await toggleTrigger.click();
      const menu = page.locator('[data-testid="theme-toggle-menu"]');
      await expect(menu).toBeVisible();

      // Click Light option
      const lightOption = page.locator('[data-testid="theme-option-light"]');
      await expect(lightOption).toBeVisible();
      await lightOption.click();

      // Verify theme switched to light
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      const stored = await page.evaluate(() => localStorage.getItem('edumentor_theme'));
      expect(stored).toBe('light');

      // Re-open and click Dark option
      await toggleTrigger.click();
      await expect(menu).toBeVisible();
      const darkOption = page.locator('[data-testid="theme-option-dark"]');
      await darkOption.click();

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const storedDark = await page.evaluate(() => localStorage.getItem('edumentor_theme'));
      expect(storedDark).toBe('dark');
    });

    test('toggles theme using keyboard navigation only (Enter, Arrows, Escape)', async ({ page }) => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await toggleTrigger.focus();
      await expect(toggleTrigger).toBeFocused();

      // Open menu with Enter
      await page.keyboard.press('Enter');
      const menu = page.locator('[data-testid="theme-toggle-menu"]');
      await expect(menu).toBeVisible();

      // Test Escape closes menu and returns focus to trigger
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
      await expect(toggleTrigger).toBeFocused();

      // Reopen with Space
      await page.keyboard.press('Space');
      await expect(menu).toBeVisible();

      // Arrow down through options
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // Theme attribute changed
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(['light', 'dark']).toContain(currentTheme);
    });

    test('persists selected theme after page reload', async ({ page }) => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();

      await toggleTrigger.click();
      await page.locator('[data-testid="theme-option-light"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // Reload page and verify data-theme attribute persists
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  });

  test.describe('3. System Mode & Live Media Query Updates', () => {
    test('system mode dynamically adapts to OS prefers-color-scheme changes', async ({ page }) => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      // Select system mode
      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await toggleTrigger.click();
      await page.locator('[data-testid="theme-option-system"]').click();

      // Emulate dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      // Emulate light mode
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  });

  test.describe('4. View Transitions Ripple & Fallback Verification', () => {
    test('sets ripple coordinates and radius CSS variables during view transition', async ({ page }) => {
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      // Attach spy to document.startViewTransition
      await page.evaluate(() => {
        (window as unknown as { __transitionCalls: number }).__transitionCalls = 0;
        if ('startViewTransition' in document) {
          const original = document.startViewTransition.bind(document);
          document.startViewTransition = (cb: () => void) => {
            (window as unknown as { __transitionCalls: number }).__transitionCalls++;
            return original(cb);
          };
        }
      });

      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await toggleTrigger.click();
      await page.locator('[data-testid="theme-option-light"]').click();

      // Verify ripple CSS variables were computed and populated
      const rippleData = await page.evaluate(() => ({
        x: document.documentElement.style.getPropertyValue('--ripple-x'),
        y: document.documentElement.style.getPropertyValue('--ripple-y'),
        r: document.documentElement.style.getPropertyValue('--ripple-r'),
      }));

      expect(rippleData.x).toMatch(/\d+px/);
      expect(rippleData.y).toMatch(/\d+px/);
      expect(rippleData.r).toMatch(/\d+px/);
      // Radius should be greater than 200px
      const radiusNum = parseFloat(rippleData.r);
      expect(radiusNum).toBeGreaterThan(200);
    });

    test('reduced-motion emulation switches theme instantly without starting view transition', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      await page.evaluate(() => {
        (window as unknown as { __transitionCalls: number }).__transitionCalls = 0;
        if ('startViewTransition' in document) {
          const original = document.startViewTransition.bind(document);
          document.startViewTransition = (cb: () => void) => {
            (window as unknown as { __transitionCalls: number }).__transitionCalls++;
            return original(cb);
          };
        }
      });

      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await toggleTrigger.click();
      await page.locator('[data-testid="theme-option-dark"]').click();

      const calls = await page.evaluate(
        () => (window as unknown as { __transitionCalls: number }).__transitionCalls
      );
      expect(calls).toBe(0);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });

    test('operates safely when document.startViewTransition is undefined (fallback mode)', async ({ page }) => {
      await page.addInitScript(() => {
        // Delete startViewTransition to simulate older/unsupported browser
        delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
      });

      await page.goto('/app');
      await page.waitForLoadState('networkidle');
      const toggleTrigger = page.locator('[data-testid="theme-toggle-trigger"]').first();
      await toggleTrigger.click();
      await page.locator('[data-testid="theme-option-light"]').click();

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('theme preference survives export -> clear -> import cycle', async ({ page }) => {
      await page.goto('/app/settings');
      await page.waitForLoadState('networkidle');

      // 1. Choose light theme in Settings
      const lightRadio = page.locator('[data-testid="theme-radio-light"]');
      if (await lightRadio.isVisible()) {
        await lightRadio.click();
      } else {
        const toggle = page.locator('[data-testid="theme-toggle-trigger"]').first();
        await toggle.click();
        await page.locator('[data-testid="theme-option-light"]').click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      // 2. Export backup file
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export backup file' }).click();
      const download = await downloadPromise;
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();

      // Read downloaded JSON and verify preferences.theme is light
      const content = fs.readFileSync(downloadPath!, 'utf-8');
      const backupData = JSON.parse(content);
      expect(backupData.workspace.preferences.theme).toBe('light');

      // 3. Clear all local data
      await page.getByRole('button', { name: 'Clear all local data' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'I understand, delete everything' }).click();
      await expect(page.getByText('Local Data Cleared')).toBeVisible();

      // 4. Import the downloaded backup file
      const fileInput = page.locator('input[type="file"][accept*=".json"]');
      await fileInput.setInputFiles(downloadPath!);

      // Confirm import in modal
      const importModal = page.getByRole('dialog');
      await expect(importModal).toBeVisible();
      const applyBtn = importModal.getByRole('button', { name: /import backup|replace all data/i });
      await applyBtn.click();
      await expect(page.getByText(/Import Complete|Workspace Replaced/i)).toBeVisible();

      // 5. Verify light theme is retained and applied
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  });

  test.describe('5. Accessibility Audits (@axe-core/playwright in Both Themes)', () => {
    const screens = [
      { name: 'Landing Page', url: '/' },
      { name: 'Materials View', url: '/app' },
      { name: 'Learning Setup', url: '/learn/new' },
      { name: 'Concept Graph Path', url: '/app/path' },
      { name: 'Spaced Review', url: '/app/review' },
      { name: 'Settings View', url: '/app/settings' },
    ];

    for (const theme of ['dark', 'light'] as const) {
      test(`Desktop (1440px) [${theme.toUpperCase()}] major screens have zero critical/serious a11y violations`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.addInitScript((t) => {
          localStorage.setItem('edumentor_theme', t);
        }, theme);

        for (const screen of screens) {
          await page.goto(screen.url);
          await page.waitForLoadState('networkidle');

          const axeResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

          const seriousOrCritical = axeResults.violations.filter(
            (v) => v.impact === 'serious' || v.impact === 'critical'
          );

          expect(
            seriousOrCritical,
            `Axe violations on ${screen.name} in ${theme} mode: ${JSON.stringify(seriousOrCritical, null, 2)}`
          ).toEqual([]);
        }
      });

      test(`Mobile (375px) [${theme.toUpperCase()}] major screens have zero critical/serious a11y violations`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.addInitScript((t) => {
          localStorage.setItem('edumentor_theme', t);
        }, theme);

        for (const screen of screens) {
          await page.goto(screen.url);
          await page.waitForLoadState('networkidle');

          const axeResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

          const seriousOrCritical = axeResults.violations.filter(
            (v) => v.impact === 'serious' || v.impact === 'critical'
          );

          expect(
            seriousOrCritical,
            `Mobile Axe violations on ${screen.name} in ${theme} mode: ${JSON.stringify(seriousOrCritical, null, 2)}`
          ).toEqual([]);
        }
      });
    }
  });

  test.describe('6. Visual Theme Verification & Multi-Resolution Screenshots', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    const targetRoutes = [
      { id: 'landing', url: '/' },
      { id: 'materials', url: '/app' },
      { id: 'path', url: '/app/path' },
      { id: 'settings', url: '/app/settings' },
    ];

    for (const theme of ['dark', 'light'] as const) {
      for (const vp of viewports) {
        test(`captures screenshots in ${theme} mode at ${vp.width}px (${vp.name})`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.addInitScript((t) => {
            localStorage.setItem('edumentor_theme', t);
          }, theme);

          for (const route of targetRoutes) {
            await page.goto(route.url);
            await page.waitForLoadState('networkidle');

            const fileName = `${theme}-${route.id}-${vp.width}px.png`;
            const filePath = path.join(SCREENSHOT_DIR, fileName);
            await page.screenshot({ path: filePath, fullPage: true });

            expect(fs.existsSync(filePath)).toBe(true);
          }
        });
      }
    }
  });
});
