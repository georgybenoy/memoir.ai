import path from 'node:path';
import { test, expect } from '@playwright/test';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

test.describe('Materials Ingestion & Provenance UI Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to materials view
    await page.goto('/app/materials');
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible();
  });

  test('uploads TXT, MD, and PDF documents and verifies preview and persistence across reload', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');

    // 1. Upload TXT file
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');
    await fileInput.setInputFiles(txtPath);

    // Verify preview appears
    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/study chunks/i).first()).toBeVisible();

    // Verify "Analyze notes" button is present and enabled in Phase 4
    const analyzeBtn = page.getByRole('button', { name: /analyze notes/i });
    await expect(analyzeBtn).toBeVisible();
    await expect(analyzeBtn).toBeEnabled();

    // Verify provenance indicator in chunks tab
    await page.getByRole('button', { name: /study chunks/i }).click();
    await expect(page.getByText('Proven').first()).toBeVisible();

    // 2. Upload Markdown file with headings
    const mdPath = path.join(FIXTURES_DIR, 'sample-lecture.md');
    await fileInput.setInputFiles(mdPath);

    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /study chunks/i }).click();
    // Check heading hierarchy display
    await expect(page.getByText(/Tree Data Structures/i).first()).toBeVisible();

    // 3. Upload Multi-page PDF
    const pdfPath = path.join(FIXTURES_DIR, 'multipage-sample.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('PDF').first()).toBeVisible();

    // Verify Analyze notes button is available
    const analyzeBtn3 = page.getByRole('button', { name: /analyze notes/i });
    await expect(analyzeBtn3).toBeVisible();

    // 4. Verify Materials list contains all 3 documents
    const materialsSection = page.getByRole('region', { name: /imported materials/i }).or(page.locator('section:has-text("Imported Materials")'));
    await expect(materialsSection.getByText('sample-note.txt')).toBeVisible();
    await expect(materialsSection.getByText('sample-lecture.md')).toBeVisible();
    await expect(materialsSection.getByText('multipage-sample.pdf')).toBeVisible();

    // 5. Reload the page and verify materials persist from IndexedDB
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible();

    await expect(page.getByText('sample-note.txt')).toBeVisible();
    await expect(page.getByText('sample-lecture.md')).toBeVisible();
    await expect(page.getByText('multipage-sample.pdf')).toBeVisible();

    // Inspect persisted PDF again
    await page.getByRole('button', { name: 'Inspect' }).first().click();
    await expect(page.getByRole('heading', { name: /sample|multipage/i }).first()).toBeVisible();
  });

  test('displays honest scanned-PDF error message when PDF lacks digital text', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');
    const scannedPdfPath = path.join(FIXTURES_DIR, 'scanned-sample.pdf');

    await fileInput.setInputFiles(scannedPdfPath);

    // Verify exact honest error message
    const errorAlert = page.locator('#upload-error-alert');
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
    await expect(errorAlert.getByText(/Optical Character Recognition \(OCR\) is not supported in this version/i)).toBeVisible();
    await expect(errorAlert.getByText('Scanned or Image-Only Document', { exact: true })).toBeVisible();

    // Verify selection is preserved (never cleared after failure)
    await expect(errorAlert.getByText(/selection preserved/i)).toBeVisible();
    await expect(errorAlert.getByText('scanned-sample.pdf')).toBeVisible();
  });

  test('rejects disguised plain text file with .pdf extension (signature mismatch)', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');
    const disguisedPath = path.join(FIXTURES_DIR, 'disguised.pdf');

    await fileInput.setInputFiles(disguisedPath);

    const errorAlert = page.locator('#upload-error-alert');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert.getByText(/Invalid PDF structure|Invalid File Signature/i)).toBeVisible();
    await expect(errorAlert.getByText('disguised.pdf', { exact: true })).toBeVisible();
  });

  test('confirms and deletes material with dependent chunks', async ({ page }) => {
    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');

    await fileInput.setInputFiles(txtPath);
    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });

    // Click delete on the preview card
    const deleteBtn = page.getByRole('button', { name: 'Delete' }).first();
    await deleteBtn.click();

    // Confirm dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/permanently remove the document and its associated study chunks/i)).toBeVisible();

    await dialog.getByRole('button', { name: 'Delete document' }).click();

    // Confirmation dialog closes and item is removed
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#preview-heading')).not.toBeVisible();
  });

  test('extracts concepts with progress, displays concept cards, and allows inspecting source excerpt provenance', async ({ page }) => {
    // Intercept /api/ai/extract-concepts to return mock concept extraction response
    await page.route('**/api/ai/extract-concepts', async (route) => {
      const requestBody = route.request().postDataJSON();
      const firstChunkId = requestBody?.chunks?.[0]?.id || 'mock-chunk-1';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          concepts: [
            {
              tempId: 'c1',
              title: 'Data Structure Fundamentals',
              summary: 'Organizational formats for efficient data storage and retrieval.',
              canonicalExplanation: 'Data structures define the relationship between data items and operations allowed on them.',
              keyTerms: ['Abstract Data Type', 'Array', 'Memory Layout'],
              sourceChunkIds: [firstChunkId],
              confidence: 0.95,
              prerequisiteTitles: [],
            },
          ],
        }),
      });
    });

    const fileInput = page.locator('#material-file-picker');
    const txtPath = path.join(FIXTURES_DIR, 'sample-note.txt');
    await fileInput.setInputFiles(txtPath);

    await expect(page.locator('#preview-heading')).toBeVisible({ timeout: 15000 });

    // Click "Analyze notes"
    const analyzeBtn = page.getByRole('button', { name: /analyze notes/i });
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Verify progress appears
    await expect(page.locator('div[role="progressbar"]')).toBeVisible({ timeout: 10000 });

    // Verify Concepts tab is selected and displays the extracted concept
    await expect(page.getByRole('heading', { name: 'Data Structure Fundamentals' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Tier 0: Foundational')).toBeVisible();
    await expect(page.getByText('95% confidence')).toBeVisible();
    await expect(page.getByText('Abstract Data Type')).toBeVisible();

    // Click on chunk citation button to inspect provenance excerpt
    const citationBtn = page.getByRole('button', { name: /Chunk #1/i });
    await expect(citationBtn).toBeVisible();
    await citationBtn.click();

    // Verify provenance dialog opens with matched excerpt
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Source Provenance: Data Structure Fundamentals/i)).toBeVisible();
    await expect(dialog.locator('mark')).toBeVisible();

    // Close excerpt dialog
    await dialog.getByRole('button', { name: 'Close Excerpt' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
