import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/AI Development Dashboard/);
});

test('dashboard loads issues', async ({ page }) => {
  // Mock GitHub API to ensure consistency and avoid rate limits
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 1,
        number: 1,
        title: 'Mock Issue',
        state: 'open',
        html_url: 'https://github.com/chatelao/AI-Dashboard/issues/1',
        body: '',
        assignee: null
      }])
    });
  });

  await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('/');

  // Wait for the table to be visible with an increased timeout
  const table = page.locator('table');
  await expect(table).toBeVisible({ timeout: 10000 });

  // Verify that the table contains our mock issue
  await expect(page.locator('tbody tr')).toContainText('Mock Issue');
});
