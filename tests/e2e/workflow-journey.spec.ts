import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('Phase R3: 4-Step Guided Workflow End-to-End Journeys', () => {
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
              canonicalExplanation: 'Detailed explanation of processes, memory pages, and PIDs.',
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
            {
              title: 'Synchronization Primitives',
              summary: 'Mutual exclusion primitives like mutexes and semaphores.',
              canonicalExplanation: 'Preventing critical section race conditions and deadlocks.',
              keyTerms: ['Mutex', 'Semaphore', 'Deadlock'],
              prerequisiteTitles: ['Threads and Concurrency'],
              confidence: 0.92,
              sourceChunkIds: ['ch-1'],
            },
          ],
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });

    // Mock Gemini API question route
    await page.route('**/api/ai/generate-question', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: {
            prompt: 'Explain how threads differ from processes in terms of memory address space.',
            questionStyle: 'comparison',
            difficulty: 3,
            referencePoints: ['Threads share memory address space', 'Processes have isolated address space'],
            sourceChunkIds: ['ch-1'],
            expectedKeyPoints: ['address space', 'isolation', 'lightweight'],
          },
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });

    // Clear local IndexedDB before each test to guarantee isolated state
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local', 3);
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(storeNames, 'readwrite');
          tx.onerror = () => reject(tx.error);
          for (const name of storeNames) {
            tx.objectStore(name).clear();
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();
  });

  test('Journey 1: Home → Start Learning → Upload → Preview → Process → Organise → Mode → Launch Study', async ({ page }) => {
    // 1. Click Start Learning on Home page
    const startLearningBtn = page.getByRole('button', { name: 'Start Learning' }).first();
    await startLearningBtn.click();

    // Verify arrived at Step 1 (/learn/new)
    await expect(page).toHaveURL(/\/learn\/new/);
    await expect(page.getByRole('heading', { name: 'Add Study Material', level: 1 })).toBeVisible();

    // 2. Select file via picker
    const fileInput = page.locator('input[type="file"]');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');
    await fileInput.setInputFiles(txtPath);

    // 3. Extracted text preview should appear
    await expect(page.getByText('sample-note.txt')).toBeVisible();
    await expect(page.getByText(/Extracted Text Preview/i)).toBeVisible();

    // 4. Click "Confirm and Process"
    const confirmBtn = page.getByRole('button', { name: /Confirm and Process/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 5. Arrive at Step 2 (Organise) and wait for processing to complete
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    await expect(page.getByRole('heading', { name: 'Organise & Review Units', level: 1 })).toBeVisible();

    // Verify units appear
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Unit 1')).toBeVisible();

    // 6. Click "Continue to Mode Selection"
    const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // 7. Arrive at Step 3 (Choose Mode)
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();

    // 8. Launch Socratic Study
    const startStudyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
    await expect(startStudyBtn).toBeVisible();
    await startStudyBtn.click();

    // 9. Arrive at Step 4 (Session Host)
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\/[a-zA-Z0-9_-]+/);
    await expect(page.getByText(/Study Mode/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Pause/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Exit/i })).toBeVisible();
  });

  test('Journey 2: Switch mode without re-upload (Study → Step 3 → Recall on SAME material, exactly 1 DB record)', async ({ page }) => {
    // 1. Go to Step 1 and upload
    await page.goto('/learn/new');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();

    // 2. Wait for Step 2 and proceed to Step 3
    await expect(page).toHaveURL(/\/learn\/([a-zA-Z0-9_-]+)\/organise/);
    const url = page.url();
    const materialId = url.split('/')[4];

    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Continue to Mode Selection/i }).click();

    // 3. Launch Study mode
    await expect(page).toHaveURL(`/learn/${materialId}/mode`);
    await page.getByRole('button', { name: /Start Socratic Study/i }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${materialId}/session/`));

    // 4. Click Pause to return to Step 3 without data loss
    await page.getByRole('button', { name: /Pause/i }).click();
    await expect(page).toHaveURL(`/learn/${materialId}/mode`);

    // 5. Launch Recall mode on the SAME material
    await page.getByRole('button', { name: /Start Active Recall/i }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${materialId}/session/`));
    await expect(page.getByText(/Recall Mode/i)).toBeVisible();

    // 6. Assert exactly ONE material record exists in IndexedDB
    const docCount = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readonly');
          const countReq = tx.objectStore('documents').count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => reject(countReq.error);
        };
      });
    });
    expect(docCount).toBe(1);
  });

  test('Journey 3: Choose saved material from Home', async ({ page }) => {
    // 1. First upload a document
    await page.goto('/learn/new');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });

    // 2. Go back to Home
    await page.goto('/learn');
    await expect(page.getByText('sample-note.txt')).toBeVisible();

    // 3. Open the saved material directly
    const openBtn = page.getByRole('button', { name: /Choose Mode/i }).first();
    await openBtn.click();

    // Should navigate straight to Step 3
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();
  });

  test('Journey 4: Page refresh on each step restores persisted state', async ({ page }) => {
    // Step 1: refresh restores clean Step 1
    await page.goto('/learn/new');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Add Study Material', level: 1 })).toBeVisible();

    // Ingest material
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();

    // Step 2: refresh restores Step 2 and units
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Organise & Review Units', level: 1 })).toBeVisible();
    await expect(page.getByText(/Learning Units/i)).toBeVisible();

    // Step 3: refresh restores Step 3
    await page.getByRole('button', { name: /Continue to Mode Selection/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Socratic Study' })).toBeVisible();
  });

  test('Journey 5: Revision with nothing due shows honest explanation and explicit alternatives without auto-switching', async ({ page }) => {
    // 1. Upload and navigate to Step 3
    await page.goto('/learn/new');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await page.getByRole('button', { name: /Confirm and Process/i }).click();
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Continue to Mode Selection/i }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);

    // 2. Check Spaced Revision card: with no prior sessions, 0 items are due
    await expect(page.getByText('Spaced Revision')).toBeVisible();
    await expect(page.getByText('0 due today')).toBeVisible();
    await expect(page.getByText(/No concepts are currently due for spaced review/i)).toBeVisible();

    // 3. Explicit alternative choices are available
    await expect(page.getByRole('button', { name: 'Study Instead' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recall Instead' })).toBeVisible();

    // 4. Verify clicking "Recall Instead" explicitly launches Recall mode without auto-switching
    await page.getByRole('button', { name: 'Recall Instead' }).click();
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/Recall Mode/i)).toBeVisible();
  });

  test('Journey 6: Legacy routes redirect cleanly to the new guided workflow', async ({ page }) => {
    // 1. /app/tutor without params -> /learn/new
    await page.goto('/app/tutor');
    await expect(page).toHaveURL(/\/learn\/new/);

    // 2. /app/review -> /learn
    await page.goto('/app/review');
    await expect(page).toHaveURL(/\/learn/);

    // 3. /app/materials -> /learn/new
    await page.goto('/app/materials');
    await expect(page).toHaveURL(/\/learn\/new/);

    // 4. /app -> /learn
    await page.goto('/app');
    await expect(page).toHaveURL(/\/learn/);
  });

  test('Journey 7: Keyboard navigation through workflow steps', async ({ page }) => {
    await page.goto('/learn/new');
    await expect(page.getByRole('heading', { name: 'Add Study Material', level: 1 })).toBeVisible();

    // Focus upload area via Tab
    await page.keyboard.press('Tab');
    const uploadZone = page.getByRole('button', { name: /Browse Files|Upload study material file/i });
    await expect(uploadZone).toBeVisible();

    // Set file directly
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));

    // Wait for text preview
    await expect(page.getByText('sample-note.txt')).toBeVisible();
    await expect(page.getByText(/Extracted Text Preview/i)).toBeVisible();

    // Tab to Confirm and Process button and hit Enter
    const confirmBtn = page.getByRole('button', { name: /Confirm and Process/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.focus();
    await page.keyboard.press('Enter');

    // Arrive at Step 2
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    await expect(page.getByText(/Learning Units/i)).toBeVisible({ timeout: 15000 });

    // Focus Continue button and press Enter
    const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.focus();
    await page.keyboard.press('Enter');

    // Arrive at Step 3
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    const studyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
    await expect(studyBtn).toBeEnabled();
    await studyBtn.focus();
    await page.keyboard.press('Enter');

    // Arrive at Step 4
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/Study Mode/i)).toBeVisible();
  });

  test('Journey 8: Active Session Controls & Real Data Completion Screen', async ({ page }) => {
    // 1. Upload sample note and navigate to Step 3
    await page.goto('/learn/new');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await expect(page.getByText('sample-note.txt')).toBeVisible();

    const confirmBtn = page.getByRole('button', { name: /Confirm and Process/i });
    await confirmBtn.click();

    // Step 2 -> Step 3
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/organise/);
    const continueBtn = page.getByRole('button', { name: /Continue to Mode Selection/i });
    await expect(continueBtn).toBeEnabled({ timeout: 15000 });
    await continueBtn.click();

    // Step 3 -> Launch Study
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
    const studyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
    await expect(studyBtn).toBeEnabled();
    await studyBtn.click();

    // Step 4 Session View
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/session\//);
    await expect(page.getByText(/Study Mode/i)).toBeVisible();

    // Verify session header controls
    const finishBtn = page.getByRole('button', { name: /Finish study session/i });
    const pauseBtn = page.getByRole('button', { name: /Pause session/i });
    const exitBtn = page.getByRole('button', { name: /Exit session/i });
    await expect(finishBtn).toBeVisible();
    await expect(pauseBtn).toBeVisible();
    await expect(exitBtn).toBeVisible();

    // Click Finish
    await finishBtn.click();

    // Completion view rendered from database summary facts
    await expect(page.getByRole('heading', { name: /Session Completed!/i })).toBeVisible();
    await expect(page.getByText('Concepts Covered', { exact: true })).toBeVisible();
    await expect(page.getByText('Questions Answered', { exact: true })).toBeVisible();
    await expect(page.getByText('Reviews Scheduled', { exact: true })).toBeVisible();

    // Click Switch Mode from completion screen
    const switchModeBtn = page.getByRole('button', { name: /Switch Mode/i });
    await expect(switchModeBtn).toBeVisible();
    await switchModeBtn.click();

    // Arrives back at Step 3 for same material without re-upload
    await expect(page).toHaveURL(/\/learn\/[a-zA-Z0-9_-]+\/mode/);
  });
});
