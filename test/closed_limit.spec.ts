import { test, expect } from '@playwright/test';

test('dashboard limits closed issues to 4 per repo', async ({ page }) => {
  // Set mock tokens and repo history
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify(['owner/repo']));
    (window as any).isTest = true;
  });

  const issues = [
    { id: 1, number: 1, title: 'Open Issue', state: 'open', updated_at: '2023-10-10T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
    { id: 2, number: 2, title: 'Closed Issue 1', state: 'closed', updated_at: '2023-10-09T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
    { id: 3, number: 3, title: 'Closed Issue 2', state: 'closed', updated_at: '2023-10-08T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
    { id: 4, number: 4, title: 'Closed Issue 3', state: 'closed', updated_at: '2023-10-07T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
    { id: 5, number: 5, title: 'Closed Issue 4', state: 'closed', updated_at: '2023-10-06T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
    { id: 6, number: 6, title: 'Closed Issue 5', state: 'closed', updated_at: '2023-10-05T12:00:00Z', repository: { full_name: 'owner/repo' }, assignee: null, labels: [] },
  ];

  // Mock GitHub Issues API
  await page.route('**/repos/owner/repo/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(issues)
    });
  });

  await page.goto('/');

  // Verify issues are present.
  // Before fix, it should be 6.
  // After fix, it should be 5 (1 open + 4 most recent closed).
  const rows = page.locator('tbody tr');

  // We expect 5 rows after the fix.
  await expect(rows).toHaveCount(5);

  // Verify which ones are present
  await expect(page.locator('text=Open Issue')).toBeVisible();
  await expect(page.locator('text=Closed Issue 1')).toBeVisible();
  await expect(page.locator('text=Closed Issue 2')).toBeVisible();
  await expect(page.locator('text=Closed Issue 3')).toBeVisible();
  await expect(page.locator('text=Closed Issue 4')).toBeVisible();

  // Closed Issue 5 should NOT be visible
  await expect(page.locator('text=Closed Issue 5')).not.toBeVisible();
});
