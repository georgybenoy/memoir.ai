import { test, expect } from '@playwright/test';

test.describe('Backup Export and Clear Data Confirmation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/settings');
    await expect(page.getByRole('heading', { name: 'Data & Settings' })).toBeVisible();
  });

  test('triggers backup file download with dated filename', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: 'Export backup file' });
    await expect(exportBtn).toBeVisible();

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^edumentor-backup-\d{4}-\d{2}-\d{2}\.json$/);

    // Verify success toast
    await expect(page.getByText('Backup Exported')).toBeVisible();
  });

  test('clear-data requires confirmation dialog and can be cancelled', async ({ page }) => {
    const clearBtn = page.getByRole('button', { name: 'Clear all local data' });
    await expect(clearBtn).toBeVisible();

    // Click clear data to open confirmation dialog
    await clearBtn.click();

    // Verify dialog title and description are shown
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Permanently Clear All Local Data?')).toBeVisible();
    await expect(dialog.getByText('Export safety backup first')).toBeVisible();

    // Click Cancel
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    await cancelBtn.click();

    // Verify dialog closed
    await expect(dialog).not.toBeVisible();
  });

  test('clear-data proceeds upon explicit confirmation', async ({ page }) => {
    const clearBtn = page.getByRole('button', { name: 'Clear all local data' });
    await clearBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click confirm deletion
    const confirmBtn = dialog.getByRole('button', { name: 'I understand, delete everything' });
    await confirmBtn.click();

    // Verify toast notification
    await expect(page.getByText('Local Data Cleared')).toBeVisible();
    await expect(dialog).not.toBeVisible();
  });
});
