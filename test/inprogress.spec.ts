import { test, expect } from '@playwright/test';

test('should display InProgress for in-progress status', async ({ page }) => {
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
          id: 1,
          number: 1,
          title: 'In Progress Issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/1',
          body: 'Working on it',
          assignee: { login: 'Jules' },
          labels: [],
          repository: { full_name: 'chatelao/AI-Dashboard' }
        }
      ])
    });
  });

  // Mock GitHub Comments API
  await page.route('**/repos/chatelao/AI-Dashboard/issues/1/comments*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          user: { login: 'google-labs-jules[bot]' },
          body: 'Jules is on it. task_id: 1'
        }
      ])
    });
  });

  // Mock Jules API for Session 1
  await page.route('**/v1alpha/sessions/1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'IN_PROGRESS'
      })
    });
  });

  await page.goto('/?test=true');

  const julesStatusBadge = page.locator('.badge.jules-status-in-progress');
  await expect(julesStatusBadge).toBeVisible();
  await expect(julesStatusBadge).toHaveText('InProgress');
});
