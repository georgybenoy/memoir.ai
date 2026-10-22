import { test, expect } from '@playwright/test';

test.describe('Workspace Preference Persistence Across Reloads', () => {
  test('persists difficulty and reduced motion settings in IndexedDB', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/settings');

    // Verify settings header is visible
    await expect(page.getByRole('heading', { name: 'Data & Settings' })).toBeVisible();

    // 2. Locate difficulty select and change to 'advanced'
    const difficultySelect = page.getByLabel('Difficulty level');
    await expect(difficultySelect).toBeVisible();
    await difficultySelect.selectOption('advanced');

    // Verify confirmation toast or select value
    await expect(difficultySelect).toHaveValue('advanced');
    await expect(page.getByText('Preference Saved')).toBeVisible();

    // 3. Toggle Reduced Motion to Enabled
    const motionBtn = page.getByRole('button', { name: 'Toggle reduced motion preference' });
    await expect(motionBtn).toBeVisible();
    await motionBtn.click();
    await expect(motionBtn).toHaveText('Enabled');
    await expect(page.getByText('Preference Saved').nth(1)).toBeVisible();

    // 4. Reload page
    await page.reload();

    // 5. Confirm settings view after reload
    await expect(page.getByRole('heading', { name: 'Data & Settings' })).toBeVisible();

    // 6. Confirm settings persisted in IndexedDB
    const difficultySelectAfter = page.getByLabel('Difficulty level');
    await expect(difficultySelectAfter).toHaveValue('advanced');

    const motionBtnAfter = page.getByRole('button', { name: 'Toggle reduced motion preference' });
    await expect(motionBtnAfter).toHaveText('Enabled');
  });
});
