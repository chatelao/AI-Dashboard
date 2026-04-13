import { test, expect } from '@playwright/test';

test('dashboard refreshes when becoming visible', async ({ page }) => {
  // Mock GitHub API responses
  await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Test Issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/1',
          body: 'Test body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          updated_at: new Date().toISOString(),
          labels: []
        }
      ])
    });
  });

  await page.goto('http://localhost:5173/AI-Dashboard/?test=true');

  // Wait for initial load
  await expect(page.locator('text=Test Issue')).toBeVisible();

  // Track the number of requests to the issues API
  let requestCount = 0;
  await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues*', async route => {
    requestCount++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Test Issue Updated',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/1',
          body: 'Test body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          updated_at: new Date().toISOString(),
          labels: []
        }
      ])
    });
  });

  // Simulate visibility change to hidden then visible
  await page.evaluate(() => {
    // We need to mock the property because it's read-only
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Should not have refreshed yet
  expect(requestCount).toBe(0);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Wait for the refresh to happen
  await expect(page.locator('text=Test Issue Updated')).toBeVisible();
  expect(requestCount).toBeGreaterThan(0);
});
