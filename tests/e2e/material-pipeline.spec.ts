import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('Phase R2 Material Pipeline & Real IndexedDB Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to add material view
    await page.goto('/learn/new');
    await expect(page.locator('#material-file-picker')).toBeAttached();

    // Clear local IndexedDB stores before each test to guarantee isolated state
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
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
    await expect(page.locator('#material-file-picker')).toBeAttached();
  });

  test('upload -> process -> exactly ONE material record in real IndexedDB; reload preserves it', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');

    await fileInput.setInputFiles(txtPath);

    // Wait for document to be ingested and preview to appear
    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/study chunks/i).first()).toBeVisible();

    // Verify real browser IndexedDB has exactly ONE document record
    const idbState = await page.evaluate(async () => {
      return new Promise<{ docCount: number; chunkCount: number; docId: string; materialId: string; fileHash: string }>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['documents', 'documentChunks'], 'readonly');
          tx.onerror = () => reject(tx.error);
          const docStore = tx.objectStore('documents');
          const chunkStore = tx.objectStore('documentChunks');

          let docCount = 0;
          let chunkCount = 0;
          let docId = '';
          let materialId = '';
          let fileHash = '';

          docStore.getAll().onsuccess = (e: Event) => {
            const reqTarget = e.target as IDBRequest<Array<{ id: string; materialId: string; fileHash: string }>>;
            const docs = reqTarget.result;
            docCount = docs.length;
            if (docs.length > 0) {
              docId = docs[0].id;
              materialId = docs[0].materialId;
              fileHash = docs[0].fileHash;
            }
          };

          chunkStore.count().onsuccess = (e: Event) => {
            const reqTarget = e.target as IDBRequest<number>;
            chunkCount = reqTarget.result;
          };

          tx.oncomplete = () => {
            db.close();
            resolve({ docCount, chunkCount, docId, materialId, fileHash });
          };
        };
      });
    });

    expect(idbState.docCount).toBe(1);
    expect(idbState.chunkCount).toBeGreaterThanOrEqual(1);
    expect(idbState.docId).toBeTruthy();
    expect(idbState.materialId).toBe(idbState.docId);
    expect(idbState.fileHash).toBeTruthy();

    // Reload the page and verify persistence across reload
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible();
    await expect(page.getByText('sample-note.txt')).toBeVisible();

    // Verify real IndexedDB still has exactly ONE document record
    const countAfterReload = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('documents', 'readonly');
          tx.onerror = () => reject(tx.error);
          const countReq = tx.objectStore('documents').count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
        };
      });
    });

    expect(countAfterReload).toBe(1);
  });

  test('Gemini failure at ANALYZING preserves saved source text and chunks, and allows retry', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');

    await fileInput.setInputFiles(txtPath);
    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });

    // Mock Gemini API route failure (abort HTTP request)
    await page.route('**/api/ai/extract-concepts', (route) => {
      route.abort('failed');
    });

    // Trigger analysis
    const analyzeBtn = page.getByRole('button', { name: /analyze notes/i });
    await analyzeBtn.click();

    // Verify error state notice is shown
    await expect(page.getByText(/Concept Extraction Issue/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Your notes and study chunks are safely preserved/i)).toBeVisible();

    // Verify Retry button is present
    const retryBtn = page.getByRole('button', { name: 'Retry' }).first();
    await expect(retryBtn).toBeVisible();

    // Verify real IndexedDB: document text and study chunks remain 100% preserved
    const docData = await page.evaluate(async () => {
      return new Promise<{ hasExtractedText: boolean; chunkCount: number }>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['documents', 'documentChunks'], 'readonly');
          tx.onerror = () => reject(tx.error);
          let hasExtractedText = false;
          let chunkCount = 0;

          tx.objectStore('documents').getAll().onsuccess = (e: Event) => {
            const reqTarget = e.target as IDBRequest<Array<{ extractedText?: string }>>;
            const docs = reqTarget.result;
            if (docs.length > 0 && docs[0].extractedText && docs[0].extractedText.length > 0) {
              hasExtractedText = true;
            }
          };

          tx.objectStore('documentChunks').count().onsuccess = (e: Event) => {
            const reqTarget = e.target as IDBRequest<number>;
            chunkCount = reqTarget.result;
          };

          tx.oncomplete = () => {
            db.close();
            resolve({ hasExtractedText, chunkCount });
          };
        };
      });
    });

    expect(docData.hasExtractedText).toBe(true);
    expect(docData.chunkCount).toBeGreaterThanOrEqual(1);

    // Unroute mock and provide successful mock response for retry
    await page.unroute('**/api/ai/extract-concepts');
    await page.route('**/api/ai/extract-concepts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              title: 'Operating System Processes',
              summary: 'Fundamental units of execution in an operating system.',
              canonicalExplanation: 'OS execution abstraction.',
              keyTerms: ['process', 'thread', 'execution'],
              prerequisiteTitles: [],
              sourceChunkIds: [],
              confidence: 0.95,
            },
            {
              title: 'Process State Transitions',
              summary: 'States including Ready, Running, and Blocked.',
              canonicalExplanation: 'State machine governing process lifecycle.',
              keyTerms: ['ready', 'running', 'blocked'],
              prerequisiteTitles: ['Operating System Processes'],
              sourceChunkIds: [],
              confidence: 0.92,
            },
          ],
          dependencies: [
            {
              prerequisiteTitle: 'Operating System Processes',
              dependentTitle: 'Process State Transitions',
              confidence: 0.9,
            },
          ],
        }),
      });
    });

    // Click Retry
    await retryBtn.click();

    // Verify success: Learning Units tab is visible and shows units
    await expect(page.getByRole('button', { name: /learning units/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /learning units/i }).click();
    await expect(page.getByRole('heading', { name: 'Operating System Processes' })).toBeVisible();

    // Verify real IndexedDB has learningUnits
    const unitsCount = await page.evaluate(async () => {
      return new Promise<number>((resolve, reject) => {
        const req = window.indexedDB.open('edumentor-local');
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('learningUnits', 'readonly');
          tx.onerror = () => reject(tx.error);
          const countReq = tx.objectStore('learningUnits').count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
        };
      });
    });

    expect(unitsCount).toBeGreaterThanOrEqual(1);
  });
});
