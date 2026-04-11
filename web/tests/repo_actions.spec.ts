import { test, expect } from '@playwright/test';

test.describe('Repository and Issue Actions', () => {
  test.beforeEach(async ({ page }) => {
    // Mock initial GitHub Issues and Pulls API for the default repo
    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, number: 1, title: 'Default Repo Issue', state: 'open', labels: [], assignee: null }])
      });
    });

    await page.route('**/repos/chatelao/AI-Dashboard/pulls?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
  });

  test('should allow adding and switching repositories', async ({ page }) => {
    const newRepo = 'other-owner/other-repo';

    // Mock the new repo APIs
    await page.route(`**/repos/${newRepo}/issues?state=all*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 2, number: 10, title: 'Other Repo Issue', state: 'open', labels: [], assignee: null }])
      });
    });
    await page.route(`**/repos/${newRepo}/pulls?state=all*`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    // Verify default repo issue is visible
    await expect(page.locator('tbody tr').first()).toContainText('Default Repo Issue');

    // Add a new repo
    const addInput = page.getByPlaceholder('owner/repo');
    await addInput.fill(newRepo);
    await page.getByRole('button', { name: 'Add' }).click();

    // Verify dropdown updated and switched
    const select = page.locator('#repo-select');
    await expect(select).toHaveValue(newRepo);

    // Verify new repo data is displayed
    await expect(page.locator('tbody tr').first()).toContainText('Other Repo Issue');
    await expect(page.locator('tbody tr').first()).not.toContainText('Default Repo Issue');
  });

  test('should allow creating a new issue with Jules label', async ({ page }) => {
    const issueTitle = 'New Jules Task';

    // Set mock GitHub token
    await page.addInitScript(() => {
      window.localStorage.setItem('github_token', 'mock-gh-token');
    });

    // Mock the POST request to create an issue
    let postData: any = null;
    await page.route('**/repos/chatelao/AI-Dashboard/issues', async (route) => {
      if (route.request().method() === 'POST') {
        postData = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 999, number: 99, title: issueTitle, state: 'open', labels: [{ name: 'Jules' }], assignee: null })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');

    // Fill in the new issue title
    const issueInput = page.getByPlaceholder('New issue title...');
    await issueInput.fill(issueTitle);

    // Click create
    await page.getByRole('button', { name: 'Create Issue (Jules)' }).click();

    // Verify POST request payload
    expect(postData).toEqual({
      title: issueTitle,
      labels: ['Jules']
    });

    // Verify input is cleared
    await expect(issueInput).toHaveValue('');
  });
});
