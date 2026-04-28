import { test, expect } from '@playwright/test';

test('Status Square Links', async ({ page }) => {
  // Mock issues:
  // 1. Open PR (will be green)
  // 2. Open Issue (will be yellow)
  // 3. Closed PR (will be purple)
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all&per_page=100&page=1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'Green PR',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
          body: 'Some body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: { login: 'jules' },
          labels: [{ name: 'jules' }],
          updated_at: new Date().toISOString(),
          pull_request: {
            url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/101',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101'
          }
        },
        {
          id: 2,
          number: 102,
          title: 'Yellow Issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/102',
          body: 'Some body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: { login: 'jules' },
          labels: [{ name: 'jules' }],
          updated_at: new Date().toISOString()
        },
        {
          id: 3,
          number: 103,
          title: 'Purple PR',
          state: 'closed',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/103',
          body: 'Some body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: { login: 'jules' },
          labels: [{ name: 'jules' }],
          updated_at: new Date().toISOString(),
          pull_request: {
            url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/103',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/103'
          }
        }
      ]),
    });
  });

  // Mock comments for session ID extraction
  await page.route('**/repos/chatelao/AI-Dashboard/issues/101/comments?per_page=100', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user: { login: 'jules' }, body: 'on it! https://jules.google.com/sessions/s1' }]) });
  });
  await page.route('**/repos/chatelao/AI-Dashboard/issues/102/comments?per_page=100', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user: { login: 'jules' }, body: 'on it! https://jules.google.com/sessions/s2' }]) });
  });
  await page.route('**/repos/chatelao/AI-Dashboard/issues/103/comments?per_page=100', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ user: { login: 'jules' }, body: 'on it! https://jules.google.com/sessions/s3' }]) });
  });

  // Mock Jules API
  await page.route('**/sessions/s1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state: 'STATE_COMPLETED', url: 'https://jules.google.com/sessions/s1', title: 'Done' }),
    });
  });
  await page.route('**/sessions/s2', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state: 'STATE_IN_PROGRESS', url: 'https://jules.google.com/sessions/s2', title: 'Working' }),
    });
  });
  await page.route('**/sessions/s3', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state: 'STATE_COMPLETED', url: 'https://jules.google.com/sessions/s3', title: 'Finished' }),
    });
  });

  // Mock PR detail
  await page.route('**/repos/chatelao/AI-Dashboard/pulls/101', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ head: { sha: 'sha101' }, html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101' }),
    });
  });
  await page.route('**/repos/chatelao/AI-Dashboard/pulls/103', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ head: { sha: 'sha103' }, html_url: 'https://github.com/chatelao/AI-Dashboard/pull/103' }),
    });
  });

  // Mock check-runs for green status
  await page.route('**/commits/sha101/check-runs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }),
    });
  });
  await page.route('**/commits/sha103/check-runs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }),
    });
  });

  // Mock pulls for initial load
  await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all&per_page=100', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // Set tokens in localStorage
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock_gh_token');
    window.localStorage.setItem('jules_token', 'mock_jules_token');
    window.localStorage.setItem('view_mode', 'projects');
  });

  await page.goto('http://localhost:5173/AI-Dashboard/?test=true');

  // Wait for enrichment
  const greenSquare = page.locator('.status-square.green');
  const yellowSquare = page.locator('.status-square.yellow');
  const purpleSquare = page.locator('.status-square.purple');

  await expect(greenSquare).toBeVisible({ timeout: 10000 });
  await expect(yellowSquare).toBeVisible({ timeout: 10000 });
  await expect(purpleSquare).toBeVisible({ timeout: 10000 });

  // Verify links
  // Green should link to PR
  await expect(greenSquare).toHaveAttribute('href', 'https://github.com/chatelao/AI-Dashboard/pull/101');

  // Yellow should link to Jules
  await expect(yellowSquare).toHaveAttribute('href', 'https://jules.google.com/sessions/s2');

  // Purple should link to PR (newly added behavior)
  await expect(purpleSquare).toHaveAttribute('href', 'https://github.com/chatelao/AI-Dashboard/pull/103');
});
