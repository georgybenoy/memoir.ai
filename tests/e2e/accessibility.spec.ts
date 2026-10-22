import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Audits (WCAG 2.2 AA)', () => {
  test('desktop landing page has zero critical or serious a11y violations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('desktop workspace shell has zero critical or serious a11y violations', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(criticalOrSerious).toEqual([]);
  });

  test('mobile workspace shell has zero critical or serious a11y violations', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/app');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(criticalOrSerious).toEqual([]);
  });
});
