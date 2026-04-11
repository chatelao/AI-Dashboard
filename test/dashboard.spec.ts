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
  const row101 = page.locator('tr', { has: page.locator('td').filter({ hasText: /^101$/ }) });
  await expect(row101.locator('td').nth(1)).toContainText('[AI-Dashboard]');
  await expect(row101.locator('td').nth(5)).toContainText('Coding');

  // Verify Issue 102 status and repo name
  const row102 = page.locator('tr', { has: page.locator('td').filter({ hasText: /^102$/ }) });
  await expect(row102.locator('td').nth(1)).toContainText('[other-repo]');
  await expect(row102.locator('td').nth(5)).toContainText('Completed');
});
