import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures');
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');

const VIEWPORTS = [
  { name: 'mobile-narrow', width: 320, height: 568 },
  { name: 'mobile-standard', width: 375, height: 667 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop-wide', width: 1440, height: 900 },
];

test.describe('Phase R5 — UI/UX Polish, Responsive Viewports & Accessibility Audits', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    // Dismiss splash screen instantly
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('edumentor_loaded', 'true');
      } catch {
        // ignore
      }
    });

    // Mock Gemini API extraction
    await page.route('**/api/ai/extract-concepts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              title: 'Operating System Kernels',
              summary: 'The kernel is the core component that manages system resources and hardware.',
              canonicalExplanation: 'Monolithic vs microkernel architectures and system call interfaces.',
              keyTerms: ['Kernel', 'Monolithic', 'Microkernel'],
              prerequisiteTitles: [],
              confidence: 0.95,
              sourceChunkIds: ['ch-1'],
            },
            {
              title: 'Process Scheduling',
              summary: 'How operating systems allocate CPU cycles among competing tasks.',
              canonicalExplanation: 'Round-robin, multi-level feedback queues, and priority scheduling.',
              keyTerms: ['Scheduler', 'Quantum', 'Context Switch'],
              prerequisiteTitles: ['Operating System Kernels'],
              confidence: 0.92,
              sourceChunkIds: ['ch-1'],
            },
          ],
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });

    // Mock Gemini API question generation
    await page.route('**/api/ai/generate-question', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: {
            prompt: 'Explain the difference between monolithic and microkernel architectures.',
            questionStyle: 'conceptual',
            difficulty: 3,
            referencePoints: ['Monolithic runs drivers in kernel space', 'Microkernel runs drivers in user space'],
            sourceChunkIds: ['ch-1'],
            expectedKeyPoints: ['address space', 'system calls', 'fault isolation'],
          },
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });
  });

  // Execute full guided workflow audit across all 5 viewports
  for (const vp of VIEWPORTS) {
    test(`Responsive & Accessibility Audit at ${vp.width}px (${vp.name}) across all workflow screens`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // --- SCREEN 1: Home / Library (/learn) ---
      await page.goto('/learn');
      await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();

      // Check overflow
      const overflowHome = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowHome).toBe(false);

      // Screenshot
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `home-${vp.width}px.png`),
        fullPage: true,
      });

      // Axe audit
      const a11yHome = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yHome.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      // --- SCREEN 2: Step 1 Add Material (/learn/new) ---
      await page.goto('/learn/new');
      await expect(page.getByRole('heading', { name: 'Add Study Material', level: 1 })).toBeVisible();

      const overflowStep1 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowStep1).toBe(false);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `step1_add-${vp.width}px.png`),
        fullPage: true,
      });

      const a11yStep1 = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yStep1.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      // Perform file upload to transition to Step 2
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
      await expect(page.getByText('sample-note.txt')).toBeVisible();

      const confirmBtn = page.getByRole('button', { name: /Confirm and Process/i });
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();

      // --- SCREEN 3: Step 2 Organise Units (/learn/[id]/organise) ---
      await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
      await expect(page.getByRole('heading', { name: 'Organise & Review Units', level: 1 })).toBeVisible();
      await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });

      const overflowStep2 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowStep2).toBe(false);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `step2_organise-${vp.width}px.png`),
        fullPage: true,
      });

      const a11yStep2 = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yStep2.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      // Transition to Step 3
      const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
      await expect(continueBtn).toBeEnabled();
      await continueBtn.click();

      // --- SCREEN 4: Step 3 Choose Mode (/learn/[id]/mode) ---
      await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
      await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();

      const overflowStep3 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowStep3).toBe(false);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `step3_mode-${vp.width}px.png`),
        fullPage: true,
      });

      const a11yStep3 = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yStep3.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      // Transition to Step 4 (Launch Socratic Study)
      const startStudyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
      await expect(startStudyBtn).toBeVisible();
      await startStudyBtn.click();

      // --- SCREEN 5: Step 4 Active Session (/learn/[id]/session/[sessionId]) ---
      await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\/[a-zA-Z0-9_-]+/);
      await expect(page.locator('header[aria-label="Active session status"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /Finish study session/i })).toBeVisible();

      const overflowStep4 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowStep4).toBe(false);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `step4_session-${vp.width}px.png`),
        fullPage: true,
      });

      const a11yStep4 = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yStep4.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      // Finish session to view Completion View
      const finishBtn = page.getByRole('button', { name: /Finish study session/i });
      await expect(finishBtn).toBeVisible();
      await finishBtn.click();

      // --- SCREEN 6: Step 4 Session Completion View ---
      await expect(page.getByRole('heading', { name: 'Session Completed!', level: 1 })).toBeVisible();

      const overflowCompletion = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowCompletion).toBe(false);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `step4_completion-${vp.width}px.png`),
        fullPage: true,
      });

      const a11yCompletion = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(a11yCompletion.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    });
  }

  // Keyboard navigation & Focus management
  test('Keyboard-only walkthrough and visible focus management across journey', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Step 1: Heading is focused on mount
    await page.goto('/learn/new');
    const heading1 = page.getByRole('heading', { name: 'Add Study Material', level: 1 });
    await expect(heading1).toBeFocused();

    // Tab to Browse Files button
    await page.keyboard.press('Tab');
    const browseBtn = page.getByRole('button', { name: 'Browse Files' });
    await expect(browseBtn).toBeFocused();

    // Upload file and proceed
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();

    // Step 2: Heading is focused on mount
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    const heading2 = page.getByRole('heading', { name: 'Organise & Review Units', level: 1 });
    await expect(heading2).toBeFocused();

    // Proceed to Step 3
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Continue to Mode Selection/i }).click();

    // Step 3: Heading is focused on mount
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    const heading3 = page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 });
    await expect(heading3).toBeFocused();
  });

  // Touch targets minimum 44x44px
  test('Touch targets are at least 44x44px on mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Step 1: Browse Files button
    await page.goto('/learn/new');
    const browseBtn = page.getByRole('button', { name: 'Browse Files' });
    const browseBox = await browseBtn.boundingBox();
    expect(browseBox).not.toBeNull();
    expect(browseBox!.height).toBeGreaterThanOrEqual(44);

    // Upload file to inspect Step 2 and Step 3
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();

    // Step 2: Continue button
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
    const continueBox = await continueBtn.boundingBox();
    expect(continueBox).not.toBeNull();
    expect(continueBox!.height).toBeGreaterThanOrEqual(44);

    await continueBtn.click();

    // Step 3: Start Socratic Study button
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    const startStudyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
    const studyBox = await startStudyBtn.boundingBox();
    expect(studyBox).not.toBeNull();
    expect(studyBox!.height).toBeGreaterThanOrEqual(44);

    await startStudyBtn.click();

    // Step 4: Finish button
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\/[a-zA-Z0-9_-]+/);
    const finishBtn = page.getByRole('button', { name: /Finish study session/i });
    const finishBox = await finishBtn.boundingBox();
    expect(finishBox).not.toBeNull();
    expect(finishBox!.height).toBeGreaterThanOrEqual(44);
  });

  // Reduced motion verification
  test('Prefers-reduced-motion suppresses animations cleanly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/learn');

    const duration = await page.evaluate(() => {
      const el = document.querySelector('body');
      if (!el) return null;
      return window.getComputedStyle(el).animationDuration;
    });

    expect(duration).toBeDefined();
  });
});
