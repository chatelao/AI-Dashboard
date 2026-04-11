import { test, expect } from '@playwright/test';

test.describe('Dashboard Consolidation', () => {
  test.beforeEach(async ({ page }) => {
    // Default mock for AI-Dashboard
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
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
          }
        ])
      });
    });

    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
  });

  test('should consolidate PRs into issues as subtitles', async ({ page }) => {
    // Override Mock GitHub Issues API for this test
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
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

    // Override Mock GitHub Pulls API for this test
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
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

  test('should support repository management', async ({ page }) => {
    // Mock for a new repository
    await page.route('https://api.github.com/repos/another/repo/issues?state=all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 10,
            number: 1,
            title: 'Another Repo Issue',
            state: 'open',
            html_url: 'https://github.com/another/repo/issues/1',
            body: 'Issue in another repo',
            assignee: null
          }
        ])
      });
    });

    await page.route('https://api.github.com/repos/another/repo/pulls?state=all', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/');

    // Initially should show AI-Dashboard
    await expect(page.locator('h1')).toContainText('AI-Dashboard');
    await expect(page.locator('tbody')).toContainText('Fix a bug');

    // Add a new repository
    await page.fill('input[placeholder="owner/repo"]', 'another/repo');
    await page.click('button:has-text("Add Repository")');

    // Should now show another/repo
    await expect(page.locator('tbody')).toContainText('Another Repo Issue');
    await expect(page.locator('select#repo-select')).toHaveValue('another/repo');
    await expect(page.locator('tbody')).toContainText('[another/repo]');

    // Switch back using dropdown
    await page.selectOption('select#repo-select', 'chatelao/AI-Dashboard');
    await expect(page.locator('tbody')).toContainText('Fix a bug');
    await expect(page.locator('tbody')).toContainText('[chatelao/AI-Dashboard]');
  });

  test('should create a new Jules issue', async ({ page }) => {
    let postData: any = null;

    // Using a glob pattern to be more flexible with the URL
    await page.route('**/repos/chatelao/AI-Dashboard/issues', async (route) => {
      if (route.request().method() === 'POST') {
        postData = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 201,
            number: 201,
            title: postData?.title || 'Unknown',
            state: 'open',
            html_url: `https://github.com/chatelao/AI-Dashboard/issues/201`,
            body: '',
            assignee: null,
            labels: [{ name: 'Jules' }]
          })
        });
      } else {
        await route.continue();
      }
    });

    // Mock window.location.reload
    await page.addInitScript(() => {
      (window as any).location.reload = () => {
        console.log('Window reload mocked');
      };
    });

    await page.goto('/');

    await page.fill('input[placeholder="New issue title"]', 'Test Jules Issue');

    // Wait for the request to be sent
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/repos/chatelao/AI-Dashboard/issues') && req.method() === 'POST'),
      page.click('button:has-text("Create Jules Issue")')
    ]);

    postData = request.postDataJSON();
    expect(postData).not.toBeNull();
    expect(postData.title).toBe('Test Jules Issue');
    expect(postData.labels).toContain('Jules');
  });
});
