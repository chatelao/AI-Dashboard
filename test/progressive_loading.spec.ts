import { test, expect } from '@playwright/test';

test('dashboard renders basic list and then enriches progressively', async ({ page }) => {
  // Set mock tokens
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('jules_token', 'mock-jules-token');
  });

  // Mock GitHub Issues API - return data only for page 1
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('page') === '1' || !url.searchParams.get('page')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Fast Loading Issue',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
            body: 'Enrich me later',
            repository: { full_name: 'chatelao/AI-Dashboard' },
            assignee: { login: 'Jules' },
            labels: []
          }
        ])
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    }
  });

  // Mock GitHub Pulls API (Bulk)
  await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  // Mock Jules API with DELAY
  await page.route('**/v1/tasks/101/status', async (route) => {
    // Wait a bit to ensure we can capture the "loading" state
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'Coding' })
    });
  });

  await page.goto('/');

  // 1. Check for basic content (immediate)
  const row = page.locator('tr', { hasText: 'Fast Loading Issue' });
  await expect(row).toBeVisible();

  // 2. Check for loading indicator in Jules column
  const julesCell = row.locator('td').nth(3);
  await expect(julesCell.locator('.loading-dots')).toBeVisible();
  await expect(julesCell).toContainText('...');

  // 3. Wait for enrichment to complete
  await expect(julesCell).toContainText('Coding', { timeout: 10000 });
  await expect(julesCell.locator('.loading-dots')).not.toBeVisible();
});
