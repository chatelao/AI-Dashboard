import { test, expect } from '@playwright/test';

test.describe('Dashboard Consolidation', () => {
  test('should consolidate PRs into issues as subtitles', async ({ page }) => {
    // Mock GitHub Issues API
    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Fix a bug',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
            body: 'Detailed description',
            assignee: null,
            labels: [],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          },
          {
            id: 2,
            number: 102,
            title: 'A linked PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/102',
            body: 'Fixes #101',
            assignee: null,
            labels: [],
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/102', html_url: '...' },
            repository: { full_name: 'chatelao/AI-Dashboard' }
          },
          {
            id: 3,
            number: 103,
            title: 'Unlinked PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/103',
            body: 'Just a PR',
            assignee: null,
            labels: [],
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/103', html_url: '...' },
            repository: { full_name: 'chatelao/AI-Dashboard' }
          }
        ])
      });
    });

    // Mock individual PR details
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/102', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 102, head: { sha: 'sha102' } })
      });
    });
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/103', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 103, head: { sha: 'sha103' } })
      });
    });

    // Mock Check Runs API for PR 102
    await page.route('**/repos/chatelao/AI-Dashboard/commits/sha102/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_count: 1,
          check_runs: [{ status: 'completed', conclusion: 'success' }]
        })
      });
    });

    // Mock Check Runs API for PR 103
    await page.route('**/repos/chatelao/AI-Dashboard/commits/sha103/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_count: 0,
          check_runs: []
        })
      });
    });

    await page.goto('/');

    // Verify Issue 101 exists and has PR 102 as subtitle
    const issueRow = page.locator('tbody tr').filter({ hasText: 'Fix a bug' });
    await expect(issueRow).toBeVisible();
    await expect(issueRow.locator('.title-container .subtitle')).toContainText('PR #102: A linked PR');

    // Verify Issue 101's row has the green PR status icon (from linked PR 102)
    await expect(issueRow.locator('.pr-icon-green')).toBeVisible();

    // Verify PR 103 exists as a separate row (since it's not linked)
    const prRow = page.locator('tbody tr').filter({ hasText: 'Unlinked PR' });
    await expect(prRow).toBeVisible();

    // Verify total number of rows (should be 2: Issue 101 and PR 103)
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('should display Jules status for issues and linked PRs assigned to Jules', async ({ page }) => {
    // Set mock jules_token
    await page.addInitScript(() => {
      window.localStorage.setItem('jules_token', 'mock-jules-token');
    });

    // Mock GitHub Issues API
    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 201,
            number: 201,
            title: 'Jules issue',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/201',
            body: 'Help me Jules',
            assignee: { login: 'Jules' },
            labels: [],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          },
          {
            id: 202,
            number: 202,
            title: 'Jules PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/202',
            body: 'Fixes #201',
            assignee: { login: 'Jules' },
            labels: [],
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/202', html_url: '...' },
            repository: { full_name: 'chatelao/AI-Dashboard' }
          }
        ])
      });
    });

    // Mock individual PR details
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/202', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 202, head: { sha: 'sha202' } })
      });
    });

    // Mock Jules API for Issue 201
    await page.route('**/tasks/201/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Coding' })
      });
    });

    // Mock Jules API for PR 202
    await page.route('**/tasks/202/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Researching' })
      });
    });

    await page.goto('/');

    const issueRow = page.locator('tbody tr').filter({ hasText: 'Jules issue' });

    // Verify Issue 201 status (Jules Status column is now at index 3)
    await expect(issueRow.locator('td').nth(3)).toContainText('Coding');

    // Verify Linked PR 202 status (as subtitle in Jules Status column)
    await expect(issueRow.locator('td').nth(3).locator('.subtitle')).toContainText('Researching');
  });
});
