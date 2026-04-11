import { test, expect } from '@playwright/test';

test.describe('AI Development Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock GitHub Issues API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Test Issue 1',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
            assignee: { login: 'Jules' }
          },
          {
            id: 2,
            number: 102,
            title: 'Test Issue 2',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/102',
            assignee: { login: 'other-user' }
          }
        ])
      });
    });

    // Mock GitHub Pulls API
    await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Mock Jules API
    await page.route('https://jules.googleapis.com/v1/tasks/1/status', async route => {
      const auth = route.request().headers()['authorization'];
      if (auth === 'Bearer valid-token') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'Coding' })
        });
      } else {
        await route.fulfill({ status: 401 });
      }
    });

    await page.goto('/');
  });

  test('should display login form when not authenticated', async ({ page }) => {
    await expect(page.locator('input[placeholder="Enter Jules API Token"]')).toBeVisible();
    await expect(page.locator('button:has-text("Login")')).toBeVisible();
  });

  test('should show Jules status after login', async ({ page }) => {
    await page.fill('input[placeholder="Enter Jules API Token"]', 'valid-token');
    await page.click('button:has-text("Login")');

    await expect(page.locator('text=Authenticated with Jules')).toBeVisible();
    await expect(page.locator('text=Coding')).toBeVisible();
  });

  test('should clear token and show login on logout', async ({ page }) => {
    await page.fill('input[placeholder="Enter Jules API Token"]', 'valid-token');
    await page.click('button:has-text("Login")');
    await expect(page.locator('text=Authenticated with Jules')).toBeVisible();

    await page.click('button:has-text("Logout")');
    await expect(page.locator('input[placeholder="Enter Jules API Token"]')).toBeVisible();
  });
});
