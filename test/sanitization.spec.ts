import { test, expect } from '@playwright/test';

test('sanitizes repository names in settings', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    (window as any).isTest = true;
  });

  // Mock repo1 issues
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

  await page.route('**/repos/repo1/a/pulls?state=all*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');

  // Open settings
  await page.click('button[aria-label="Settings"]');

  // Input dirty repo URL
  const repoInput = page.locator('#repo-history');
  await repoInput.fill(' https://github.com/repo1/a ');

  // Save settings
  const savePromise = page.waitForResponse('**/repos/repo1/a/issues?state=all*');
  await page.click('button.btn-save');
  await savePromise;

  // Verify it was sanitized and fetches data
  await expect(page.locator('text=[a] Issue from repo1')).toBeVisible();

  // Re-open settings to check value
  await page.click('button[aria-label="Settings"]');
  await expect(repoInput).toHaveValue('repo1/a');
});

test('migrates from old default repo to new default list', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify(['chatelao/AI-Dashboard']));
    (window as any).isTest = true;
  });

  // Mock AI-Dashboard
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, number: 1, title: 'AI-Dashboard Issue', state: 'open', html_url: '...', updated_at: '...', repository: { full_name: 'chatelao/AI-Dashboard' }, assignee: null, labels: [] }])
    });
  });
  await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all*', async (route) => { await route.fulfill({ body: '[]' }); });

  // Mock swisscarport-admin
  await page.route('**/repos/chatelao/swisscarport-admin/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 2, number: 2, title: 'Swisscarport Issue', state: 'open', html_url: '...', updated_at: '...', repository: { full_name: 'chatelao/swisscarport-admin' }, assignee: null, labels: [] }])
    });
  });
  await page.route('**/repos/chatelao/swisscarport-admin/pulls?state=all*', async (route) => { await route.fulfill({ body: '[]' }); });

  await page.goto('/');

  // Verify both issues are present (meaning both repos were loaded)
  await expect(page.locator('text=[AI-Dashboard] AI-Dashboard Issue')).toBeVisible();
  await expect(page.locator('text=[swisscarport-admin] Swisscarport Issue')).toBeVisible();

  // Check settings value
  await page.click('button[aria-label="Settings"]');
  const repoInput = page.locator('#repo-history');
  await expect(repoInput).toHaveValue('chatelao/AI-Dashboard, chatelao/swisscarport-admin');
});
