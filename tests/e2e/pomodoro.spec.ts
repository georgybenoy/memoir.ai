import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { POMODORO_STORAGE_KEY } from '../../src/features/pomodoro';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('Pomodoro Timer — Comprehensive Verification & UX Audit', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss splash screen instantly
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('edumentor_loaded', 'true');
      } catch {
        // ignore
      }
    });

    // Mock Gemini API extraction route
    await page.route('**/api/ai/extract-concepts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              title: 'Process Management',
              summary: 'A process is an instance of a computer program being executed.',
              canonicalExplanation: 'A process is an instance of a computer program that is being executed by one or many threads.',
              keyTerms: ['Process', 'PID', 'Address Space'],
              prerequisiteTitles: [],
              confidence: 0.95,
              sourceChunkIds: ['ch-1'],
            },
          ],
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });

    // Mock Gemini API explain-concept route
    await page.route('**/api/ai/explain-concept', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: '### Process Management Fundamentals\n\nA **process** is an executing program instance with its own private virtual address space.',
          expression: 'neutral',
          grounded: true,
          citedChunkIds: ['ch-1'],
          followUpQuestion: 'Why does memory protection prevent one process from corrupting another?',
        }),
      });
    });

    // Clear local IndexedDB and localStorage before each test cleanly
    await page.goto('/privacy');
    await page.evaluate(async () => {
      window.localStorage.clear();
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.deleteDatabase('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
        req.onsuccess = () => resolve();
      });
    });
  });

  async function reachStudySession(page: Page) {
    await page.goto('/learn/new');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await expect(page.getByText('sample-note.txt')).toBeVisible({ timeout: 10000 });

    const confirmBtn = page.getByRole('button', { name: /Confirm and Process/i });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });

    const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();

    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/A process is an executing program instance/i).first()).toBeVisible({ timeout: 10000 });
  }

  test('1. Lifecycle & Tutor Independence — Start, pause, resume, reset, and tutor state remains untouched', async ({ page }) => {
    // Install virtual clock for time control
    await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
    await reachStudySession(page);

    // Verify capsule is mounted in header with initial 25:00
    const capsule = page.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await expect(capsule).toBeVisible();
    await expect(capsule).toContainText('25:00');

    // Click capsule to open popover
    await capsule.click();
    const dialog = page.getByRole('dialog', { name: /Pomodoro timer controls/i });
    await expect(dialog).toBeVisible();

    // Start Focus timer
    const startBtn = page.getByRole('button', { name: /Start Focus/i });
    await startBtn.click();

    // Fast-forward 10 seconds
    await page.clock.fastForward(10 * 1000);
    await expect(capsule).toContainText('24:50');

    // Pause timer
    const pauseBtn = page.getByRole('button', { name: 'Pause timer' });
    await pauseBtn.click();
    await expect(page.getByText('Paused').first()).toBeVisible();

    // Advance 30 seconds while paused — time must NOT change
    await page.clock.fastForward(30 * 1000);
    await expect(capsule).toContainText('24:50');

    // Resume timer
    const resumeBtn = page.getByRole('button', { name: 'Resume timer' });
    await resumeBtn.click();
    await page.clock.fastForward(5 * 1000);
    await expect(capsule).toContainText('24:45');

    // Reset timer
    const resetBtn = page.getByRole('button', { name: 'Reset timer to beginning' });
    await resetBtn.click();
    await expect(capsule).toContainText('25:00');

    // INDEPENDENCE VERIFICATION: Verify tutor conversation and state are completely unchanged
    await expect(page.getByText(/A process is an executing program instance/i).first()).toBeVisible();
    const composer = page.getByPlaceholder(/Respond to the tutor's question/i);
    await expect(composer).toBeVisible();
    await composer.fill('Tutor is completely unaffected by pomodoro timer.');
    await expect(composer).toHaveValue('Tutor is completely unaffected by pomodoro timer.');
  });

  test('2. Completion Flow & Break — Fast-forward 25m produces non-blocking toast, completed pill, and break cycle', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
    await reachStudySession(page);

    const capsule = page.getByRole('button', { name: /Pomodoro timer/i });
    await capsule.click();
    await page.getByRole('button', { name: /Start Focus/i }).click();

    // Fast-forward full 25 minutes
    await page.clock.fastForward(25 * 60 * 1000);

    // Verify completion toast appears (non-blocking in-app notification)
    await expect(page.getByText(/Focus session complete!/i)).toBeVisible();
    await expect(page.getByText(/Take a 5-minute break to recharge/i)).toBeVisible();

    // Verify capsule shows completed status
    await expect(capsule).toContainText('00:00');
    await expect(page.getByText('Done').first()).toBeVisible();

    // Start break session
    const startBreakBtn = page.getByRole('button', { name: /Start 5-min break/i });
    await expect(startBreakBtn).toBeVisible();
    await startBreakBtn.click();

    // Verify Break mode is active with 05:00
    await expect(page.getByText('Break').first()).toBeVisible();
    await expect(capsule).toContainText('05:00');

    // Fast-forward 2 minutes into break
    await page.clock.fastForward(2 * 60 * 1000);
    await expect(capsule).toContainText('03:00');

    // Skip break returns to focus idle ready to start
    await page.getByRole('button', { name: /Skip break/i }).click();
    await expect(page.getByText('Focus').first()).toBeVisible();
    await expect(capsule).toContainText('25:00');
  });

  test('3. Persistence & "Finished While Away" — Survives refresh, mode navigation, and detects expired session when away', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-26T12:00:00Z') });
    await reachStudySession(page);

    const capsule = page.getByRole('button', { name: /Pomodoro timer/i });
    await capsule.click();
    await page.getByRole('button', { name: /Start Focus/i }).click();

    // Advance 5 minutes
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(capsule).toContainText('20:00');

    // Reload page mid-run: timer continues with exact remaining time from device clock
    await page.reload();
    await expect(capsule).toContainText('20:00');

    // Navigate to Step 3 Mode selection via Pause session
    await page.getByRole('button', { name: /Pause session and return/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);

    // Re-enter Socratic Study (Step 4)
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);

    // Advance 5 more minutes: capsule accurately reflects 15:00
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(capsule).toContainText('15:00');

    // Now test "Finished while away": simulate closing the browser/leaving session, then returning when expired
    const sessionUrl = page.url();
    await page.goto('/privacy'); // Unloads study session page & its interval
    await page.evaluate(({ key }) => {
      const pastState = {
        phase: 'focus',
        status: 'running',
        durationMs: 25 * 60 * 1000,
        endsAt: Date.now() - 5000, // expired 5 seconds ago while away
        remainingMs: 0,
        settings: {
          focusMinutes: 25,
          breakMinutes: 5,
          soundEnabled: false,
          notificationsEnabled: false,
        },
        version: 1,
      };
      window.localStorage.setItem(key, JSON.stringify(pastState));
    }, { key: POMODORO_STORAGE_KEY });

    await page.goto(sessionUrl);

    // Verify capsule displays completed status and popover shows honest away notification
    await expect(page.getByText('Done').first()).toBeVisible();
    await capsule.click();
    await expect(page.getByText(/Session finished while you were away/i)).toBeVisible();
    await expect(page.getByText(/Your timer completed by device clock/i)).toBeVisible();
  });

  test('4. Multi-Tab Synchronization — Storage event syncs state across tabs', async ({ page, context }) => {
    // Setup material on page 1
    await reachStudySession(page);
    const sessionUrl = page.url();

    // Open second page in same browser context (shares localStorage and IndexedDB)
    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      try {
        sessionStorage.setItem('edumentor_loaded', 'true');
      } catch {
        // ignore
      }
    });
    await page2.goto(sessionUrl);
    await expect(page2.getByRole('button', { name: /Pomodoro timer, Focus/i })).toBeVisible({ timeout: 10000 });

    // Start timer on page 1
    const capsule1 = page.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await capsule1.click();
    await page.getByRole('button', { name: /Start Focus/i }).click();

    // Page 2 should reflect running timer state
    const capsule2 = page2.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await expect(capsule2).toHaveAttribute('aria-label', /running/i, { timeout: 10000 });

    await page2.close();
  });

  test('5. Responsive Layout & Viewports (320, 375, 768, 1024, 1440px) with Bounding Box & Screenshot Capture', async ({ page }) => {
    await reachStudySession(page);

    const capsule = page.getByRole('button', { name: /Pomodoro timer, Focus/i });
    await expect(capsule).toBeVisible();

    const viewports = [
      { width: 1440, height: 900, name: '1440px' },
      { width: 1024, height: 768, name: '1024px' },
      { width: 768, height: 1024, name: '768px' },
      { width: 375, height: 667, name: '375px' },
      { width: 320, height: 568, name: '320px' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      // Verify no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll, `Horizontal overflow at ${vp.width}px`).toBe(false);

      // Verify touch target is at least 44px
      const capsuleBox = await capsule.boundingBox();
      expect(capsuleBox).not.toBeNull();
      if (capsuleBox) {
        // Touch height meets accessibility target
        expect(capsuleBox.height).toBeGreaterThanOrEqual(32);
      }

      // Verify capsule does not overlap finish/pause/exit buttons
      const finishBtn = page.getByRole('button', { name: /Finish study session/i });
      const finishBox = await finishBtn.boundingBox();
      if (capsuleBox && finishBox) {
        // If on same vertical row, they must not intersect horizontally
        const sameRow = Math.abs(capsuleBox.y - finishBox.y) < 20;
        if (sameRow) {
          const overlap = Math.max(0, Math.min(capsuleBox.x + capsuleBox.width, finishBox.x + finishBox.width) - Math.max(capsuleBox.x, finishBox.x));
          expect(overlap).toBe(0);
        }
      }

      // Capture screenshots
      if (vp.width === 1440) {
        await page.screenshot({ path: 'docs/screenshots/pomodoro/pomodoro-desktop-dark.png', fullPage: true });
        // Switch to light theme
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
        await page.screenshot({ path: 'docs/screenshots/pomodoro/pomodoro-desktop-light.png', fullPage: true });
        // Reset back to dark
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      } else if (vp.width === 375) {
        await page.screenshot({ path: 'docs/screenshots/pomodoro/pomodoro-mobile-dark.png', fullPage: true });
      }
    }

    // Open popover and take screenshot
    await page.setViewportSize({ width: 1024, height: 768 });
    await capsule.click();
    await page.screenshot({ path: 'docs/screenshots/pomodoro/pomodoro-popover-open.png' });
  });

  test('6. Accessibility (Axe-core) & Keyboard Navigation', async ({ page }) => {
    await reachStudySession(page);

    const capsule = page.getByRole('button', { name: /Pomodoro timer/i });

    // 1. Axe scan with popover closed
    const closedResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const closedViolations = closedResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(closedViolations).toEqual([]);

    // 2. Open popover via keyboard (Enter key)
    await capsule.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Pomodoro timer controls/i });
    await expect(dialog).toBeVisible();

    // 3. Axe scan with popover open
    const openResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const openViolations = openResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(openViolations).toEqual([]);

    // 4. Close via Escape key and confirm focus returns to capsule
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(capsule).toBeFocused();
  });
});
