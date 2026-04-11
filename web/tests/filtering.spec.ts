import { test, expect } from '@playwright/test';

test.describe('Filtering and Pagination', () => {
  test('should filter by state (All vs Only Open)', async ({ page }) => {
    // Mock GitHub Issues API for both "all" and "open" requests
    await page.route('**/issues?state=all**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, number: 1, title: 'Open Issue', state: 'open', repository: { full_name: 'chatelao/AI-Dashboard' }, labels: [] },
          { id: 2, number: 2, title: 'Closed Issue', state: 'closed', repository: { full_name: 'chatelao/AI-Dashboard' }, labels: [] }
        ])
      });
    });

    await page.route('**/issues?state=open**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, number: 1, title: 'Open Issue', state: 'open', repository: { full_name: 'chatelao/AI-Dashboard' }, labels: [] }
        ])
      });
    });

    await page.goto('/');

    // Initially "all" is selected, should show 2 rows
    const rowsAll = page.locator('tbody tr');
    await expect(rowsAll).toHaveCount(2);

    // Change filter to "Only Open"
    await page.selectOption('#state-filter', 'open');

    // Should now show 1 row
    const rowsOpen = page.locator('tbody tr');
    await expect(rowsOpen).toHaveCount(1);
    await expect(rowsOpen).toContainText('Open Issue');
  });

  test('should limit results based on page size dropdown', async ({ page }) => {
    // Generate 25 issues
    const mockIssues = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      number: i + 1,
      title: `Issue ${i + 1}`,
      state: 'open',
      repository: { full_name: 'chatelao/AI-Dashboard' },
      labels: []
    }));

    await page.route('**/issues?state=all**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockIssues)
      });
    });

    await page.goto('/');

    // Default pageSize is 50, should show all 25 issues
    const rowsDefault = page.locator('tbody tr');
    await expect(rowsDefault).toHaveCount(25);

    // Change pageSize to 10
    await page.selectOption('#page-size', '10');

    // Should now show 10 rows
    const rows10 = page.locator('tbody tr');
    await expect(rows10).toHaveCount(10);

    // Change pageSize to 20
    await page.selectOption('#page-size', '20');

    // Should now show 20 rows
    const rows20 = page.locator('tbody tr');
    await expect(rows20).toHaveCount(20);
  });
});
