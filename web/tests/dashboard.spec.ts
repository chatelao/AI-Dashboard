import { test, expect } from '@playwright/test';

test.describe('Dashboard Consolidation', () => {
  test('should consolidate PRs into issues as subtitles', async ({ page }) => {
    // Mock GitHub Issues API
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

    // Mock GitHub Pulls API
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

  test('should display Jules status for issues and linked PRs assigned to Jules', async ({ page }) => {
    // Set mock jules_token
    await page.addInitScript(() => {
      window.localStorage.setItem('jules_token', 'mock-jules-token');
    });

    // Mock GitHub Issues API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
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
            assignee: { login: 'Jules' }
          },
          {
            id: 202,
            number: 202,
            title: 'Jules PR',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/202',
            body: 'Fixes #201',
            assignee: { login: 'Jules' },
            pull_request: { url: '...', html_url: '...' }
          }
        ])
      });
    });

    // Mock GitHub Pulls API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { number: 202, head: { sha: 'sha202' } }
        ])
      });
    });

    // Mock Jules API for Issue 201
    await page.route('https://jules.googleapis.com/v1/tasks/201/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Coding' })
      });
    });

    // Mock Jules API for PR 202
    await page.route('https://jules.googleapis.com/v1/tasks/202/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Researching' })
      });
    });

    await page.goto('/');

    const issueRow = page.locator('tr', { has: page.locator('td').filter({ hasText: /^201$/ }) });

    // Verify Issue 201 status
    await expect(issueRow.locator('td').nth(5)).toContainText('Coding');

    // Verify Linked PR 202 status (as subtitle in Jules Status column)
    await expect(issueRow.locator('td').nth(5).locator('.subtitle')).toContainText('Researching');
  });

  test('should allow adding and switching repositories', async ({ page }) => {
    // Initial load for default repo
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    await page.goto('/');

    // Add new repo
    await page.route('https://api.github.com/repos/other-owner/other-repo/issues?state=all', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{ id: 301, number: 301, title: 'Other Issue', state: 'open', html_url: '#', body: '', assignee: null }])
      });
    });
    await page.route('https://api.github.com/repos/other-owner/other-repo/pulls?state=all', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    await page.fill('input[aria-label="Add new repository"]', 'other-owner/other-repo');
    await page.click('button:has-text("Add Repo")');

    // Verify current repo is selected and data is loaded
    await expect(page.locator('select[aria-label="Select Repository"]')).toHaveValue('other-owner/other-repo');
    await expect(page.locator('tbody tr')).toContainText('Other Issue');
    await expect(page.locator('tbody tr')).toContainText('[other-repo]');
  });

  test('should allow creating a new issue', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('github_token', 'mock-token');
    });

    let issueCreated = false;

    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all', async (route) => {
      if (issueCreated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 401,
            number: 401,
            title: 'A new feature',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/401',
            body: '',
            assignee: null
          }])
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
    });

    await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    // Mock issue creation
    await page.route('**/repos/chatelao/AI-Dashboard/issues', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        expect(postData.title).toBe('A new feature');
        expect(postData.labels).toContain('Jules');
        issueCreated = true;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 401, number: 401 }) });
      } else {
        await route.continue();
      }
    });

    await page.fill('input[aria-label="New issue title"]', 'A new feature');
    await page.click('button:has-text("Create Issue")');

    // Wait for the new issue to appear in the table
    const newIssueRow = page.locator('tr', { hasText: '401' });
    await expect(newIssueRow).toBeVisible();
    await expect(newIssueRow).toContainText('A new feature');
  });
});
