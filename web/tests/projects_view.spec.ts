import { test, expect } from '@playwright/test';

test('Project View', async ({ page }) => {
  // Use a mock response for issues
  await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/issues?state=all&per_page=100&page=1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'Open Issue',
          state: 'open',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
          body: 'Some body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: null,
          labels: [],
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          number: 102,
          title: 'Closed Issue',
          state: 'closed',
          html_url: 'https://github.com/chatelao/AI-Dashboard/issues/102',
          body: 'Some body',
          repository: { full_name: 'chatelao/AI-Dashboard' },
          assignee: null,
          labels: [],
          updated_at: new Date().toISOString(),
        }
      ]),
    });
  });

  // Mock pulls to avoid errors
  await page.route('https://api.github.com/repos/chatelao/AI-Dashboard/pulls?state=all&per_page=100', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.goto('http://localhost:5173/AI-Dashboard/?test=true');

  // Switch to Projects view
  const projectsButton = page.getByRole('button', { name: 'Projects' });
  await projectsButton.click();

  // Verify project name is visible
  await expect(page.locator('.project-name')).toContainText('AI-Dashboard');

  // Verify squares are present
  const squares = page.locator('.status-square');
  await expect(squares).toHaveCount(2);

  // Check colors
  await expect(squares.first()).toHaveClass(/grey/);
  await expect(squares.nth(1)).toHaveClass(/purple/);

  // Take a screenshot
  await page.screenshot({ path: 'project-view.png' });
});
