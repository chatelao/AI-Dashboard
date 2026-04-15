import { test, expect } from '@playwright/test';

test('displays Authorize button on 403 with X-GitHub-SSO header', async ({ page }) => {
  // Set mock tokens and repo history
  await page.addInitScript(() => {
    window.localStorage.setItem('github_token', 'mock-gh-token');
    window.localStorage.setItem('gh_repos', JSON.stringify(['org/private-repo']));
    (window as any).isTest = true;
  });

  // Mock GitHub Issues API to return 403 with SSO header
  const ssoUrl = 'https://github.com/orgs/org/sso?authorization_request=...';
  await page.route('**/repos/org/private-repo/issues?state=all*', async (route) => {
    await route.fulfill({
      status: 403,
      headers: {
        'X-GitHub-SSO': `required; url=${ssoUrl}`,
        'Access-Control-Expose-Headers': 'X-GitHub-SSO'
      },
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Resource protected by SAML single sign-on',
        documentation_url: 'https://docs.github.com/articles/authenticating-to-a-github-organization-with-saml-single-sign-on'
      })
    });
  });

  await page.goto('/');

  // Verify the error banner is visible
  const errorBanner = page.locator('.repo-error-banner');
  await expect(errorBanner).toBeVisible();

  // Verify the error message for the repo
  await expect(errorBanner).toContainText('org/private-repo: Access forbidden');

  // Verify the Authorize button is present and has the correct URL
  const authButton = errorBanner.locator('a.btn-authorize');
  await expect(authButton).toBeVisible();
  await expect(authButton).toHaveAttribute('href', ssoUrl);
  await expect(authButton).toHaveAttribute('target', '_blank');
});
