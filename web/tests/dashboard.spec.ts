import { test, expect } from '@playwright/test';

test.describe('Dashboard Consolidation', () => {
  test('should consolidate PRs into issues as subtitles', async ({ page }) => {
    // Mock GitHub Issues API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
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
            assignee: null
          },
          {
            id: 2,
            number: 102,
            title: 'A linked PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/102',
            body: 'Fixes #101',
            assignee: null,
            pull_request: { url: '...', html_url: '...' }
          },
          {
            id: 3,
            number: 103,
            title: 'Unlinked PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/103',
            body: 'Just a PR',
            assignee: null,
            pull_request: { url: '...', html_url: '...' }
          }
        ])
      });
    });

    // Mock GitHub Pulls API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { number: 102, head: { sha: 'sha102' } },
          { number: 103, head: { sha: 'sha103' } }
        ])
      });
    });

    // Mock Check Runs API for PR 102
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/commits/sha102/check-runs', async (route) => {
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
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/commits/sha103/check-runs', async (route) => {
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
    const issueRow = page.locator('tr', { has: page.locator('td').filter({ hasText: /^101$/ }) });
    await expect(issueRow).toContainText('Fix a bug');
    await expect(issueRow.locator('.title-container .subtitle')).toContainText('PR #102: A linked PR');

    // Verify Issue 101's row has the green PR status icon (from linked PR 102)
    await expect(issueRow.locator('.pr-icon-green')).toBeVisible();

    // Verify PR 103 exists as a separate row (since it's not linked)
    const prRow = page.locator('tr', { has: page.locator('td').filter({ hasText: /^103$/ }) });
    await expect(prRow).toContainText('Unlinked PR');

    // Verify total number of rows (should be 2: Issue 101 and PR 103)
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
  });

  test('should filter and paginate issues', async ({ page }) => {
    const totalIssues = 30;
    const mockIssues = Array.from({ length: totalIssues }, (_, i) => ({
      id: i + 1,
      number: 1000 + i,
      title: `Issue ${i + 1}`,
      state: i < 25 ? 'open' : 'closed',
      html_url: `https://github.com/chatelao/AI-Dashboard/issues/${1000 + i}`,
      body: 'Description',
      assignee: null
    }));

    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIssues)
      });
    });

    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.goto('/');

    // Verify default pagination (20 entries)
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(20);

    // Change entries to 10
    await page.selectOption('#page-size', '10');
    await expect(rows).toHaveCount(10);

    // Change status filter to "Only Open"
    // With 30 issues total, 25 are open. If we show 50 entries, we should see 25.
    // But we currently have 10 entries selected.
    await page.selectOption('#page-size', '50');
    await page.selectOption('#status-filter', 'open');
    await expect(rows).toHaveCount(25);

    // Verify all shown issues are open
    const states = page.locator('.badge.state-open');
    await expect(states).toHaveCount(25);
  });
});
