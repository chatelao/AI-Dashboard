import { test, expect } from '@playwright/test';

test.describe('Tooltip Visibility', () => {
  test('should keep tooltip within viewport on small screens', async ({ page }) => {
    // Set a small viewport size
    await page.setViewportSize({ width: 400, height: 600 });

    // Mock GitHub Issues API
    await page.route('**/repos/chatelao/AI-Dashboard/issues?state=all*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            number: 101,
            title: 'Test Issue',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/issues/101',
            body: 'Very long body text that should show up in the tooltip. '.repeat(10),
            assignee: null,
            labels: [],
            repository: { full_name: 'chatelao/AI-Dashboard' },
            pull_request: { url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/101', html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101' }
          }
        ])
      });
    });

    await page.route('**/repos/chatelao/AI-Dashboard/pulls/101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ number: 101, head: { sha: 'sha101' } })
      });
    });

    await page.route('**/repos/chatelao/AI-Dashboard/commits/sha101/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total_count: 0, check_runs: [] })
      });
    });

    await page.goto('/?test=true');

    // Find the PR number tooltip
    const tooltipContainer = page.locator('.pr-number').first().locator('xpath=..');
    await tooltipContainer.hover();

    const tooltipText = page.locator('.tooltip-text').first();
    await expect(tooltipText).toBeVisible();

    const box = await tooltipText.boundingBox();
    if (box) {
      // Check if tooltip is cut off on the left
      expect(box.x).toBeGreaterThanOrEqual(0);

      // Check if it's within viewport width
      const viewport = page.viewportSize();
      if (viewport) {
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    }
  });
});
