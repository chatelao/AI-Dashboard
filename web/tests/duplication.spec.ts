import { test, expect } from '@playwright/test';

test.describe('Issue Duplication', () => {
  test('should keep or add Jules label when duplicating a Jules issue', async ({ page }) => {
    // Set mock gh_token
    await page.addInitScript(() => {
      window.localStorage.setItem('github_token', 'mock-gh-token');
    });

    const capturedLabels: string[][] = [];

    // Mock GitHub Issues GET API
    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Issue with jules label',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
            body: 'I have a label',
            assignee: null,
            labels: [{ name: 'jules' }],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          },
          {
            id: 2,
            number: 102,
            title: 'Issue assigned to Jules',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/102',
            body: 'I am assigned to Jules',
            assignee: { login: 'Jules' },
            labels: [],
            repository: { full_name: 'chatelao/AI-Dashboard' }
          }
        ])
      });
    });

    // Mock GitHub Issues POST API (Duplication)
    await page.route('**/repos/chatelao/AI-Dashboard/issues', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        capturedLabels.push(postData.labels || []);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ number: 103 })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/?test=true');

    // Handle confirm dialogs
    page.on('dialog', dialog => dialog.accept());

    // 1. Duplicate issue with jules label
    const firstIssueRow = page.locator('tbody tr').filter({ hasText: 'Issue with jules label' }).first();
    await firstIssueRow.locator('.btn-duplicate').click();

    // 2. Duplicate issue assigned to Jules
    const secondIssueRow = page.locator('tbody tr').filter({ hasText: 'Issue assigned to Jules' }).first();
    await secondIssueRow.locator('.btn-duplicate').click();

    // Check captured labels
    expect(capturedLabels.length).toBe(2);

    // Case 1: should have preserved 'jules'
    expect(capturedLabels[0]).toContain('jules');

    // Case 2: should have added 'Jules' (or 'jules')
    const hasJulesLabel = capturedLabels[1].some(l => l.toLowerCase() === 'jules');
    expect(hasJulesLabel).toBe(true);
  });
});
