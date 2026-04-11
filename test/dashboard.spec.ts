import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/AI Development Dashboard/);

  // Expect the description text to NOT be present.
  await expect(page.locator('text=Unified view of GitHub Issues and Google Jules Statuses')).not.toBeVisible();
});

test('dashboard loads issues and displays Jules status', async ({ page }) => {
  // Set mock tokens
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('jules_token', 'mock-jules-token');
  });

  // Mock GitHub Global Issues API
  await page.route('**/issues?state=all&filter=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'Jules issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
          body: 'Help me Jules',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: { login: 'Jules' },
          labels: []
        },
        {
          id: 2,
          number: 102,
          title: 'Labeled issue',
          state: 'closed',
          html_url: 'https://github.com/chatelao/other-repo/issues/102',
          body: 'I have a label',
          repository: { full_name: 'chatelao/other-repo' },
          assignee: null,
          labels: [{ name: 'Jules' }]
        }
      ])
    });
  });

  // Mock Jules API for Issue 101
  await page.route('**/v1/tasks/101/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'Coding' })
    });
  });

  // Mock Jules API for Issue 102
  await page.route('**/v1/tasks/102/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'Completed' })
    });
  });

  await page.goto('/');

  // Wait for the table to be visible
  const table = page.locator('table');
  await expect(table).toBeVisible();

  // Verify Issue 101 status and repo name
  const row101 = page.locator('tr', { has: page.locator('td').filter({ hasText: /Jules issue/ }) });
  await expect(row101.locator('td').nth(0)).toContainText('[AI-Dashboard]');
  await expect(row101.locator('td').nth(3)).toContainText('Coding');

  // Verify Issue 102 (closed) is NOT visible by default
  const row102 = page.locator('tr', { has: page.locator('td').filter({ hasText: /Labeled issue/ }) });
  await expect(row102).not.toBeVisible();

  // Switch filter to "all"
  await page.selectOption('#status-filter', 'all');

  // Verify Issue 102 status and repo name
  await expect(row102.locator('td').nth(0)).toContainText('[other-repo]');
  await expect(row102.locator('td').nth(3)).toContainText('Completed');
});

test('dashboard filters by page size', async ({ page }) => {
  // Set mock tokens
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
  });

  // Mock GitHub Global Issues API with 15 issues
  await page.route('**/issues?state=all&filter=all*', async (route) => {
    const issues = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      number: 100 + i,
      title: `Issue ${i + 1}`,
      state: 'open',
      html_url: `https://github.com/chatelao/AI-Dashboard/issues/${100 + i}`,
      repository: { full_name: 'chatelao/AI-Dashboard' },
      labels: []
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(issues)
    });
  });

  await page.goto('/');

  // Default page size is 50, so all 15 should be visible
  await expect(page.locator('tbody tr')).toHaveCount(15);

  // Change page size to 10
  await page.selectOption('#page-size', '10');

  // Verify only 10 issues are visible
  await expect(page.locator('tbody tr')).toHaveCount(10);
});
