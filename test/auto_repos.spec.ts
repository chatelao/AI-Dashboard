import { test, expect } from '@playwright/test';

test('auto-tracks all repositories from user if tracked repositories list is empty', async ({ page }) => {
  // Set mock token and initial state (empty repo list)
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify([]));
    (window as any).isTest = true;
  });

  // Mock /user/repos
  await page.route('**/user/repos?sort=updated&per_page=100', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { full_name: 'user/repo-a' },
        { full_name: 'user/repo-b' }
      ])
    });
  });

  // Mock repo-a issues
  await page.route('**/repos/user/repo-a/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Issue A',
          state: 'open',
          html_url: 'https://github.com/user/repo-a/issues/1',
          updated_at: '2023-10-01T12:00:00Z',
          repository: { full_name: 'user/repo-a' },
          assignee: null,
          labels: []
        }
      ])
    });
  });

  // Mock repo-a pulls
  await page.route('**/repos/user/repo-a/pulls?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  // Mock repo-b issues
  await page.route('**/repos/user/repo-b/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 2,
          number: 2,
          title: 'Issue B',
          state: 'open',
          html_url: 'https://github.com/user/repo-b/issues/2',
          updated_at: '2023-10-02T12:00:00Z',
          repository: { full_name: 'user/repo-b' },
          assignee: null,
          labels: []
        }
      ])
    });
  });

  // Mock repo-b pulls
  await page.route('**/repos/user/repo-b/pulls?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('/');

  // Verify both issues are present
  await expect(page.locator('text=[repo-a] Issue A')).toBeVisible();
  await expect(page.locator('text=[repo-b] Issue B')).toBeVisible();
});
