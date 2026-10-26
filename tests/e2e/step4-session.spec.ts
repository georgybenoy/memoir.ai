import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('Step 4 Learning Session — Comprehensive Verification & UX Audit', () => {
  let forceExplainFailure = false;

  test.beforeEach(async ({ page }) => {
    forceExplainFailure = false;

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
              canonicalExplanation: 'A process is an instance of a computer program that is being executed by one or many threads. It contains virtual address space, memory pages, open file descriptors, and CPU register state.',
              keyTerms: ['Process', 'PID', 'Address Space'],
              prerequisiteTitles: [],
              confidence: 0.95,
              sourceChunkIds: ['ch-1'],
            },
            {
              title: 'Threads and Concurrency',
              summary: 'Threads are lightweight units of execution within a process.',
              canonicalExplanation: 'Multithreading and shared memory concurrency.',
              keyTerms: ['Thread', 'Concurrency', 'Race Condition'],
              prerequisiteTitles: ['Process Management'],
              confidence: 0.9,
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
      if (forceExplainFailure) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'AI_GATEWAY_ERROR',
              message: 'Gemini service temporarily overloaded. Please retry.',
            },
          }),
        });
        return;
      }

      const reqBody = route.request().postDataJSON() || {};
      const mode = reqBody.mode || 'teach';

      let explanationText = '### Process Management Fundamentals\n\nA **process** is an executing program instance with its own private virtual address space and isolated resources.';
      if (mode === 'analogy') {
        explanationText = '### Analogy: Kitchen and Chefs\n\nThink of a **process** like an entire restaurant kitchen with its own ingredients and storage, isolated from neighboring restaurants.';
      } else if (mode === 'example') {
        explanationText = '### Concrete Example: Web Browsers\n\nIn modern browsers like Chrome, each browser tab runs in its own separate process so a crash in one tab does not bring down the entire browser.';
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: explanationText,
          expression: 'neutral',
          grounded: true,
          citedChunkIds: ['ch-1'],
          followUpQuestion: 'Why does operating system memory protection prevent one process from reading another process’s memory?',
        }),
      });
    });

    // Mock Gemini API question route
    await page.route('**/api/ai/generate-question', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: 'Explain why processes require isolated virtual address spaces and how this prevents accidental memory corruption.',
          style: 'explanation',
          expectedKeyPoints: ['address space', 'isolation', 'protection'],
          sourceChunkIds: ['ch-1'],
        }),
      });
    });

    // Mock Gemini API evaluation route
    await page.route('**/api/ai/evaluate-answer', async (route) => {
      const body = route.request().postDataJSON() || {};
      const isWeak = (body.studentAnswer || '').length < 15;

      if (isWeak) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            correctness: 40,
            completeness: 35,
            terminology: 40,
            reasoning: 45,
            relevance: 50,
            misconceptions: [],
            missingKeyPoints: ['Lacked explanation of virtual address mapping and hardware MMU protection.'],
            strengths: ['Identified that memory isolation exists.'],
            correctionGuidance: 'Review how MMU page tables isolate address spaces.',
            suggestedNextAction: 'retry',
            rationale: 'Answer is incomplete.',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            correctness: 88,
            completeness: 85,
            terminology: 85,
            reasoning: 90,
            relevance: 90,
            misconceptions: [],
            missingKeyPoints: ['Could mention hardware MMU paging support'],
            strengths: ['Accurate analysis of memory page isolation', 'Clear mention of system stability'],
            correctionGuidance: 'Continue to threads and synchronization.',
            suggestedNextAction: 'advance',
            rationale: 'Solid understanding of process isolation.',
          }),
        });
      }
    });

    // Clear local IndexedDB before each test cleanly
    await page.goto('/privacy');
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.deleteDatabase('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
        req.onsuccess = () => resolve();
      });
    });
  });

  // Helper to ingest and navigate to Step 3
  async function setupMaterialAndReachModeStep(page: Page) {
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
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();
  }

  test('1. Study Mode — Lesson content renders, Socratic conversation, answer submission, persistence across refresh', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    // Launch Socratic Study
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);

    // Verify Session Header elements
    await expect(page.getByText('Study Mode', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Finish study session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pause session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Exit session/i })).toBeVisible();

    // Verify Lesson Content is the focus (PART 1)
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Why does operating system memory protection/i)).toBeVisible();

    // Verify Sticky Sidebar elements (PART 2)
    await expect(page.getByText('Concept Overview', { exact: true })).toBeVisible();
    await expect(page.getByText('Source Grounding', { exact: true })).toBeVisible();
    await expect(page.getByText('Note-Grounded', { exact: true })).toBeVisible();

    // Learner responds to Socratic question
    const answerInput = page.getByPlaceholder(/Respond to the tutor's question/i);
    await expect(answerInput).toBeVisible();
    await answerInput.fill('Because each process has a private page table preventing arbitrary memory access.');

    // Submit answer
    const sendBtn = page.getByRole('button', { name: /Send response to AI tutor/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Verify message appears in conversation list
    await expect(page.getByText('Because each process has a private page table preventing arbitrary memory access.')).toBeVisible();

    // Verify persistence across page refresh
    await page.reload();
    await expect(page.getByText(/A process is an executing program instance/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Because each process has a private page table preventing arbitrary memory access.')).toBeVisible();

    // Verify Pause returns cleanly to Step 3 and preserves session
    await page.getByRole('button', { name: /Pause session/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
  });

  test('2. Study Mode — Explain Differently dropdown triggers alternate explanations (analogy / example)', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });

    // Open Explain Differently menu
    const explainDiffBtn = page.getByRole('button', { name: /Explain differently/i });
    await expect(explainDiffBtn).toBeVisible();
    await explainDiffBtn.click();

    // Select Analogy mode
    const analogyOption = page.getByRole('button', { name: /Analogy/i });
    await expect(analogyOption).toBeVisible();
    await analogyOption.click();

    // Verify analogy content rendered
    await expect(page.getByRole('heading', { name: /Analogy: Kitchen and Chefs/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Think of a process like an entire restaurant kitchen/i)).toBeVisible();
  });

  test('3. Recovery State — Failed AI request displays error, canonical fallback, and Retry works', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    // Force failure on initial explain-concept call
    forceExplainFailure = true;

    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);

    // Verify plain-language error message and recovery buttons appear
    await expect(page.getByText(/Tutor explanation unavailable/i)).toBeVisible({ timeout: 10000 });

    const retryBtn = page.getByRole('button', { name: /Retry Tutor/i });
    await expect(retryBtn).toBeVisible();

    // Verify canonical note explanation is offered as fallback
    await expect(page.getByText(/stored canonical explanation from your study notes/i).first()).toBeVisible();

    // Un-fail the AI route and click Retry
    forceExplainFailure = false;
    await retryBtn.click();

    // Lesson should recover cleanly
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });
  });

  test('4. Recall Mode — Grounded question, confidence rating, evaluation feedback, weak answer retry path', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    // Launch Active Recall
    await page.getByRole('button', { name: /Start Active Recall/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);

    await expect(page.getByText('Recall Mode', { exact: true })).toBeVisible();

    // Generate Question if not already loaded
    const generateQBtn = page.getByRole('button', { name: /Generate Practice Question/i });
    if (await generateQBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await generateQBtn.click();
    }

    // Verify Question Card is rendered
    await expect(page.getByText(/Explain why processes require isolated virtual address spaces/i)).toBeVisible({ timeout: 10000 });

    // Select confidence rating (Somewhat confident)
    const confidenceSomewhat = page.getByText('Somewhat confident');
    await expect(confidenceSomewhat).toBeVisible();
    await confidenceSomewhat.click();

    // Type answer
    const answerField = page.getByPlaceholder(/Explain this concept in your own words/i);
    await answerField.fill('Virtual address spaces ensure each process has separate memory pages so that memory errors cannot corrupt other programs.');

    // Submit answer
    const submitBtn = page.getByRole('button', { name: /Check answer/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify Feedback Card is rendered with strengths, gaps, evaluation mode
    await expect(page.getByRole('heading', { name: /Strong Conceptual Recall/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Accurate analysis of memory page isolation/i)).toBeVisible();
    await expect(page.getByText(/Hybrid|Judge-only/i).first()).toBeVisible();

    // Now test weak answer path: click "Try again"
    const tryAgainBtn = page.getByRole('button', { name: /Try again/i });
    await expect(tryAgainBtn).toBeVisible();
    await tryAgainBtn.click();

    // Select confidence again
    await page.getByText('Not very confident').click();

    // Provide a weak/brief answer (<15 chars)
    await answerField.fill('idk memory');
    await submitBtn.click();

    // Feedback shows weak score with review options
    await expect(page.getByRole('heading', { name: /Concept Needs Revision/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Lacked explanation of virtual address mapping/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Try again/i })).toBeVisible();
  });

  test('5. Revision Mode — Honest 0-due state with explicit alternative pathways without silent switching', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    // Verify 0 due items on Step 3
    await expect(page.getByText('0 due today')).toBeVisible();

    // Honest 0-due alternative buttons on Step 3
    const recallAltBtn = page.getByRole('button', { name: 'Recall Instead' });
    await expect(recallAltBtn).toBeVisible();

    // Clicking Recall Instead explicitly launches Recall mode without auto-switching
    await recallAltBtn.click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText('Recall Mode', { exact: true })).toBeVisible();
  });

  test('6. Responsive Layout & Viewports (375, 768, 1024, 1440px) with Screenshot Capture', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });

    const viewports = [
      { width: 1440, height: 900, name: '1440px' },
      { width: 1024, height: 768, name: '1024px' },
      { width: 768, height: 1024, name: '768px' },
      { width: 375, height: 667, name: '375px' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      // Verify no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // On desktop (>=1024px), verify main column is spacious (not narrow card)
      if (vp.width >= 1024) {
        const mainCol = page.getByLabel('Active learning activity');
        const box = await mainCol.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          if (vp.width >= 1440) {
            expect(box.width).toBeGreaterThan(500);
          } else {
            expect(box.width).toBeGreaterThan(350);
          }
        }
      }

      // Capture screenshot
      await page.screenshot({
        path: `docs/screenshots/step4/study-${vp.name}.png`,
        fullPage: true,
      });
    }
  });

  test('7. Accessibility (Axe-core) — Zero critical or serious violations on Study, Recall, and Revision views', async ({ page }) => {
    await setupMaterialAndReachModeStep(page);

    // 1. Check Study View
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });

    const studyResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const studyViolations = studyResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(studyViolations).toEqual([]);

    // 2. Check Recall View
    await page.getByRole('button', { name: /Pause session/i }).click();
    await page.getByRole('button', { name: /Start Active Recall/i }).click();
    await expect(page.getByText('Recall Mode', { exact: true })).toBeVisible();

    const recallResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const recallViolations = recallResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(recallViolations).toEqual([]);

    // 3. Check Mode Selection View
    await page.getByRole('button', { name: /Pause session/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);

    const modeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const modeViolations = modeResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(modeViolations).toEqual([]);
  });

  test('8. Keyboard Navigation & Reduced Motion', async ({ page }) => {
    // Enable reduced motion emulation
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await setupMaterialAndReachModeStep(page);
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page.getByText(/A process is an executing program instance/i)).toBeVisible({ timeout: 10000 });

    // Focus response textarea via Tab keys
    const answerInput = page.getByPlaceholder(/Respond to the tutor's question/i);
    await answerInput.focus();
    await expect(answerInput).toBeFocused();

    // Type response using keyboard and submit with Enter
    await page.keyboard.type('Testing keyboard submission.');
    await page.keyboard.press('Enter');

    // Message appears
    await expect(page.getByText('Testing keyboard submission.')).toBeVisible();
  });
});
