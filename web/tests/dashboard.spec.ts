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
            repository: { full_name: 'chatelao/AI-Dashboard' },
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/102', html_url: 'https://github.com/chatelao/AI-Dashboard/pull/102' }
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
            repository: { full_name: 'chatelao/AI-Dashboard' },
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/103', html_url: 'https://github.com/chatelao/AI-Dashboard/pull/103' }
          }
        ])
      });
    });

    // Mock GitHub Pull Detail API for PR 102
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/102', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 102, head: { sha: 'sha102' } })
      });
    });

    // Mock GitHub Pull Detail API for PR 103
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

    await page.goto('/?test=true');

    // Verify Issue 101 exists and has PR 102 as subtitle
    const issueRow = page.locator('tbody tr').filter({ hasText: 'Fix a bug' }).first();
    await expect(issueRow).toBeVisible();
    await expect(issueRow.locator('td[data-label="Title"] .subtitle').first()).toContainText('PR #102:');
    await expect(issueRow.locator('td[data-label="Title"] .subtitle').first()).toContainText('A linked PR');

    // Verify Issue 101's row has the green PR status icon (from linked PR 102)
    await expect(issueRow.locator('.pr-icon-green').first()).toBeVisible();

    // Verify PR 103 exists as a separate row (since it's not linked)
    const prRow = page.locator('tbody tr').filter({ hasText: 'Unlinked PR' }).first();
    await expect(prRow).toBeVisible();

    // Verify total number of rows (should be 2: Issue 101 and PR 103)
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    // Verify repository tag links to the issues page
    const repoTagLink = issueRow.locator('a[href$="/issues"]');
    await expect(repoTagLink).toBeVisible();
    await expect(repoTagLink).toHaveAttribute('href', 'https://github.com/chatelao/AI-Dashboard/issues');
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
            repository: { full_name: 'chatelao/AI-Dashboard' },
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/202', html_url: 'https://github.com/chatelao/AI-Dashboard/pull/202' }
          }
        ])
      });
    });

    // Mock GitHub Pull Detail API for PR 202
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/202', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 202, head: { sha: 'sha202' } })
      });
    });

    // Mock Check Runs API for PR 202
    await page.route('**/repos/chatelao/AI-Dashboard/commits/sha202/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_count: 0,
          check_runs: []
        })
      });
    });

    // Mock GitHub Comments API for Issue 201
    await page.route('**/repos/chatelao/AI-Dashboard/issues/201/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user: { login: 'google-labs-jules[bot]' },
            body: 'Jules is on it. View progress at https://jules.google.com/sessions/201'
          }
        ])
      });
    });

    // Mock GitHub Comments API for PR 202 (represented as issue comments in GitHub)
    await page.route('**/repos/chatelao/AI-Dashboard/issues/202/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user: { login: 'google-labs-jules[bot]' },
            body: 'Jules is on it. View progress at https://jules.google.com/sessions/202'
          }
        ])
      });
    });

    // Mock Jules API for Session 201
    await page.route('**/v1alpha/sessions/201', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'STATE_CODING',
          url: 'https://jules.google.com/task/201'
        })
      });
    });

    // Mock Jules API for Session 202
    await page.route('**/v1alpha/sessions/202', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'STATE_RESEARCHING',
          url: 'https://jules.google.com/task/202'
        })
      });
    });

    await page.goto('/?test=true');

    const issueRow = page.locator('tbody tr').filter({ hasText: 'Jules issue' }).first();

    // Verify Issue 201 status and link
    const julesStatusCell = issueRow.locator('td').nth(3);
    await expect(julesStatusCell).toContainText('coding', { ignoreCase: true });
    const issueLink = julesStatusCell.locator('a').first();
    await expect(issueLink).toHaveAttribute('href', 'https://jules.google.com/task/201');

    // Verify Linked PR 202 status and link (as subtitle in Jules column)
    const prSubtitle = julesStatusCell.locator('.subtitle').first();
    await expect(prSubtitle).toContainText('researching', { ignoreCase: true });
    const prLink = prSubtitle.locator('a');
    await expect(prLink).toHaveAttribute('href', 'https://jules.google.com/task/202');
  });

  test('should display Jules status for items with lowercase "jules" label', async ({ page }) => {
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
            id: 301,
            number: 301,
            title: 'Lowercase Jules label',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/301',
            body: 'Help me lowercase jules',
            assignee: null,
            labels: [{ name: 'jules' }],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          }
        ])
      });
    });

    // Mock GitHub Comments API for Issue 301
    await page.route('**/repos/chatelao/AI-Dashboard/issues/301/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user: { login: 'jules' },
            body: 'Jules is on it. task_id: 301'
          }
        ])
      });
    });

    // Mock Jules API for Session 301
    await page.route('**/v1alpha/sessions/301', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'STATE_TESTING' })
      });
    });

    await page.goto('/?test=true');

    const issueRow = page.locator('tbody tr').filter({ hasText: 'Lowercase Jules label' }).first();

    // Verify Issue 301 status
    await expect(issueRow.locator('td').nth(3)).toContainText('testing', { ignoreCase: true });
  });

  test('should display Jules status for items assigned to google-labs-jules[bot]', async ({ page }) => {
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
            id: 401,
            number: 401,
            title: 'Jules bot issue',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/401',
            body: 'Help me jules bot',
            assignee: { login: 'google-labs-jules[bot]' },
            labels: [],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          }
        ])
      });
    });

    // Mock GitHub Comments API for Issue 401
    await page.route('**/repos/chatelao/AI-Dashboard/issues/401/comments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user: { login: 'google-labs-jules[bot]' },
            body: 'Jules is on it. 12345678901234567'
          }
        ])
      });
    });

    // Mock Jules API for Session 12345678901234567
    await page.route('**/v1alpha/sessions/12345678901234567', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'STATE_COMPLETED' })
      });
    });

    await page.goto('/?test=true');

    const issueRow = page.locator('tbody tr').filter({ hasText: 'Jules bot issue' }).first();

    // Verify Issue 401 status
    await expect(issueRow.locator('td').nth(3)).toContainText('completed', { ignoreCase: true });
  });
});
