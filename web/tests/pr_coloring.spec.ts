import { test, expect } from '@playwright/test';

test.describe('PR File Coloring', () => {
  test('should color filenames according to change percentages', async ({ page }) => {
    // Set mock tokens
    await page.addInitScript(() => {
      window.localStorage.setItem('github_token', 'mock-gh-token');
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
            title: 'PR with colored files',
            state: 'open',
            html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101',
            body: 'Some PR',
            repository: { full_name: 'chatelao/AI-Dashboard' },
            assignee: null,
            labels: [],
            updated_at: new Date().toISOString(),
            pull_request: {
              url: 'https://api.github.com/repos/chatelao/AI-Dashboard/pulls/101',
              html_url: 'https://github.com/chatelao/AI-Dashboard/pull/101'
            }
          }
        ])
      });
    });

    // Mock PR Detail API
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/101', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          number: 101,
          mergeable: true,
          mergeable_state: 'clean',
          head: { sha: 'mock-sha' },
          additions: 100,
          deletions: 50
        })
      });
    });

    // Mock PR Files API
    await page.route('**/repos/chatelao/AI-Dashboard/pulls/101/files', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            filename: 'new_file.ts',
            status: 'added',
            additions: 100,
            deletions: 0,
            raw_url: 'https://github.com/raw/new_file.ts'
          },
          {
            filename: 'deleted_file.ts',
            status: 'removed',
            additions: 0,
            deletions: 50,
            raw_url: 'https://github.com/raw/deleted_file.ts'
          },
          {
            filename: 'modified_file.ts',
            status: 'modified',
            additions: 10,
            deletions: 10,
            raw_url: 'https://github.com/raw/modified_file.ts'
          }
        ])
      });
    });

    // Mock Raw File Content for modified file
    await page.route('https://github.com/raw/modified_file.ts', async (route) => {
      // 10 additions, 100 total lines (90 unchanged)
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'line\n'.repeat(100)
      });
    });

    // Mock Check Runs API
    await page.route('**/repos/chatelao/AI-Dashboard/commits/mock-sha/check-runs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total_count: 0, check_runs: [] })
      });
    });

    await page.goto('/?test=true');

    // Wait for the PR file count to appear
    const prFilesInfo = page.locator('.pr-files-info');
    await expect(prFilesInfo).toBeVisible();

    // Hover over the .ts extension to see the tooltip
    const tsExtension = page.locator('.tooltip', { hasText: '.ts' }).first();
    await tsExtension.hover();

    const tooltip = page.locator('.tooltip-text').last();
    await expect(tooltip).toBeVisible();

    // Check coloring for new_file.ts (100% added -> 100% green)
    const newFileRow = tooltip.locator('.tooltip-filename-row', { hasText: 'new_file.ts' });
    const greenPartNew = newFileRow.locator('.additions-text');
    await expect(greenPartNew).toHaveText('new_file.ts');

    // Check coloring for deleted_file.ts (100% removed -> 100% red)
    const deletedFileRow = tooltip.locator('.tooltip-filename-row', { hasText: 'deleted_file.ts' });
    const redPartDeleted = deletedFileRow.locator('.deletions-text');
    await expect(redPartDeleted).toHaveText('deleted_file.ts');

    // Check coloring for modified_file.ts
    // filename length is 16
    // additions: 10
    // deletions: 10
    // total lines: 100
    // unchanged = 100 - 10 = 90
    // relevantTotal = 10 + 10 + 90 = 110
    // additions ratio: 10/110 * 16 = 1.45 -> 1 char
    // deletions ratio: 10/110 * 16 = 1.45 -> 1 char
    // unchanged ratio: 90/110 * 16 = 13.09 -> 13 chars
    // total = 1 + 1 + 13 = 15. Adjustment will add 1 to largest weight (unchanged). -> 14 chars grey.
    const modifiedFileRow = tooltip.locator('.tooltip-filename-row', { hasText: 'modified_file.ts' });
    const greenPartMod = modifiedFileRow.locator('.additions-text');
    const redPartMod = modifiedFileRow.locator('.deletions-text');
    const greyPartMod = modifiedFileRow.locator('.text-muted');

    await expect(greenPartMod).toHaveText(/^m/); // At least first letter green
    await expect(redPartMod).toBeVisible();
    await expect(greyPartMod).toBeVisible();
  });
});
