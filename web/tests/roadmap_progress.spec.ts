import { test, expect } from '@playwright/test';

test('Roadmap Progress Circles', async ({ page }) => {
  const repo = 'chatelao/AI-Dashboard';

  // Mock issues
  await page.route(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=1`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 101,
          title: 'Issue 1',
          state: 'open',
          html_url: `https://github.com/${repo}/issues/101`,
          repository: { full_name: repo },
          labels: [],
          updated_at: new Date().toISOString(),
        }
      ]),
    });
  });

  // Mock repo details
  await page.route(`https://api.github.com/repos/${repo}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ default_branch: 'main' }),
    });
  });

  // Mock git tree
  await page.route(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tree: [
          { path: 'ROADMAP.md', type: 'blob' }
        ]
      }),
    });
  });

  // Mock ROADMAP.md content
  await page.route(`https://api.github.com/repos/${repo}/contents/ROADMAP.md?ref=main`, async route => {
    const content = btoa("- [x] Task 1\n- [ ] Task 2\n- [x] Task 3");
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content }),
    });
  });

  // Mock pulls
  await page.route(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100`, async route => {
    await route.fulfill({ status: 200, body: '[]' });
  });

  await page.goto('http://localhost:5173/AI-Dashboard/?test=true');

  // Switch to Projects view
  const projectsButton = page.getByRole('button', { name: 'Projects' });
  await projectsButton.click();

  // Verify roadmap circles are present
  const roadmapContainer = page.locator('.project-roadmap');
  await expect(roadmapContainer).toBeVisible();

  const circles = roadmapContainer.locator('.roadmap-circle');
  await expect(circles).toHaveCount(3);

  // Check completed status
  await expect(circles.nth(0)).toHaveClass(/completed/);
  await expect(circles.nth(1)).not.toHaveClass(/completed/);
  await expect(circles.nth(2)).toHaveClass(/completed/);

  // Check tooltips
  const roadmapTooltips = roadmapContainer.locator('.tooltip');
  await expect(roadmapTooltips.nth(0).locator('.tooltip-text')).toHaveText('Task 1', { ArrayAttribute: 'hidden' });
  await expect(roadmapTooltips.nth(1).locator('.tooltip-text')).toHaveText('Task 2', { ArrayAttribute: 'hidden' });
  await expect(roadmapTooltips.nth(2).locator('.tooltip-text')).toHaveText('Task 3', { ArrayAttribute: 'hidden' });

  // Take a screenshot
  await page.screenshot({ path: 'roadmap-progress.png' });
});
