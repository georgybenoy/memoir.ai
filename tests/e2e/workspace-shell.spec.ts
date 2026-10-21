import { test, expect } from '@playwright/test';

test.describe('Workspace Shell Layout and Responsiveness', () => {
  test('renders full three-panel layout on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Header elements
    await expect(page.getByText('EduMentor')).toBeVisible();
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await expect(page.getByText('Online')).toBeVisible();

    // Navigation Sidebar
    const nav = page.getByRole('navigation', { name: /workspace navigation/i });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Workspace' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Study Materials' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Concept Map' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Recall Practice' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Spaced Review' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Data & Settings' })).toBeVisible();

    // Main Canvas
    await expect(page.getByRole('heading', { name: 'What are you learning today?' })).toBeVisible();
    await expect(page.getByText('Import Study Material')).toBeVisible();

    // Assistant panel
    const assistant = page.getByRole('complementary', { name: /ai tutor assistant/i });
    await expect(assistant).toBeVisible();
    await expect(assistant.getByText('Tutor Assistant')).toBeVisible();
  });

  test('toggles sidebar collapse on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const collapseBtn = page.getByRole('button', { name: /collapse sidebar/i });
    await expect(collapseBtn).toBeVisible();

    // Collapse sidebar
    await collapseBtn.click();
    await expect(page.getByRole('button', { name: /expand sidebar/i })).toBeVisible();

    // Expand sidebar again
    await page.getByRole('button', { name: /expand sidebar/i }).click();
    await expect(page.getByRole('button', { name: /collapse sidebar/i })).toBeVisible();
  });

  test('toggles assistant panel visibility', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const assistant = page.getByRole('complementary', { name: /ai tutor assistant/i });
    await expect(assistant).toBeVisible();

    // Click collapse assistant in topbar
    const toggleBtn = page.getByRole('button', { name: /collapse assistant panel/i });
    await toggleBtn.click();

    await expect(assistant).not.toBeVisible();

    // Click expand assistant
    await page.getByRole('button', { name: /expand assistant panel/i }).click();
    await expect(assistant).toBeVisible();
  });

  test('adapts cleanly to mobile viewport with drawer navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Desktop sidebar should be hidden
    const desktopNav = page.getByLabel('Navigation sidebar');
    await expect(desktopNav).toBeHidden();

    // Mobile menu button should be visible
    const menuBtn = page.getByRole('button', { name: /open navigation menu/i });
    await expect(menuBtn).toBeVisible();

    // Open mobile drawer
    await menuBtn.click();
    await expect(page.getByText('Navigation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Study Materials' })).toBeVisible();

    // Close drawer
    await page.getByRole('button', { name: /close navigation/i }).click();
    await expect(page.getByText('Navigation')).not.toBeVisible();
  });

  test('supports keyboard skip link navigation', async ({ page }) => {
    await page.goto('/');

    // Press Tab once to focus skip link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();

    // Press Enter to skip
    await page.keyboard.press('Enter');
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeInViewport();
  });
});
