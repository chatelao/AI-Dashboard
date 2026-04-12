import { test, expect } from '@playwright/test';

test('can manage tracked repositories via settings', async ({ page }) => {
  // Set mock token and initial state
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify(['repo1/a']));
    (window as any).isTest = true;
  });

  // Mock repo1 (default) issues
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

  // Mock repo1 pulls
  await page.route('**/repos/repo1/a/pulls?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  // Mock repo2 issues
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

  // Mock repo2 pulls
  await page.route('**/repos/repo2/b/pulls?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.goto('/');

  // Wait for the first row to be visible
  await expect(page.locator('text=[a] Issue from repo1')).toBeVisible();

  // Open settings
  await page.click('button[aria-label="Settings"]');

  // Add repo2 to tracked repositories
  const repoInput = page.locator('#repo-history');
  await repoInput.fill('repo1/a, repo2/b');

  // Save settings and wait for requests to complete
  const savePromise = page.waitForResponse('**/repos/repo2/b/issues?state=all*');
  await page.click('button.btn-save');
  await savePromise;

  // Verify both issues are present
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2, { timeout: 10000 });

  await expect(page.locator('text=[a] Issue from repo1')).toBeVisible();
  await expect(page.locator('text=[b] Issue from repo2')).toBeVisible();
});
