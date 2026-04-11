import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/AI Development Dashboard/);
});

test('dashboard loads issues', async ({ page }) => {
  await page.goto('/');

  // Wait for the table to be visible, or at least the header
  const table = page.locator('table');
  await expect(table).toBeVisible();

  // Check if there are rows in the table (including header)
  const rows = page.locator('tr');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
});
