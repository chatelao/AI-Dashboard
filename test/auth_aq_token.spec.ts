import { test, expect } from '@playwright/test';

test('uses X-Goog-Api-Key for AQ. tokens', async ({ page }) => {
  const aqToken = 'AQ.mock-jules-token';

  await page.addInitScript(({ token }) => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('jules_token', token);
    window.localStorage.setItem('gh_repos', JSON.stringify(['owner/repo']));
    (window as any).isTest = true;
  }, { token: aqToken });

  // Mock GitHub issues
  await page.route('**/repos/owner/repo/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Jules Issue',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/1',
          updated_at: '2023-10-01T12:00:00Z',
          repository: { full_name: 'owner/repo' },
          assignee: { login: 'jules' },
          labels: []
        }
      ])
    });
  });

  // Mock GitHub pulls
  await page.route('**/repos/owner/repo/pulls?state=all*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Mock GitHub comments to return a session ID
  await page.route('**/repos/owner/repo/issues/1/comments?per_page=100', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          user: { login: 'google-labs-jules[bot]' },
          body: 'Jules is on it! Task ID: 8999703094344754233'
        }
      ])
    });
  });

  // Intercept and verify Jules API call
  let capturedHeaders: Record<string, string> = {};
  await page.route('**/v1alpha/session/8999703094344754233', async (route) => {
    capturedHeaders = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state: 'STATE_COMPLETED' })
    });
  });

  await page.goto('/');

  // Wait for the Jules status to be updated on the page
  await expect(page.locator('text=completed')).toBeVisible({ timeout: 15000 });

  // Verify headers
  expect(capturedHeaders['x-goog-api-key']).toBe(aqToken);
  expect(capturedHeaders['authorization']).toBeUndefined();
  expect(capturedHeaders['x-authorization']).toBeUndefined();
});

test('uses Authorization for other tokens (e.g. ya29.)', async ({ page }) => {
  const oauthToken = 'ya29.mock-oauth-token';

  await page.addInitScript(({ token }) => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('jules_token', token);
    window.localStorage.setItem('gh_repos', JSON.stringify(['owner/repo']));
    (window as any).isTest = true;
  }, { token: oauthToken });

  // Mock GitHub issues
  await page.route('**/repos/owner/repo/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Jules Issue',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/1',
          updated_at: '2023-10-01T12:00:00Z',
          repository: { full_name: 'owner/repo' },
          assignee: { login: 'jules' },
          labels: []
        }
      ])
    });
  });

  // Mock GitHub pulls
  await page.route('**/repos/owner/repo/pulls?state=all*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Mock GitHub comments to return a session ID
  await page.route('**/repos/owner/repo/issues/1/comments?per_page=100', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          user: { login: 'google-labs-jules[bot]' },
          body: 'Jules is on it! Task ID: 8999703094344754233'
        }
      ])
    });
  });

  // Intercept and verify Jules API call
  let capturedHeaders: Record<string, string> = {};
  await page.route('**/v1alpha/session/8999703094344754233', async (route) => {
    capturedHeaders = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state: 'STATE_COMPLETED' })
    });
  });

  await page.goto('/');

  // Wait for the Jules status to be updated on the page
  await expect(page.locator('text=completed')).toBeVisible({ timeout: 15000 });

  // Verify headers
  expect(capturedHeaders['authorization']).toBe(`Bearer ${oauthToken}`);
  expect(capturedHeaders['x-authorization']).toBe(`Bearer ${oauthToken}`);
  expect(capturedHeaders['x-goog-api-key']).toBeUndefined();
});
