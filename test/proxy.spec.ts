import { test, expect } from '@playwright/test';

test('can configure proxy authentication in settings', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).isTest = true;
  });

  // Mock GitHub Issues API
  await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'Jules issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: { login: 'Jules' },
          labels: []
        }
      ])
    });
  });

  // Mock Jules API and check for X-Proxy-Auth header
  let capturedProxyAuth = '';
  await page.route('**/v1/tasks/101/status', async (route) => {
    capturedProxyAuth = await route.request().headerValue('X-Proxy-Auth') || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'Coding' })
    });
  });

  await page.goto('/');

  // Open settings
  await page.click('button[aria-label="Settings"]');

  // Fill in Jules token and Proxy Authentication
  await page.fill('#jules-token', 'mock-jules-token');
  await page.fill('#proxy-auth', 'my-secret-proxy-key');

  // Save settings
  await page.click('button.btn-save');

  // Wait for Jules status to be fetched
  await expect(page.locator('text=Coding')).toBeVisible();

  // Verify the X-Proxy-Auth header was sent
  expect(capturedProxyAuth).toBe('my-secret-proxy-key');
});
