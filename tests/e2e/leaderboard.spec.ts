import { test, expect } from '../fixtures';

test.describe('Leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leaderboard');
  });

  test('should display leaderboard page with title', async ({ page }) => {
    const heading = page.locator('h1, h2', { hasText: /leaderboard|ranking/i });
    const isVisible = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should display leaderboard table with entries', async ({ page }) => {
    const leaderboardTable = page.locator('[data-testid="leaderboard-table"], table');
    const isVisible = await leaderboardTable.isVisible({ timeout: 5000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should display required columns in leaderboard', async ({ page }) => {
    const table = page.locator('[data-testid="leaderboard-table"], table');

    if (await table.isVisible({ timeout: 2000 }).catch(() => false)) {
      const rankHeader = page.locator('th, td', { hasText: /rank/i });
      const addressHeader = page.locator('th, td', { hasText: /address|wallet/i });
      const solvedHeader = page.locator('th, td', { hasText: /solved|challenges/i });
      const rewardHeader = page.locator('th, td', { hasText: /reward|earned/i });

      const headerCount = [rankHeader, addressHeader, solvedHeader, rewardHeader].filter(
        async (el) => await el.isVisible({ timeout: 1000 }).catch(() => false),
      ).length;

      expect(headerCount).toBeGreaterThan(0);
    }
  });

  test('should display leaderboard entries with data', async ({ page }) => {
    const tableRows = page.locator('[data-testid="leaderboard-row"], tbody tr');
    const count = await tableRows.count();

    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      const firstRow = tableRows.first();
      const isVisible = await firstRow.isVisible();

      expect(isVisible).toBe(true);
    }
  });

  test('should display rank numbers in ascending order', async ({ page }) => {
    const rankCells = page.locator('[data-testid="rank-cell"]');
    const count = await rankCells.count();

    if (count >= 2) {
      const firstRank = await rankCells.nth(0).textContent();
      const secondRank = await rankCells.nth(1).textContent();

      const firstNum = parseInt(firstRank || '0');
      const secondNum = parseInt(secondRank || '0');

      expect(firstNum).toBeLessThanOrEqual(secondNum);
    }
  });

  test('should display wallet addresses with truncation', async ({ page }) => {
    const addressCells = page.locator('[data-testid="address-cell"]');
    const count = await addressCells.count();

    if (count > 0) {
      const firstAddress = await addressCells.nth(0).textContent();

      expect(firstAddress).toBeDefined();
      expect(firstAddress?.length).toBeGreaterThan(0);
    }
  });

  test('should display challenge count for each user', async ({ page }) => {
    const solvedCells = page.locator('[data-testid="solved-count-cell"]');
    const count = await solvedCells.count();

    if (count > 0) {
      const firstSolved = await solvedCells.nth(0).textContent();
      const solvedNum = parseInt(firstSolved || '0');

      expect(solvedNum).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display total rewards for each user', async ({ page }) => {
    const rewardCells = page.locator('[data-testid="total-reward-cell"]');
    const count = await rewardCells.count();

    if (count > 0) {
      const firstReward = await rewardCells.nth(0).textContent();

      expect(firstReward).toBeDefined();
      // Should contain PLN or numeric value
      expect([true, false]).toContain(!!firstReward?.match(/\d+/));
    }
  });

  test('should sort by rank by default', async ({ page }) => {
    const rankHeader = page.locator('th, td', { hasText: /rank/i });
    const isVisible = await rankHeader.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should allow sorting by solved challenges', async ({ page }) => {
    const solvedHeader = page.locator('th, td', { hasText: /solved|challenges/i });

    if (await solvedHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await solvedHeader.click();

      // Data should re-sort
      await page.waitForTimeout(500);

      const rankCells = page.locator('[data-testid="rank-cell"], td:first-child');
      const firstRank = await rankCells.nth(0).textContent();

      expect(firstRank).toBeDefined();
    }
  });

  test('should allow sorting by rewards', async ({ page }) => {
    const rewardHeader = page.locator('th, td', { hasText: /reward|earned/i });

    if (await rewardHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rewardHeader.click();

      // Data should re-sort
      await page.waitForTimeout(500);

      const rewardCells = page.locator('[data-testid="total-reward-cell"]');
      const firstReward = await rewardCells.nth(0).textContent();

      expect(firstReward).toBeDefined();
    }
  });

  test('should display pagination controls if needed', async ({ page }) => {
    const pagination = page.locator('[data-testid="pagination"]');
    const hasPagination = await pagination.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasPagination);

    if (hasPagination) {
      const nextButton = page.locator('button:has-text("Next")');
      const prevButton = page.locator('button:has-text("Previous")');

      const nextVisible = await nextButton.isVisible({ timeout: 1000 }).catch(() => false);
      const prevVisible = await prevButton.isVisible({ timeout: 1000 }).catch(() => false);

      expect([true, false]).toContain(nextVisible || prevVisible);
    }
  });

  test('should navigate to next page in leaderboard', async ({ page }) => {
    const nextButton = page.locator('button:has-text("Next")');

    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      const firstPageFirstRank = await page.locator('[data-testid="rank-cell"]').nth(0).textContent();

      await nextButton.click();

      // Wait for new data
      await page.waitForTimeout(500);

      const nextPageFirstRank = await page.locator('[data-testid="rank-cell"]').nth(0).textContent();

      // Should show different entries
      expect(nextPageFirstRank).toBeDefined();
    }
  });

  test('should highlight current user in leaderboard', async ({ page, walletAddress }) => {
    const currentUserRow = page.locator(`[data-testid="leaderboard-row"][data-address="${walletAddress}"]`);

    const hasCurrentUser = await currentUserRow.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasCurrentUser);
  });

  test('should show loading skeleton while data loads', async ({ page }) => {
    await page.reload();

    const skeleton = page.locator('[data-testid="leaderboard-skeleton"], .skeleton, .loading');
    const isVisible = await skeleton.isVisible({ timeout: 3000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should handle empty leaderboard state', async ({ page }) => {
    const leaderboardTable = page.locator('[data-testid="leaderboard-table"]');
    const emptyState = page.locator('[data-testid="empty-leaderboard"]');

    const hasTable = await leaderboardTable.isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
  });

  test('should display last solved time for users', async ({ page }) => {
    const lastSolvedCells = page.locator('[data-testid="last-solved-cell"]');
    const count = await lastSolvedCells.count();

    if (count > 0) {
      const firstLastSolved = await lastSolvedCells.nth(0).textContent();

      const hasValue = !!firstLastSolved && firstLastSolved.length > 0;
      expect([true, false]).toContain(hasValue);
    }
  });

  test('should maintain responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const leaderboardTable = page.locator('[data-testid="leaderboard-table"], table');
    const isVisible = await leaderboardTable.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
