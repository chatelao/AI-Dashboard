import { test, expect } from '@playwright/test';

test.describe('SAML SSO Troubleshooting', () => {
  test('should show Authorize button when 403 occurs even without X-GitHub-SSO header (FIXED)', async ({ page }) => {
    // Mock GitHub Issues API to return 403
    await page.route('**/repos/chatelao/private-repo/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Forbidden' }),
        headers: {}
      });
    });

    // Set repo history to include the failing repo
    await page.addInitScript(() => {
        window.localStorage.setItem('gh_repos', JSON.stringify(['chatelao/private-repo']));
        window.localStorage.setItem('github_token', 'mock-token');
    });

    await page.goto('/?test=true');

    const errorItem = page.locator('.repo-error-item').filter({ hasText: 'chatelao/private-repo' });
    await expect(errorItem).toBeVisible();
    // THE FIX: Authorize button should now be visible even if X-GitHub-SSO header was missing
    await expect(errorItem.locator('.btn-authorize')).toBeVisible();
    await expect(errorItem.locator('.btn-authorize')).toHaveAttribute('href', 'https://github.com/settings/tokens');
  });

  test('should show Authorize button when 403 occurs with X-GitHub-SSO header', async ({ page }) => {
    await page.route('**/repos/chatelao/sso-repo/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'SAML SSO required' }),
        headers: {
            'X-GitHub-SSO': 'url=https://github.com/orgs/chatelao/sso?authorization_request=abc',
            'Access-Control-Expose-Headers': 'X-GitHub-SSO'
        }
      });
    });

    await page.addInitScript(() => {
        window.localStorage.setItem('gh_repos', JSON.stringify(['chatelao/sso-repo']));
        window.localStorage.setItem('github_token', 'mock-token');
    });

    await page.goto('/?test=true');

    const errorItem = page.locator('.repo-error-item').filter({ hasText: 'chatelao/sso-repo' });
    await expect(errorItem).toBeVisible();
    await expect(errorItem.locator('.btn-authorize')).toBeVisible();
    await expect(errorItem.locator('.btn-authorize')).toHaveAttribute('href', 'https://github.com/orgs/chatelao/sso?authorization_request=abc');
  });

  test('should have SAML SSO link in settings (FIXED)', async ({ page }) => {
    await page.goto('/?test=true');
    await page.click('.settings-toggle');
    await expect(page.locator('.settings-panel')).toBeVisible();
    // Now there should be a mention of SSO in settings
    await expect(page.locator('.settings-panel')).toContainText('Configure SAML SSO');
    const ssoLink = page.locator('.settings-panel a', { hasText: 'Configure SAML SSO' });
    await expect(ssoLink).toBeVisible();
    await expect(ssoLink).toHaveAttribute('href', 'https://github.com/settings/tokens');
  });
});
