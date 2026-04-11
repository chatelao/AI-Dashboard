import { test, expect } from '@playwright/test';

test.describe('AI-Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GitHub API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Issue 1',
            state: 'open',
            html_url: 'https://github.com/issues/101',
            assignee: { login: 'Jules' },
            pull_request: null
          },
          {
            id: 2,
            number: 102,
            title: 'Issue 2',
            state: 'closed',
            html_url: 'https://github.com/issues/102',
            assignee: null,
            pull_request: null
          }
        ])
      });
    });

    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 3,
            number: 201,
            title: 'Fix Issue 101',
            state: 'open',
            html_url: 'https://github.com/pull/201',
            body: 'Fixes #101',
            head: { sha: 'sha123' }
          }
        ])
      });
    });

    // Mock Jules API
    await page.route('https://jules.googleapis.com/v1/tasks/101/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Coding' })
      });
    });

    await page.route('**/commits/sha123/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] })
      });
    });

    await page.goto('/');
  });

  test('should display dashboard with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/AI-Dashboard: AI Development Dashboard/);
    await expect(page.locator('h1')).toHaveText(/AI-Dashboard: AI Development Dashboard/);
  });

  test('should align table columns correctly and show PR consolidation', async ({ page }) => {
    const table = page.locator('table');
    const headers = table.locator('th');
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toHaveText('#');
    await expect(headers.nth(1)).toHaveText('Title');
    await expect(headers.nth(2)).toHaveText('State');
    await expect(headers.nth(3)).toHaveText('PR');
    await expect(headers.nth(4)).toHaveText('Jules Status');

    // Check consolidation
    const firstRowTitle = table.locator('tbody tr').first().locator('td').nth(1);
    await expect(firstRowTitle).toContainText('Issue 1');
    await expect(firstRowTitle.locator('.subtitle')).toContainText('PR #201: Fix Issue 101');
  });

  test('should filter by status', async ({ page }) => {
    const filter = page.locator('#status-filter');
    await filter.selectOption('open');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td').nth(2)).toContainText('open');
  });
});
