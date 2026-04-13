import { test, expect } from '@playwright/test';

test('search input is focused on load', async ({ page }) => {
  await page.goto('/');

  const searchInput = page.locator('.filter-input');
  await expect(searchInput).toBeFocused();
});
