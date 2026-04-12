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
    (window as any).isTest = true;
  });

  // Mock GitHub Issues API (now repo-specific)
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
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

  await page.goto('/');

  // Wait for the table to be visible
  const table = page.locator('table');
  await expect(table).toBeVisible();

  // Verify Issue 101 status and repo name
  // Note: the table has 4 columns: Title, State, PR, Jules Status
  // The Title column contains the repo name in brackets.
  // We use filter with hasText to find the row containing the issue title or number if it was there,
  // but since we want to be specific about the columns:
  const row101 = page.locator('tr', { has: page.locator('text=Jules issue') });
  await expect(row101.locator('td').nth(0)).toContainText('[AI-Dashboard]');
  await expect(row101.locator('td').nth(3)).toContainText('Coding');
});

test('dashboard aggregates issues from all repositories', async ({ page }) => {
  // Set mock tokens and repo history
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify(['repo1/a', 'repo2/b']));
    (window as any).isTest = true;
  });

  // Mock repo1
  await page.route('**/repos/repo1/a/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Issue from repo1',
          state: 'open',
          html_url: 'https://github.com/repo1/a/issues/1',
          updated_at: '2023-10-01T12:00:00Z',
          repository: { full_name: 'repo1/a' },
          assignee: null,
          labels: []
        }
      ])
    });
  });

  // Mock repo2
  await page.route('**/repos/repo2/b/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 2,
          number: 2,
          title: 'Issue from repo2',
          state: 'open',
          html_url: 'https://github.com/repo2/b/issues/2',
          updated_at: '2023-10-02T12:00:00Z',
          repository: { full_name: 'repo2/b' },
          assignee: null,
          labels: []
        }
      ])
    });
  });

  await page.goto('/');

  // Verify both issues are present and sorted (repo2 issue first as it is newer)
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);

  await expect(rows.nth(0)).toContainText('[b] Issue from repo2');
  await expect(rows.nth(1)).toContainText('[a] Issue from repo1');
});
