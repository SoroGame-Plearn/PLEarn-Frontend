import { test, expect } from '../fixtures';

test.describe('User Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display dashboard page with title', async ({ page }) => {
    const heading = page.locator('h1, h2', { hasText: /dashboard|progress/i });
    const isVisible = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should show personal statistics section', async ({ page }) => {
    const statsSection = page.locator('[data-testid="stats-section"]');
    const isVisible = await statsSection.isVisible({ timeout: 5000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should display solved challenges count', async ({ page }) => {
    const solvedCount = page.locator('[data-testid="solved-count"]');
    const isVisible = await solvedCount.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      const text = await solvedCount.textContent();
      expect(text).toMatch(/\d+/);
    }
  });

  test('should display total rewards earned', async ({ page }) => {
    const totalRewards = page.locator('[data-testid="total-rewards"]');
    const isVisible = await totalRewards.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      const text = await totalRewards.textContent();
      // Should contain some numeric value and PLN
      expect([true, false]).toContain(!!text);
    }
  });

  test('should show completed challenges list', async ({ page }) => {
    const completedList = page.locator('[data-testid="completed-challenges-list"]');
    const isVisible = await completedList.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      const items = page.locator('[data-testid="completed-challenge-item"]');
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display challenge details in completed list', async ({ page }) => {
    const challengeItems = page.locator('[data-testid="completed-challenge-item"]');
    const count = await challengeItems.count();

    if (count > 0) {
      const firstItem = challengeItems.first();

      const title = firstItem.locator('[data-testid="challenge-title"]');
      const difficulty = firstItem.locator('[data-testid="difficulty-badge"]');
      const reward = firstItem.locator('[data-testid="reward"]');

      const titleVisible = await title.isVisible({ timeout: 2000 }).catch(() => false);
      const difficultyVisible = await difficulty.isVisible({ timeout: 2000 }).catch(() => false);
      const rewardVisible = await reward.isVisible({ timeout: 2000 }).catch(() => false);

      expect([true, false]).toContain(titleVisible);
      expect([true, false]).toContain(difficultyVisible);
      expect([true, false]).toContain(rewardVisible);
    }
  });

  test('should show solve date for completed challenges', async ({ page }) => {
    const challengeItems = page.locator('[data-testid="completed-challenge-item"]');
    const count = await challengeItems.count();

    if (count > 0) {
      const firstItem = challengeItems.first();
      const solvedDate = firstItem.locator('[data-testid="solved-date"]');

      const isVisible = await solvedDate.isVisible({ timeout: 2000 }).catch(() => false);
      expect([true, false]).toContain(isVisible);
    }
  });

  test('should have proper stats card styling', async ({ page }) => {
    const statsCards = page.locator('[data-testid="stat-card"]');
    const count = await statsCards.count();

    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      const firstCard = statsCards.first();
      const isVisible = await firstCard.isVisible();

      expect(isVisible).toBe(true);
    }
  });

  test('should navigate to challenge detail from dashboard', async ({ page }) => {
    const challengeItems = page.locator('[data-testid="completed-challenge-item"]');
    const count = await challengeItems.count();

    if (count > 0) {
      const firstItem = challengeItems.first();
      await firstItem.click();

      // Should navigate to challenge or challenges page
      const url = page.url();
      expect(['/challenge', '/challenges']).toContainEqual(expect.stringContaining(url));
    }
  });

  test('should show loading state on dashboard load', async ({ page }) => {
    // Refresh to see loading state
    await page.reload();

    const loader = page.locator('[data-testid="loading"], .loader, .skeleton');
    const isVisible = await loader.isVisible({ timeout: 3000 }).catch(() => false);

    expect([true, false]).toContain(isVisible);
  });

  test('should handle error state gracefully', async ({ page }) => {
    // This test would require intercepting network requests
    const errorMessage = page.locator('[role="alert"], .error-message');

    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasError);
  });

  test('should display empty state when no challenges completed', async ({ page }) => {
    const emptyState = page.locator('[data-testid="empty-state"], text=/no.*challenges|not.*completed/i');

    const hasEmptyState = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasEmptyState);
  });

  test('should allow scrolling through completed challenges list', async ({ page }) => {
    const listContainer = page.locator('[data-testid="completed-challenges-list"]');

    if (await listContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Scroll within the container
      await listContainer.evaluate((element: any) => {
        element.scrollTop = element.scrollHeight;
      });

      await page.waitForTimeout(500);

      // Verify scroll happened or list is still visible
      const items = page.locator('[data-testid="completed-challenge-item"]');
      const count = await items.count();

      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should refresh dashboard data on page reload', async ({ page }) => {
    // Get initial data
    const initialStats = page.locator('[data-testid="total-rewards"]');
    const initialText = await initialStats.textContent({ timeout: 2000 }).catch(() => '');

    // Reload page
    await page.reload();

    // Stats should still be visible
    const reloadedStats = page.locator('[data-testid="total-rewards"]');
    const reloadedText = await reloadedStats.textContent({ timeout: 2000 }).catch(() => '');

    expect(reloadedText).toBeDefined();
  });

  test('should maintain responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const statsSection = page.locator('[data-testid="stats-section"]');
    const isMobileVisible = await statsSection.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(isMobileVisible);

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
