import { test, expect } from '@playwright/test';

test('displays PR file count and extensions', async ({ page }) => {
  // Set mock tokens
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    (window as any).isTest = true;
  });

  // Mock GitHub Issues API
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'PR with files',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101',
          body: 'Some PR',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: null,
          labels: [],
          updated_at: new Date().toISOString(),
          pull_request: {
            url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/101',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101'
          }
        }
      ])
    });
  });

  // Mock PR Detail API
  await page.route('**/repos/chatelao/AI-Dashboard/pulls/101', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mergeable: true,
        mergeable_state: 'clean',
        head: { sha: 'mock-sha' }
      })
    });
  });

  // Mock PR Files API
  await page.route('**/repos/chatelao/AI-Dashboard/pulls/101/files', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { filename: 'file1.ts' },
        { filename: 'file2.tsx' },
        { filename: 'file3.ts' }
      ])
    });
  });

  // Mock Check Runs API
  await page.route('**/repos/chatelao/AI-Dashboard/commits/mock-sha/check-runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 0, check_runs: [] })
    });
  });

  await page.goto('/');

  // Wait for the table and the enriched data
  const prRow = page.locator('tr', { hasText: 'PR with files' });
  await expect(prRow).toBeVisible();

  // The text should contain "(3 files, .ts, .tsx)"
  await expect(prRow).toContainText('(3 files, .ts, .tsx)');
});
