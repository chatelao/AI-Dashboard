import { test, expect } from '@playwright/test';

test('Roadmap Emoji Progress Circles', async ({ page }) => {
  const repo = 'chatelao/alpheusafpparser';

  // Set repo history in localStorage before navigation
  await page.addInitScript((repoName) => {
    window.localStorage.setItem('gh_repos', JSON.stringify([repoName]));
    window.localStorage.setItem('view_mode', 'projects');
  }, repo);

  // Mock issues
  await page.route(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=1`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          number: 1,
          title: 'Issue 1',
          state: 'open',
          html_url: `https://github.com/${repo}/issues/1`,
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
      body: JSON.stringify({ default_branch: 'master' }),
    });
  });

  // Mock git tree
  await page.route(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`, async route => {
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

  // Mock ROADMAP.md content with emojis
  await page.route(`https://api.github.com/repos/${repo}/contents/ROADMAP.md?ref=master`, async route => {
    const content = Buffer.from("- ✅ Task 1\n  - 🚧 Subtask 1.1\n  - ✅ Subtask 1.2\n- ⏳ Task 2").toString('base64');
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

  // Verify roadmap circles are present
  const roadmapContainer = page.locator('.project-roadmap');
  await expect(roadmapContainer).toBeVisible({ timeout: 10000 });

  const circles = roadmapContainer.locator('.roadmap-circle');
  await expect(circles).toHaveCount(4);

  // Verify completion status
  await expect(circles.nth(0)).toHaveClass(/completed/); // Task 1
  await expect(circles.nth(1)).not.toHaveClass(/completed/); // Subtask 1.1
  await expect(circles.nth(2)).toHaveClass(/completed/); // Subtask 1.2
  await expect(circles.nth(3)).not.toHaveClass(/completed/); // Task 2

  // Check tooltips
  const roadmapTooltips = roadmapContainer.locator('.tooltip');
  await expect(roadmapTooltips.nth(0).locator('.tooltip-text')).toHaveText('Task: Task 1');
  await expect(roadmapTooltips.nth(1).locator('.tooltip-text')).toHaveText('Subtask: Subtask 1.1');
  await expect(roadmapTooltips.nth(2).locator('.tooltip-text')).toHaveText('Subtask: Subtask 1.2');
  await expect(roadmapTooltips.nth(3).locator('.tooltip-text')).toHaveText('Task: Task 2');
});
