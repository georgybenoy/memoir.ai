/**
 * Study Path E2E & Accessibility Tests (/app/path)
 * Tests seeded session display, locked vs available states, graph view, and Axe WCAG 2.2 AA audit.
 * Source of truth: DESIGN_DOC §5.3.C, §6.7, PRD FR-04, FR-05
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Seeds a deterministic study session with concepts, dependencies, and path items into IndexedDB.
 */
async function seedStudyPathData(page: import('@playwright/test').Page) {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'What are you learning today?' })).toBeVisible({ timeout: 20000 });

  await page.evaluate(async () => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('edumentor-local');

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ['documents', 'documentChunks', 'concepts', 'conceptDependencies', 'studySessions', 'studyPathItems'],
          'readwrite',
        );

        const now = '2026-10-22T00:00:00Z';

        // 1. Document
        tx.objectStore('documents').put({
          id: 'doc-seed-1',
          filename: 'CS101_Algorithms.pdf',
          fileType: 'pdf',
          fileSize: 4096,
          extractedText: 'Seeded lecture content.',
          analysisStatus: 'completed',
          contentHash: 'hash-seed-1',
          metadata: { sessionId: 'session-seed-1' },
          createdAt: now,
          updatedAt: now,
        });

        // 2. Chunks
        tx.objectStore('documentChunks').put({
          id: 'chunk-seed-1',
          documentId: 'doc-seed-1',
          chunkIndex: 0,
          text: 'Variables and foundational types.',
          startOffset: 0,
          endOffset: 100,
          pageStart: 1,
          pageEnd: 1,
          headingPath: ['Module 1', 'Variables'],
          contentHash: 'chunk-hash-1',
          createdAt: now,
        });

        tx.objectStore('documentChunks').put({
          id: 'chunk-seed-2',
          documentId: 'doc-seed-1',
          chunkIndex: 1,
          text: 'Conditional branching with if-else.',
          startOffset: 101,
          endOffset: 200,
          pageStart: 2,
          pageEnd: 2,
          headingPath: ['Module 1', 'Conditionals'],
          contentHash: 'chunk-hash-2',
          createdAt: now,
        });

        // 3. Concepts
        tx.objectStore('concepts').put({
          id: 'concept-var',
          title: 'Foundational Variables',
          summary: 'Primitive data types and memory allocations.',
          canonicalExplanation: 'A variable holds state in memory.',
          keyTerms: ['variable', 'memory', 'type'],
          sourceChunkIds: ['chunk-seed-1'],
          tier: 0,
          status: 'available',
          confidence: 0.95,
          extractionOrder: 1,
          createdAt: now,
          updatedAt: now,
        });

        tx.objectStore('concepts').put({
          id: 'concept-branch',
          title: 'Conditional Branches',
          summary: 'Control flow branching using conditions.',
          canonicalExplanation: 'Evaluates boolean predicate to select branch.',
          keyTerms: ['branch', 'condition', 'predicate'],
          sourceChunkIds: ['chunk-seed-2'],
          tier: 1,
          status: 'locked',
          confidence: 0.90,
          extractionOrder: 2,
          createdAt: now,
          updatedAt: now,
        });

        // 4. Dependencies
        tx.objectStore('conceptDependencies').put({
          id: 'dep-var-branch',
          prerequisiteId: 'concept-var',
          dependentConceptId: 'concept-branch',
          confidence: 0.88,
          removed: false,
          createdAt: now,
        });

        // 5. Study Session
        tx.objectStore('studySessions').put({
          id: 'session-seed-1',
          machineState: 'STUDY_PATH_READY',
          currentConceptId: 'concept-var',
          sourceMode: 'document',
          startedAt: now,
          updatedAt: now,
        });

        // 6. Study Path Items
        tx.objectStore('studyPathItems').put({
          id: 'path-item-1',
          sessionId: 'session-seed-1',
          conceptId: 'concept-var',
          orderIndex: 0,
          status: 'available',
          createdAt: now,
          updatedAt: now,
        });

        tx.objectStore('studyPathItems').put({
          id: 'path-item-2',
          sessionId: 'session-seed-1',
          conceptId: 'concept-branch',
          orderIndex: 1,
          status: 'locked',
          createdAt: now,
          updatedAt: now,
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

test.describe('Study Path Flow & Accessibility (/app/path)', () => {
  test.beforeEach(async ({ page }) => {
    await seedStudyPathData(page);
  });

  test('seeded session displays locked and available concepts correctly', async ({ page }) => {
    await page.goto('/app/path');

    // Verify Document Title and Study Path Header
    await expect(page.getByRole('heading', { name: 'CS101_Algorithms.pdf' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('STUDY PATH')).toBeVisible();

    // Verify Progress Summary (1 Available, 1 Locked)
    await expect(page.getByText('Available').first()).toBeVisible();
    await expect(page.getByText('Locked').first()).toBeVisible();

    // Verify Foundational Variables is Available
    const varRow = page.getByRole('article', { name: /Foundational Variables/i });
    await expect(varRow).toBeVisible();
    await expect(varRow.getByRole('status', { name: /Status: Available/i })).toBeVisible();
    const learnBtn = varRow.getByRole('button', { name: /Learn this concept/i });
    await expect(learnBtn).toBeVisible();
    await expect(learnBtn).toBeEnabled();

    // Verify Conditional Branches is Locked
    const branchRow = page.getByRole('article', { name: /Conditional Branches/i });
    await expect(branchRow).toBeVisible();
    await expect(branchRow.getByRole('status', { name: /Status: Locked/i })).toBeVisible();
    const lockedBtn = branchRow.getByRole('button', { name: /Locked/i });
    await expect(lockedBtn).toBeVisible();
    await expect(lockedBtn).toBeDisabled();

    // Click on Conditional Branches to inspect details panel
    await branchRow.click();

    // Detail panel displays locked warning and skip override action
    await expect(page.getByRole('heading', { name: 'Conditional Branches' }).first()).toBeVisible();
    await expect(page.getByText(/Prerequisites not met/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Override & skip prerequisites/i })).toBeVisible();
  });

  test('toggles to Graph view and displays custom SVG layered canvas', async ({ page }) => {
    await page.goto('/app/path');
    await expect(page.getByRole('heading', { name: 'CS101_Algorithms.pdf' })).toBeVisible({ timeout: 15000 });

    // Click Graph View toggle button
    await page.getByRole('button', { name: /Graph View/i }).click();

    // Verify SVG interactive region
    const svgRegion = page.getByRole('region', { name: /Interactive concept dependency graph/i });
    await expect(svgRegion).toBeVisible();

    // Nodes visible in canvas
    await expect(svgRegion.getByRole('button', { name: /Foundational Variables/i })).toBeVisible();
    await expect(svgRegion.getByRole('button', { name: /Conditional Branches/i })).toBeVisible();

    // Visual legend text visible
    await expect(page.getByText('T0: Foundational')).toBeVisible();
  });

  test('has zero critical or serious WCAG 2.2 AA accessibility violations on /app/path', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/path');
    await expect(page.getByRole('heading', { name: 'CS101_Algorithms.pdf' })).toBeVisible({ timeout: 15000 });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const criticalOrSerious = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(criticalOrSerious).toEqual([]);
  });
});
