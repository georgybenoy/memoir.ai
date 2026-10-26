import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('End-to-End Learning Journey & Resilience', () => {
  test('executes complete journey: no-login access, ingest, path, recall cycle, persistence, backup/restore, review queue, mobile, keyboard, and notification honesty', async ({ page }) => {
    test.setTimeout(120000);

    // -------------------------------------------------------------------------
    // 1. Open workspace without login & verify zero notification prompt on load
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 800 });

    // Spy on Notification.requestPermission to verify it is NEVER invoked automatically
    await page.addInitScript(() => {
      (window as unknown as { __notificationRequested?: boolean }).__notificationRequested = false;
      if (typeof Notification !== 'undefined') {
        const orig = Notification.requestPermission;
        Notification.requestPermission = function (...args) {
          (window as unknown as { __notificationRequested?: boolean }).__notificationRequested = true;
          return orig ? orig.apply(this, args) : Promise.resolve('denied');
        };
      }
    });

    await page.goto('/');

    // Verify public landing page renders without any login/signup barriers
    await expect(page.getByRole('heading', { name: /Learn deeply\. Remember longer\./i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start learning' }).first()).toBeVisible();

    // Verify Notification permission is NOT requested automatically on load
    const wasRequested = await page.evaluate(() => {
      return (window as unknown as { __notificationRequested?: boolean }).__notificationRequested;
    });
    expect(wasRequested).toBe(false);

    // Click "Start learning" to enter the workspace
    await page.getByRole('link', { name: 'Start learning' }).first().click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole('heading', { name: 'What are you learning today?' })).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // 2. Upload sample note & generate study path
    // -------------------------------------------------------------------------
    // Set up mock AI endpoint for concept extraction
    await page.route('**/api/ai/extract-concepts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              tempId: 'c-process',
              title: 'Process Management & Isolation',
              summary: 'A process is an isolated execution context with its own address space, memory pages, and PID.',
              canonicalExplanation: 'Processes provide hardware-isolated address spaces and resource management for running programs.',
              keyTerms: ['Process', 'Address Space', 'PID'],
              sourceChunkIds: ['mock-chunk-1'],
              confidence: 0.95,
              prerequisiteTitles: [],
            },
            {
              tempId: 'c-threads',
              title: 'Threads & Shared Memory',
              summary: 'Threads are lightweight execution units within a process sharing the same virtual address space.',
              canonicalExplanation: 'Threads share process memory but maintain independent execution stacks and registers.',
              keyTerms: ['Thread', 'Shared Memory', 'Concurrency'],
              sourceChunkIds: ['mock-chunk-1'],
              confidence: 0.92,
              prerequisiteTitles: ['Process Management & Isolation'],
            },
          ],
        }),
      });
    });

    // Navigate to Study Materials
    await page.goto('/app/materials');
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible();

    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');
    await fileInput.setInputFiles(txtPath);

    // Verify document preview card appears
    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });

    // Click "Analyze notes"
    const analyzeBtn = page.getByRole('button', { name: /analyze notes/i });
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Verify concepts tab displays extracted concepts
    await expect(page.getByRole('heading', { name: 'Process Management & Isolation' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Threads & Shared Memory' })).toBeVisible();

    // Navigate to Study Path
    await page.goto('/app/path');
    await expect(page.getByText('STUDY PATH')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'sample-note.txt' })).toBeVisible();

    // -------------------------------------------------------------------------
    // 3. Complete an answer + feedback cycle with mock evaluation
    // -------------------------------------------------------------------------
    // Mock question generation and evaluation endpoints
    await page.route('**/api/ai/generate-question', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: 'Explain what constitutes a process in modern operating systems and how it differs from a thread.',
          style: 'explain_plain',
          expectedKeyPoints: ['address space', 'PID', 'shared memory'],
          sourceChunkIds: ['mock-chunk-1'],
        }),
      });
    });

    await page.route('**/api/ai/evaluate-answer', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          correctness: 82,
          completeness: 80,
          reasoning: 80,
          terminology: 85,
          relevance: 85,
          misconceptions: [],
          missingKeyPoints: [],
          strengths: ['Clearly contrasted isolated virtual address spaces with lightweight threads sharing memory.'],
          correctionGuidance: 'Strong explanation! You clearly contrasted isolated virtual address spaces with lightweight threads sharing memory.',
          suggestedNextAction: 'Proceed to the next concept in your path.',
          rationale: 'Comprehensive and technically accurate answer.',
        }),
      });
    });

    // Start learning foundational concept from the study path
    const learnBtn = page.getByRole('button', { name: /Learn this concept/i }).first();
    await expect(learnBtn).toBeVisible({ timeout: 15000 });
    await learnBtn.click();

    // Verify Tutor view opens for this concept
    await expect(page).toHaveURL(/\/app\/tutor/);
    await expect(page.getByRole('heading', { name: 'Canonical Explanation & Mechanism' })).toBeVisible({ timeout: 15000 });

    // Click "I'm ready to test recall" to request question
    const readyBtn = page.getByRole('button', { name: /ready to test recall/i });
    await expect(readyBtn).toBeVisible({ timeout: 10000 });
    await readyBtn.click();

    // Click "Generate recall question" to start recall question practice
    const generateQBtn = page.getByRole('button', { name: /generate recall question/i });
    await expect(generateQBtn).toBeVisible({ timeout: 10000 });
    await generateQBtn.click();

    // Type answer into recall answer input
    const answerInput = page.locator('#recall-answer-input');
    await expect(answerInput).toBeVisible({ timeout: 15000 });
    await answerInput.fill(
      'A process is an isolated instance of execution with its own virtual address space, PID, and memory pages. Threads are execution contexts inside a process that share that memory space.',
    );

    // Select confidence rating (Very confident / 3)
    const confidenceRadio = page.getByRole('radio', { name: /^very confident/i });
    await expect(confidenceRadio).toBeVisible();
    await confidenceRadio.click();

    // Submit answer
    const submitBtn = page.getByRole('button', { name: /check answer/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify feedback card appears with quality grade and evaluation mode badge
    await expect(page.getByText('Strong Conceptual Recall')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/SM-2 Quality Grade: 4 \/ 5/i)).toBeVisible();
    await expect(page.getByText(/Hybrid|Judge-Only/i).first()).toBeVisible();

    // -------------------------------------------------------------------------
    // 4. Reload and verify restored progress
    // -------------------------------------------------------------------------
    await page.reload();

    // Confirm session or feedback is restored from IndexedDB
    await expect(page.getByText(/Strong Conceptual Recall|SM-2 Quality Grade/i).first()).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // 5. Export backup, clear data, import backup
    // -------------------------------------------------------------------------
    await page.goto('/app/settings');
    await expect(page.getByRole('heading', { name: 'Data & Settings' })).toBeVisible();

    // Trigger backup export and verify download
    const exportBtn = page.getByRole('button', { name: 'Export backup file' });
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^edumentor-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Read exported backup stream to buffer
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const backupBuffer = Buffer.concat(chunks);
    const backupJson = JSON.parse(backupBuffer.toString('utf-8'));
    expect(backupJson.schemaVersion).toBe(2);
    expect(backupJson.appVersion).toBe('0.1.0');
    expect(backupJson.documents.length).toBeGreaterThan(0);

    // Clear all local data
    const clearBtn = page.getByRole('button', { name: 'Clear all local data' });
    await clearBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'I understand, delete everything' }).click();
    await expect(page.getByText('Local Data Cleared')).toBeVisible();

    // Verify data cleared: navigate to materials and ensure list is empty
    await page.goto('/app/materials');
    await expect(page.locator('#preview-heading')).not.toBeVisible();

    // Return to settings and import backup file
    await page.goto('/app/settings');
    const backupInput = page.locator('#backup-file-input');
    await backupInput.setInputFiles({
      name: 'restore-test.json',
      mimeType: 'application/json',
      buffer: backupBuffer,
    });

    // Preview dialog should appear with conflict policies
    const importDialog = page.getByRole('dialog');
    await expect(importDialog).toBeVisible({ timeout: 10000 });
    await expect(importDialog.getByText('Import Backup Preview').first()).toBeVisible();
    await expect(importDialog.getByText('Documents')).toBeVisible();

    // Select "Keep Local" or "Prefer Imported" policy and execute restore
    await importDialog.getByRole('button', { name: 'Import backup' }).click();
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 15000 });

    // Verify data restored in materials
    await page.goto('/app/materials');
    await expect(page.getByText('sample-note.txt').first()).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // 6. Due review after advancing the clock / scheduling
    // -------------------------------------------------------------------------
    // Seed an overdue SM-2 review item directly into IndexedDB
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('IndexedDB evaluate timed out after 5000ms'));
        }, 5000);

        try {
          const req = indexedDB.open('edumentor-local');
          req.onerror = () => {
            clearTimeout(timeout);
            reject(req.error || new Error('IndexedDB open error'));
          };
          req.onsuccess = () => {
            try {
              const db = req.result;
              const tx = db.transaction(['spacedRepetitionStates', 'concepts'], 'readwrite');
              const conceptStore = tx.objectStore('concepts');
              const smStore = tx.objectStore('spacedRepetitionStates');

              const yesterday = new Date(Date.now() - 86400000).toISOString();
              conceptStore.put({
                id: 'concept-overdue-1',
                title: 'Process Management & Isolation',
                summary: 'Process memory isolation and thread execution.',
                canonicalExplanation: 'Processes provide memory isolation.',
                keyTerms: ['process', 'thread'],
                sourceChunkIds: [],
                tier: 0,
                status: 'available',
                confidence: 0.95,
                extractionOrder: 1,
                createdAt: yesterday,
                updatedAt: yesterday,
              });
              smStore.put({
                id: 'sr-overdue-1',
                conceptId: 'concept-overdue-1',
                repetitions: 1,
                easinessFactor: 2.5,
                intervalDays: 1,
                lastReviewedAt: yesterday,
                nextDueAt: yesterday,
                lastQuality: 4,
                weak: false,
                reviewHistory: [],
                createdAt: yesterday,
                updatedAt: yesterday,
              });

              tx.oncomplete = () => {
                clearTimeout(timeout);
                db.close();
                resolve();
              };
              tx.onerror = () => {
                clearTimeout(timeout);
                db.close();
                reject(tx.error || new Error('Transaction error'));
              };
            } catch (err) {
              clearTimeout(timeout);
              reject(err);
            }
          };
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });

    // Navigate to review page
    await page.goto('/app/review');
    await expect(page.getByRole('heading', { name: 'Spaced Review Queue' })).toBeVisible({ timeout: 15000 });
    // Item should be listed with "Start review" action
    await expect(page.getByRole('button', { name: /start review|revise now/i }).first()).toBeVisible({ timeout: 15000 });

    // -------------------------------------------------------------------------
    // 7. Mobile layout responsiveness
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/app');

    // Desktop sidebar should be hidden on mobile
    const desktopNav = page.getByLabel('Navigation sidebar');
    await expect(desktopNav).toBeHidden();

    // Mobile menu toggle button should be visible
    const mobileMenuBtn = page.getByRole('button', { name: /open navigation menu/i });
    await expect(mobileMenuBtn).toBeVisible();
    await mobileMenuBtn.click();

    // Drawer should show navigation links
    await expect(page.getByText('Navigation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Study Materials' })).toBeVisible();

    // Close mobile drawer
    await page.getByRole('button', { name: /close navigation/i }).click();
    await expect(page.getByText('Navigation')).not.toBeVisible();

    // -------------------------------------------------------------------------
    // 8. Keyboard navigation: Skip Link
    // -------------------------------------------------------------------------
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app');

    // Press Tab once to focus skip link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();

    // Press Enter to activate skip link
    await page.keyboard.press('Enter');
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeInViewport();
  });
});
