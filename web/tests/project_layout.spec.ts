import { test, expect } from '@playwright/test';

test.describe('Project Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Inject localStorage values to skip initialization logic and set default repo
    await page.addInitScript(() => {
      window.localStorage.setItem('gh_repos', JSON.stringify(['chatelao/AI-Dashboard']));
      window.localStorage.setItem('gh_token', 'mock-token');
      window.localStorage.setItem('view_mode', 'projects');
    });

    // Mock GitHub Issues API
    await page.route('**/repos/chatelao/AI-Dashboard/issues?**', async route => {
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
            repository: { full_name: 'chatelao/AI-Dashboard' },
            updated_at: new Date().toISOString(),
            user: { login: 'user' },
            labels: [],
            pull_request: null
          }
        ]),
      });
    });

    // Mock pulls to avoid errors
    await page.route('**/repos/chatelao/AI-Dashboard/pulls?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock Jules API to avoid errors
    await page.route('**/sessions/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('http://localhost:5173/AI-Dashboard/?test=true');

    // Ensure we are in projects view
    const projectsButton = page.getByRole('button', { name: 'Projects' });
    await expect(projectsButton).toHaveClass(/active/);

    // Wait for content to load
    await expect(page.locator('.project-name').first()).toBeVisible({ timeout: 10000 });
  });

  test('should align project name and squares horizontally on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const projectName = page.locator('.project-name').first();
    const projectSquares = page.locator('.project-squares').first();

    const nameBox = await projectName.boundingBox();
    const squaresBox = await projectSquares.boundingBox();

    expect(nameBox).not.toBeNull();
    expect(squaresBox).not.toBeNull();

    if (nameBox && squaresBox) {
      // Check if they are on the same horizontal line (within some tolerance)
      const nameCenterY = nameBox.y + nameBox.height / 2;
      const squaresCenterY = squaresBox.y + squaresBox.height / 2;
      expect(Math.abs(nameCenterY - squaresCenterY)).toBeLessThan(15);

      // Check if project name is to the left of squares
      expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(squaresBox.x);
    }

    await page.screenshot({ path: 'project-layout-desktop.png' });
  });

  test('should stack project name and squares vertically on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const projectName = page.locator('.project-name').first();
    const projectSquares = page.locator('.project-squares').first();

    const nameBox = await projectName.boundingBox();
    const squaresBox = await projectSquares.boundingBox();

    expect(nameBox).not.toBeNull();
    expect(squaresBox).not.toBeNull();

    if (nameBox && squaresBox) {
      // Check if project name is above squares
      expect(nameBox.y + nameBox.height).toBeLessThanOrEqual(squaresBox.y + 5); // +5 for minor overlap or spacing

      // Check if they are roughly aligned horizontally (starting from same left side)
      expect(Math.abs(nameBox.x - squaresBox.x)).toBeLessThan(20);
    }

    await page.screenshot({ path: 'project-layout-mobile.png' });
  });
});
