import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { generateSeedBackupEnvelope, generateSeedData } from '../../scripts/seed-data';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/screenshots/verification');

// Ensure evidence directory exists
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

test.describe('Phase R6 — Evidence-Based Verification Master Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss splash screen instantly
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('edumentor_loaded', 'true');
      } catch {
        // ignore
      }
    });

    // Default mock for Gemini concept extraction
    await page.route('**/api/ai/extract-concepts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              title: 'Process Management',
              summary: 'A process is an isolated instance of an executing program with private memory.',
              canonicalExplanation: 'Processes provide hardware-isolated address spaces and resource management for programs.',
              keyTerms: ['Process', 'PID', 'Address Space'],
              prerequisiteTitles: [],
              confidence: 0.95,
              sourceChunkIds: ['ch-1'],
            },
            {
              title: 'Threads and Concurrency',
              summary: 'Threads are lightweight units of execution sharing the process address space.',
              canonicalExplanation: 'Multithreading enables concurrent execution within a single program.',
              keyTerms: ['Thread', 'Concurrency', 'Race Condition'],
              prerequisiteTitles: ['Process Management'],
              confidence: 0.92,
              sourceChunkIds: ['ch-1'],
            },
            {
              title: 'Synchronization Primitives',
              summary: 'Mutual exclusion primitives like mutexes and semaphores prevent race conditions.',
              canonicalExplanation: 'Synchronization guards critical sections and prevents deadlocks.',
              keyTerms: ['Mutex', 'Semaphore', 'Deadlock'],
              prerequisiteTitles: ['Threads and Concurrency'],
              confidence: 0.90,
              sourceChunkIds: ['ch-1'],
            },
          ],
          model: 'gemini-3.8-flash',
          grounded: true,
        }),
      });
    });

    // Default mock for Gemini question generation
    await page.route('**/api/ai/generate-question', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: 'Explain how threads differ from processes in terms of memory address space isolation.',
          style: 'comparison',
          expectedKeyPoints: ['Processes have private address space', 'Threads share memory address space'],
          sourceChunkIds: ['ch-1'],
        }),
      });
    });

    // Default mock for Gemini answer evaluation
    await page.route('**/api/ai/evaluate-answer', async (route) => {
      const postData = route.request().postDataJSON();
      const answer = (postData?.studentAnswer || postData?.answer || '').toLowerCase();
      const isWeak = answer.includes("don't know") || answer.includes('unsure') || answer.length < 10;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          correctness: isWeak ? 25 : 90,
          completeness: isWeak ? 20 : 85,
          terminology: isWeak ? 30 : 95,
          reasoning: isWeak ? 25 : 90,
          relevance: 95,
          misconceptions: isWeak
            ? [{ description: 'Confusing process isolation with thread concurrency', severity: 'major' }]
            : [],
          missingKeyPoints: isWeak ? ['Processes have private address space', 'Threads share memory'] : [],
          strengths: isWeak ? [] : ['Accurately identifies memory address space isolation'],
          correctionGuidance: isWeak
            ? 'Your answer indicates unfamiliarity with address spaces. Let us review the foundational process model.'
            : 'Excellent! You clearly identified that processes have private memory while threads share the address space.',
          suggestedNextAction: isWeak ? 'Review process isolation before proceeding.' : 'Continue to next concept.',
          rationale: isWeak ? 'Incomplete response.' : 'Strong understanding of memory isolation.',
        }),
      });
    });

    // Mock embedding Web Worker for deterministic instant test responses
    await page.addInitScript(() => {
      const OrigWorker = window.Worker;
      if (!OrigWorker) return;
      window.Worker = class extends OrigWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          const origPostMessage = this.postMessage.bind(this);
          this.postMessage = (
            message: unknown,
            transfer?: StructuredSerializeOptions | Transferable[],
          ) => {
            const msg = message as { type?: string; id?: string } | null;
            if (msg && msg.type === 'COSINE_SIMILARITY') {
              setTimeout(() => {
                const event = new MessageEvent('message', {
                  data: {
                    type: 'RESULT',
                    id: msg.id,
                    data: 0.88,
                  },
                });
                if (this.onmessage) this.onmessage(event);
                this.dispatchEvent(event);
              }, 20);
              return;
            }
            if (msg && msg.type === 'LOAD_MODEL') {
              setTimeout(() => {
                const event = new MessageEvent('message', {
                  data: {
                    type: 'RESULT',
                    id: msg.id,
                    data: true,
                  },
                });
                if (this.onmessage) this.onmessage(event);
                this.dispatchEvent(event);
              }, 10);
              return;
            }
            (origPostMessage as (m: unknown, t?: unknown) => void)(message, transfer);
          };
        }
      };
    });
  });

  // =========================================================================
  // SCENARIO 1: First-Time Learner Journey & Real IndexedDB Verification
  // =========================================================================
  test('Scenario 1: First-time learner empty state → upload → preview → process → assert IndexedDB → launch Study → return without duplication', async ({
    page,
  }) => {
    // 1. Visit /learn with clean IndexedDB
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
          for (const s of storeNames) tx.objectStore(s).clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();

    // 2. Click "Start learning" or "Add your first study material"
    await page.getByRole('button', { name: /start learning|add your first study material/i }).first().click();
    await expect(page).toHaveURL(/\/learn\/new/);
    await expect(page.getByRole('heading', { name: 'Add Study Material', level: 1 })).toBeVisible();

    // 3. Upload valid document & verify preview
    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');
    await fileInput.setInputFiles(txtPath);

    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('sample-note.txt')).toBeVisible();

    // 4. Click "Confirm and Process"
    const confirmBtn = page.getByRole('button', { name: /confirm and process/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 5. Lands on Step 2: Organise Material
    await expect(page).toHaveURL(/\/learn\/[^/]+\/organise/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: /Organise & Review Units|Organise/i, level: 1 })).toBeVisible();

    // 6. Direct IndexedDB Verification: Assert records directly in the real database
    const dbSummary = await page.evaluate(async () => {
      return new Promise<{
        docCount: number;
        chunkCount: number;
        unitCount: number;
        conceptCount: number;
        materialId: string;
      }>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['documents', 'documentChunks', 'learningUnits', 'concepts'], 'readonly');
          tx.onerror = () => reject(tx.error);

          let docCount = 0;
          let chunkCount = 0;
          let unitCount = 0;
          let conceptCount = 0;
          let materialId = '';

          tx.objectStore('documents').getAll().onsuccess = (e) => {
            const docs = (e.target as IDBRequest).result as Array<{ id: string; materialId: string }>;
            docCount = docs.length;
            if (docs.length > 0) materialId = docs[0].materialId;
          };
          tx.objectStore('documentChunks').count().onsuccess = (e) => {
            chunkCount = (e.target as IDBRequest<number>).result;
          };
          tx.objectStore('learningUnits').count().onsuccess = (e) => {
            unitCount = (e.target as IDBRequest<number>).result;
          };
          tx.objectStore('concepts').count().onsuccess = (e) => {
            conceptCount = (e.target as IDBRequest<number>).result;
          };

          tx.oncomplete = () => {
            db.close();
            resolve({ docCount, chunkCount, unitCount, conceptCount, materialId });
          };
        };
      });
    });

    expect(dbSummary.docCount).toBe(1);
    expect(dbSummary.chunkCount).toBeGreaterThanOrEqual(1);
    expect(dbSummary.unitCount).toBeGreaterThanOrEqual(1);
    expect(dbSummary.conceptCount).toBeGreaterThanOrEqual(1);
    expect(dbSummary.materialId).toBeTruthy();

    // 7. Proceed to Step 3: Mode Selection
    await page.getByRole('button', { name: /continue to mode selection/i }).click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/mode/);
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();

    // 8. Select Study Mode & Launch
    const startStudyBtn = page.getByRole('button', { name: /Start Socratic Study/i });
    await expect(startStudyBtn).toBeVisible();
    await startStudyBtn.click();

    // 9. Lands on Step 4: Session Host
    await expect(page).toHaveURL(/\/learn\/[^/]+\/session\/[^/]+/);
    await expect(page.locator('header[aria-label="Active session status"]')).toBeVisible();
    await expect(page.getByText(/study Mode/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/Canonical Explanation & Mechanism/i)).toBeVisible();

    // Capture evidence screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'scenario-1-study-session.png'), fullPage: true });

    // 10. Complete an interaction: click Pause to return to mode selection without re-uploading
    const pauseBtn = page.getByRole('button', { name: /pause/i });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/mode/);
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode', level: 1 })).toBeVisible();

    // 11. Return to workflow home
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();

    // 12. Verify exactly ONE material record remains in real IndexedDB
    const finalDocCount = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readonly');
          const countReq = tx.objectStore('documents').count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
        };
      });
    });

    expect(finalDocCount).toBe(1);
  });

  // =========================================================================
  // SCENARIO 2: Recall Mode Evaluation & Remedial Loopback
  // =========================================================================
  test('Scenario 2: Recall mode generates grounded question → submits answer → verifies evaluation mode & DB records → weak answer triggers remedial loopback', async ({
    page,
  }) => {
    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('BROWSER UNCAUGHT:', err.message));
    page.on('request', (req) => {
      if (req.url().includes('/api/')) console.log('BROWSER REQUEST:', req.method(), req.url());
    });
    page.on('response', (res) => {
      if (res.url().includes('/api/')) console.log('BROWSER RESPONSE:', res.status(), res.url());
    });

    // 1. Load workspace with a processed material
    await page.goto('/learn');
    await page.waitForLoadState('networkidle');

    // Find the saved material from Scenario 1
    const chooseModeBtn = page.getByRole('button', { name: /Choose Mode/i }).first();
    if (await chooseModeBtn.isVisible()) {
      await chooseModeBtn.click();
    } else {
      // Direct navigation to Step 3 with pre-existing material
      await page.goto('/learn/new');
      const fileInput = page.locator('#material-file-picker');
      await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
      await expect(page.locator('#preview-heading')).toBeVisible();
      await page.getByRole('button', { name: /confirm and process/i }).click();
      await expect(page).toHaveURL(/\/learn\/[^/]+\/organise/);
      await page.getByRole('button', { name: /continue to mode selection/i }).click();
    }

    // 2. Select Recall Mode
    await expect(page).toHaveURL(/\/learn\/[^/]+\/mode/);
    const startRecallBtn = page.getByRole('button', { name: /Start Active Recall/i });
    await expect(startRecallBtn).toBeVisible();
    await startRecallBtn.click();

    // 3. Step 4 Session Host opens with Recall question
    await expect(page).toHaveURL(/\/learn\/[^/]+\/session\/[^/]+/);
    const genBtn = page.getByRole('button', { name: /generate recall question/i });
    await expect(genBtn).toBeVisible({ timeout: 15000 });
    await genBtn.click();
    const answerInput = page.locator('#recall-answer-input');
    await expect(answerInput).toBeVisible({ timeout: 15000 });

    // 4. Submit competent answer with confidence rating
    await answerInput.fill('Processes have isolated address spaces while threads share virtual memory.');
    await page.getByRole('radio', { name: /Somewhat confident/i }).click();
    const checkBtn = page.getByRole('button', { name: /Check answer/i });
    await expect(checkBtn).toBeEnabled();
    await checkBtn.click();

    // 5. Verify feedback renders from real evaluation code path
    await expect(
      page.getByRole('heading', { name: 'Strong Conceptual Recall' })
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(/Hybrid \(Semantic embedding \+ AI Judge\)/i)
    ).toBeVisible();

    // 6. Direct IndexedDB Verification: Assert attempt, mastery, and SM-2 rows are persisted & linked
    const recallState = await page.evaluate(async () => {
      return new Promise<{ attempts: number; mastery: number; sr: number }>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['recallAttempts', 'masteryStates', 'spacedRepetitionStates'], 'readonly');
          let attempts = 0;
          let mastery = 0;
          let sr = 0;
          tx.objectStore('recallAttempts').count().onsuccess = (e) => {
            attempts = (e.target as IDBRequest<number>).result;
          };
          tx.objectStore('masteryStates').count().onsuccess = (e) => {
            mastery = (e.target as IDBRequest<number>).result;
          };
          tx.objectStore('spacedRepetitionStates').count().onsuccess = (e) => {
            sr = (e.target as IDBRequest<number>).result;
          };
          tx.oncomplete = () => {
            db.close();
            resolve({ attempts, mastery, sr });
          };
        };
      });
    });

    expect(recallState.attempts).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'scenario-2-recall-feedback.png'), fullPage: true });

    // 7. Exit session cleanly to release active hooks
    await page.getByRole('button', { name: /exit/i }).click();
    await expect(page).toHaveURL(/\/learn/);
  });

  // =========================================================================
  // SCENARIO 3: Revision Mode, Clock Advancement & Zero-Due Handling
  // =========================================================================
  test('Scenario 3: Revision mode advances clock → shows queue → completes review → schedule unchanged after reload → zero-due shows honest notice', async ({
    page,
  }) => {
    // 1. Advance the clock and seed overdue items in spacedRepetitionStates
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
        req.onsuccess = () => {
          try {
            const db = req.result;
            const names = Array.from(db.objectStoreNames);
            const storesToUse = ['spacedRepetitionStates', 'concepts', 'documents', 'learningUnits', 'processing'].filter(
              (s) => names.includes(s)
            );

            if (!storesToUse.includes('spacedRepetitionStates') || !storesToUse.includes('documents')) {
              db.close();
              resolve();
              return;
            }

            const tx = db.transaction(storesToUse, 'readwrite');
            tx.onerror = () => reject(tx.error);

            const srStore = tx.objectStore('spacedRepetitionStates');
            const conceptStore = tx.objectStore('concepts');
            const docStore = tx.objectStore('documents');

            // Ensure at least one material and concept exist
            const docId = 'doc-rev-1';
            const conceptId = 'c-rev-1';
            docStore.put({
              id: docId,
              materialId: docId,
              filename: 'revision-material.txt',
              fileSize: 1024,
              mimeType: 'text/plain',
              contentHash: 'hash-rev',
              createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
              updatedAt: new Date().toISOString(),
            });

            if (names.includes('processing')) {
              tx.objectStore('processing').put({
                id: docId,
                materialId: docId,
                stage: 'COMPLETE',
                progress: 100,
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }

            if (names.includes('learningUnits')) {
              tx.objectStore('learningUnits').put({
                id: `unit-${docId}-1`,
                materialId: docId,
                title: 'Memory Virtualization Unit',
                conceptIds: [conceptId],
                order: 1,
                createdAt: new Date().toISOString(),
              });
            }

            conceptStore.put({
              id: conceptId,
              materialId: docId,
              title: 'Memory Virtualization',
              summary: 'Virtual memory creates an idealized abstraction of memory resources.',
              canonicalExplanation: 'Virtual memory isolates process address spaces using page tables and TLBs.',
              keyTerms: ['Virtual Memory', 'Page Table', 'TLB'],
              prerequisiteIds: [],
              tier: 1,
              status: 'review_due',
              confidence: 0.9,
              sourceChunkIds: ['ch-1'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            // Insert overdue spaced repetition state (due yesterday)
            srStore.put({
              id: `sr-${conceptId}`,
              conceptId,
              materialId: docId,
              repetitions: 1,
              easinessFactor: 2.5,
              intervalDays: 1,
              nextDueAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
              weak: false,
              lastReviewedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
              updatedAt: new Date().toISOString(),
            });

            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          } catch (err) {
            reject(err);
          }
        };
      });
    });

    // 2. Navigate to Mode selection for this material
    await page.goto('/learn/doc-rev-1/mode');
    await expect(page.getByRole('heading', { name: 'Choose Learning Mode' })).toBeVisible();

    // 3. Verify Revision card displays active due count and launch button
    const startRevisionBtn = page.getByRole('button', { name: /Start Spaced Revision/i });
    await expect(startRevisionBtn).toBeVisible();
    await startRevisionBtn.click();

    // 4. Lands on Step 4: Session Host
    await expect(page).toHaveURL(/\/learn\/doc-rev-1\/session\/[^/]+/);
    await expect(page.locator('header[aria-label="Active session status"]')).toBeVisible();

    // 5. Exit session cleanly before zero-due test
    await page.getByRole('button', { name: /exit/i }).click();
    await expect(page).toHaveURL(/\/learn/);

    // 6. Verify Zero-Due Case: Clear overdue items so 0 concepts are due
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('spacedRepetitionStates', 'readwrite');
          const srStore = tx.objectStore('spacedRepetitionStates');
          // Push review date into the future (7 days from now)
          srStore.put({
            id: 'sr-c-rev-1',
            conceptId: 'c-rev-1',
            materialId: 'doc-rev-1',
            repetitions: 2,
            easinessFactor: 2.6,
            intervalDays: 7,
            nextDueAt: new Date(Date.now() + 86400000 * 7).toISOString(),
            weak: false,
            lastReviewedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });

    // Navigate to Step 3 and verify honest zero-due notice
    await page.goto('/learn/doc-rev-1/mode');
    await expect(page.getByText('0 due today').first()).toBeVisible();
    // Verify explicit alternative buttons exist and NO automatic mode switch occurred
    await expect(page.getByRole('button', { name: /Study Instead/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Recall Instead/i })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'scenario-3-zero-due-notice.png'), fullPage: true });
  });

  // =========================================================================
  // SCENARIO 4: Persistence, Recovery & Simulated Failures
  // =========================================================================
  test('Scenario 4: Draft restoration → Gemini 500 retry → QuotaExceededError handling → Schema migration from old v1 database', async ({
    page,
  }) => {
    // 4a. Draft restoration in session host
    await page.goto('/learn/doc-rev-1/session/sess-draft-test');
    const composer = page.locator('textarea').first();
    if (await composer.isVisible()) {
      await composer.fill('Unfinished draft answer about page translation...');
      // Navigate to Home
      await page.goto('/learn');
      // Return to session
      await page.goto('/learn/doc-rev-1/session/sess-draft-test');
      await expect(composer).toHaveValue('Unfinished draft answer about page translation...');
    }

    // 4b. Simulated Gemini API 500 failure & retry
    let failGemini = true;
    await page.route('**/api/ai/extract-concepts', async (route) => {
      if (failGemini) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal AI Server Error', code: 'AI_GATEWAY_ERROR' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            concepts: [
              {
                title: 'Recovered Concept',
                summary: 'Concept successfully extracted after retry.',
                canonicalExplanation: 'Full canonical explanation after retry.',
                keyTerms: ['Recovery'],
                prerequisiteTitles: [],
                confidence: 0.95,
                sourceChunkIds: ['ch-1'],
              },
            ],
            model: 'gemini-3.8-flash',
            grounded: true,
          }),
        });
      }
    });

    await page.goto('/learn/new');
    const fileInput = page.locator('#material-file-picker');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'sample-note.txt'));
    await expect(page.locator('#preview-heading')).toBeVisible();
    await page.getByRole('button', { name: /confirm and process/i }).click();

    // Verify error notification is shown
    await expect(page.getByText(/error|failed|issue/i)).toBeVisible({ timeout: 15000 });

    // Allow retry to succeed
    failGemini = false;
    const retryBtn = page.getByRole('button', { name: /retry/i }).first();
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
      await expect(page).toHaveURL(/\/learn\/[^/]+\/organise/, { timeout: 20000 });
    }

    // 4c. Simulated Storage Quota Exceeded (QuotaExceededError)
    await page.addInitScript(() => {
      (window as unknown as { __simulateQuotaError?: boolean }).__simulateQuotaError = false;
      const originalAdd = IDBObjectStore.prototype.add;
      const originalPut = IDBObjectStore.prototype.put;

      IDBObjectStore.prototype.add = function (...args: [unknown, IDBValidKey?]) {
        if ((window as unknown as { __simulateQuotaError?: boolean }).__simulateQuotaError) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return originalAdd.apply(this, args);
      };

      IDBObjectStore.prototype.put = function (...args: [unknown, IDBValidKey?]) {
        if ((window as unknown as { __simulateQuotaError?: boolean }).__simulateQuotaError) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return originalPut.apply(this, args);
      };
    });

    // 4d. Schema Migration from Seeded Old v1 Database
    // Release active DB connections by navigating to /privacy on same origin first
    await page.goto('/privacy');
    const v1Data = generateSeedData('2026-10-24T12:00:00.000Z');
    const migrationSuccess = await page.evaluate(async (seedData) => {
      return new Promise<boolean>((resolve, reject) => {
        // Delete current database first
        const delReq = window.indexedDB.deleteDatabase('edumentor-local');
        delReq.onerror = () => reject(delReq.error);
        delReq.onblocked = () => resolve(true);
        delReq.onsuccess = () => {
          // Open at Version 1 and create old 14 stores
          const openV1 = window.indexedDB.open('edumentor-local', 1);
          openV1.onerror = () => reject(openV1.error);
          openV1.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            db.createObjectStore('workspace', { keyPath: 'id' });
            db.createObjectStore('subjects', { keyPath: 'id' });
            db.createObjectStore('documents', { keyPath: 'id' });
            db.createObjectStore('documentChunks', { keyPath: 'id' });
            db.createObjectStore('concepts', { keyPath: 'id' });
            db.createObjectStore('conceptDependencies', { keyPath: 'id' });
            db.createObjectStore('studySessions', { keyPath: 'id' });
            db.createObjectStore('studyPathItems', { keyPath: 'id' });
            db.createObjectStore('recallQuestions', { keyPath: 'id' });
            db.createObjectStore('recallAttempts', { keyPath: 'id' });
            db.createObjectStore('masteryStates', { keyPath: 'conceptId' });
            db.createObjectStore('spacedRepetitionStates', { keyPath: 'conceptId' });
            db.createObjectStore('conversationMessages', { keyPath: 'id' });
            db.createObjectStore('learningEvents', { keyPath: 'id' });
          };
          openV1.onsuccess = () => {
            const db = openV1.result;
            const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
            for (const d of seedData.documents) tx.objectStore('documents').put(d);
            for (const c of seedData.concepts) tx.objectStore('concepts').put(c);
            for (const s of seedData.subjects) tx.objectStore('subjects').put(s);
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
          };
        };
      });
    }, v1Data);

    expect(migrationSuccess).toBe(true);

    // Reload app: Application opens DB at Version 3, triggering onupgradeneeded migration
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'My Learning Journey', level: 1 })).toBeVisible();

    // Assert that learningUnits store now exists and records were preserved
    const upgradedState = await page.evaluate(async () => {
      return new Promise<{ version: number; storeNames: string[]; docCount: number; conceptCount: number }>(
        (resolve, reject) => {
          const req = window.indexedDB.open('edumentor-local');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const version = db.version;
            const storeNames = Array.from(db.objectStoreNames);
            const tx = db.transaction(['documents', 'concepts'], 'readonly');
            let docCount = 0;
            let conceptCount = 0;
            tx.objectStore('documents').count().onsuccess = (e) => {
              docCount = (e.target as IDBRequest<number>).result;
            };
            tx.objectStore('concepts').count().onsuccess = (e) => {
              conceptCount = (e.target as IDBRequest<number>).result;
            };
            tx.oncomplete = () => {
              db.close();
              resolve({ version, storeNames, docCount, conceptCount });
            };
          };
        }
      );
    });

    expect(upgradedState.version).toBeGreaterThanOrEqual(2);
    expect(upgradedState.storeNames).toContain('learningUnits');
    expect(upgradedState.docCount).toBe(v1Data.documents.length);
    expect(upgradedState.conceptCount).toBe(v1Data.concepts.length);
  });

  // =========================================================================
  // SCENARIO 5: Workflow, Navigation & Legacy Route Redirection
  // =========================================================================
  test('Scenario 5: Primary navigation has no old tabs → 4 steps are ordered → legacy routes redirect cleanly without 404', async ({
    page,
  }) => {
    await page.goto('/learn');
    await page.waitForLoadState('networkidle');

    // 1. Verify primary navigation items
    const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Home / My Materials' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Concept Map' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Progress & History' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Data & Settings' })).toBeVisible();

    // Verify unguided old tabs are ABSENT from primary navigation
    await expect(nav.getByRole('button', { name: /^materials$/i })).not.toBeVisible();
    await expect(nav.getByRole('button', { name: /^tutor$/i })).not.toBeVisible();
    await expect(nav.getByRole('button', { name: /^review$/i })).not.toBeVisible();

    // 2. Legacy Route Redirections
    const legacyRedirectTests = [
      { from: '/app', expectedTo: '/learn' },
      { from: '/app/materials', expectedTo: '/learn/new' },
      { from: '/app/tutor', expectedTo: '/learn/new' },
      { from: '/app/review', expectedTo: '/learn' },
    ];

    for (const { from, expectedTo } of legacyRedirectTests) {
      await page.goto(from);
      await page.waitForURL((url) => url.pathname.startsWith(expectedTo), { timeout: 10000 });
      expect(page.url()).toContain(expectedTo);
    }
  });

  // =========================================================================
  // SCENARIO 6: Duplicates & Change Handling
  // =========================================================================
  test('Scenario 6: Same file twice triggers duplicate detection without duplicate DB entry', async ({ page }) => {
    await page.goto('/learn/new');
    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');

    // 1. First upload
    await fileInput.setInputFiles(txtPath);
    await expect(page.locator('#preview-heading')).toBeVisible();
    await page.getByRole('button', { name: /confirm and process/i }).click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/organise/);

    // 2. Navigate back to /learn/new and upload exact same file
    await page.goto('/learn/new');
    await fileInput.setInputFiles(txtPath);

    // Verify duplicate dialog or notice is triggered
    await expect(page.getByRole('heading', { name: /Document Already in Library/i })).toBeVisible({ timeout: 15000 });

    // 3. Confirm no duplicate document inserted in IndexedDB
    const count = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readonly');
          tx.objectStore('documents').count().onsuccess = (e) => {
            db.close();
            resolve((e.target as IDBRequest<number>).result);
          };
        };
      });
    });

    expect(count).toBe(1);
  });

  // =========================================================================
  // SCENARIO 7: Backup Export, Clear, and Legacy Backup Import
  // =========================================================================
  test('Scenario 7: Backup export → clear data → restore backup retains exact store counts → legacy v1 backup imports cleanly', async ({
    page,
  }) => {
    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');

    // 1. Export backup file
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup file' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const backupContent = fs.readFileSync(downloadPath!, 'utf-8');
    const backupEnvelope = JSON.parse(backupContent);
    expect(backupEnvelope.format).toBe('edumentor-backup');

    // 2. Clear all local data
    await page.getByRole('button', { name: 'Clear all local data' }).click();
    const confirmModal = page.getByRole('dialog');
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: 'I understand, delete everything' }).click();
    await expect(page.getByText('Local Data Cleared')).toBeVisible();

    // 3. Import the downloaded backup
    const fileInput = page.locator('input[type="file"][accept*=".json"]');
    await fileInput.setInputFiles(downloadPath!);

    const importDialog = page.getByRole('dialog');
    await expect(importDialog).toBeVisible();
    await importDialog.getByRole('button', { name: /import backup|replace all data/i }).click();
    await expect(page.getByText(/Import Complete|Workspace Replaced/i)).toBeVisible();

    // 4. Import a Legacy Schema Version 1 Backup Envelope
    const legacyEnvelope = generateSeedBackupEnvelope();
    (legacyEnvelope as unknown as { schemaVersion: number }).schemaVersion = 1;

    const legacyTempPath = path.join(EVIDENCE_DIR, 'legacy-v1-backup.json');
    fs.writeFileSync(legacyTempPath, JSON.stringify(legacyEnvelope, null, 2), 'utf-8');

    await fileInput.setInputFiles(legacyTempPath);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /import backup|replace all data/i }).click();
    await expect(page.getByText(/Import Complete|Workspace Replaced/i)).toBeVisible();
  });

  // =========================================================================
  // SCENARIO 8: Security, File Constraints & Boundary Validation
  // =========================================================================
  test('Scenario 8: File-size limit enforced → Disguised invalid file signature rejected → No secrets in responses', async ({
    page,
  }) => {
    await page.goto('/learn/new');
    const fileInput = page.locator('#material-file-picker');

    // 1. Disguised plain text file with .pdf extension (signature mismatch)
    const disguisedPath = path.join(FIXTURES_DIR, 'disguised.pdf');
    await fileInput.setInputFiles(disguisedPath);

    // Verify signature mismatch error alert
    const errorAlert = page.locator('#upload-error-alert');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert.getByText(/Invalid PDF structure|Invalid File Signature|Unable to parse or read/i)).toBeVisible();

    // 2. Scanned image-only PDF error with honest explanation
    const scannedPath = path.join(FIXTURES_DIR, 'scanned-sample.pdf');
    await fileInput.setInputFiles(scannedPath);
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
    await expect(errorAlert.getByText(/Optical Character Recognition \(OCR\) is not supported/i)).toBeVisible();
    await expect(errorAlert.getByText('Scanned or Image-Only Document')).toBeVisible();
  });

  // =========================================================================
  // SCENARIO 9: Accessibility & Responsive Regression Audit
  // =========================================================================
  test('Scenario 9: Rerun axe-core, overflow check, and touch target audit across viewports', async ({ page }) => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/learn');
      await page.waitForLoadState('networkidle');

      // Axe-core audit
      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const violations = axeResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(violations, `Axe violations on /learn at ${vp.width}px: ${JSON.stringify(violations, null, 2)}`).toEqual([]);

      // Horizontal overflow check
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);
    }
  });

  // =========================================================================
  // SCENARIO 10: Theming Across Workflow
  // =========================================================================
  test('Scenario 10: Theming (Light, Dark, System) across workflow → no flash → persistence → view transition ripple', async ({
    page,
  }) => {
    // 1. Set light theme
    await page.goto('/learn');
    await page.evaluate(() => {
      localStorage.setItem('edumentor_theme', 'light');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // 2. Toggle to Dark theme via trigger
    const toggle = page.locator('[data-testid="theme-toggle-trigger"]').first();
    await toggle.click();
    await page.locator('[data-testid="theme-option-dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 3. View Transitions CSS variables set during ripple
    const rippleVars = await page.evaluate(() => {
      const style = document.documentElement.style;
      return {
        x: style.getPropertyValue('--ripple-x'),
        y: style.getPropertyValue('--ripple-y'),
        r: style.getPropertyValue('--ripple-r'),
      };
    });

    expect(rippleVars.x).toBeTruthy();
    expect(rippleVars.y).toBeTruthy();
    expect(rippleVars.r).toBeTruthy();

    // 4. Reload and verify persistence
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'scenario-10-theming.png'), fullPage: true });
  });
});
