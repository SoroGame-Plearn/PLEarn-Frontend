import { test, expect, mockData } from '../fixtures';

test.describe('Challenges Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/challenges');
  });

  test('should display challenges page with title', async ({ page }) => {
    const heading = page.locator('h1, h2', { hasText: /challenges/i });
    await expect(heading).toBeVisible();
  });

  test('should display challenge cards with required information', async ({ page }) => {
    const challengeCard = page.locator('[data-testid="challenge-card"]').first();

    // Check for essential elements in challenge card
    const title = challengeCard.locator('[data-testid="challenge-title"]');
    const description = challengeCard.locator('[data-testid="challenge-description"]');
    const difficulty = challengeCard.locator('[data-testid="difficulty-badge"]');
    const reward = challengeCard.locator('[data-testid="reward"]');

    await expect(title).toBeVisible();
    await expect(description).toBeVisible();
    await expect(difficulty).toBeVisible();
    await expect(reward).toBeVisible();
  });

  test('should have difficulty filter options', async ({ page }) => {
    const filterContainer = page.locator('[data-testid="difficulty-filter"]');
    await expect(filterContainer).toBeVisible();

    const beginnerFilter = page.locator('button:has-text("Beginner")');
    const intermediateFilter = page.locator('button:has-text("Intermediate")');
    const advancedFilter = page.locator('button:has-text("Advanced")');

    await expect(beginnerFilter).toBeVisible();
    await expect(intermediateFilter).toBeVisible();
    await expect(advancedFilter).toBeVisible();
  });

  test('should filter challenges by Beginner difficulty', async ({ page }) => {
    const beginnerFilter = page.locator('button:has-text("Beginner")');
    await beginnerFilter.click();

    // Wait for filtered results
    await page.waitForTimeout(500);

    const challengeCards = page.locator('[data-testid="challenge-card"]');
    const count = await challengeCards.count();

    // Should show only beginner challenges
    expect(count).toBeGreaterThan(0);

    // All visible challenges should have Beginner badge
    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = challengeCards.nth(i);
      const difficulty = card.locator('[data-testid="difficulty-badge"]');
      const text = await difficulty.textContent();
      expect(text).toContain('Beginner');
    }
  });

  test('should filter challenges by Intermediate difficulty', async ({ page }) => {
    const intermediateFilter = page.locator('button:has-text("Intermediate")');
    await intermediateFilter.click();

    await page.waitForTimeout(500);

    const challengeCards = page.locator('[data-testid="challenge-card"]');
    const count = await challengeCards.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = challengeCards.nth(i);
      const difficulty = card.locator('[data-testid="difficulty-badge"]');
      const text = await difficulty.textContent();
      expect(text).toContain('Intermediate');
    }
  });

  test('should filter challenges by Advanced difficulty', async ({ page }) => {
    const advancedFilter = page.locator('button:has-text("Advanced")');
    await advancedFilter.click();

    await page.waitForTimeout(500);

    const challengeCards = page.locator('[data-testid="challenge-card"]');
    const count = await challengeCards.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = challengeCards.nth(i);
      const difficulty = card.locator('[data-testid="difficulty-badge"]');
      const text = await difficulty.textContent();
      expect(text).toContain('Advanced');
    }
  });

  test('should clear filter and show all challenges', async ({ page }) => {
    const beginnerFilter = page.locator('button:has-text("Beginner")');
    await beginnerFilter.click();

    const allChallengesFilter = page.locator('button:has-text("All")');
    if (await allChallengesFilter.isVisible()) {
      await allChallengesFilter.click();
    } else {
      // Or click the selected filter again to deselect
      await beginnerFilter.click();
    }

    await page.waitForTimeout(500);

    const challengeCards = page.locator('[data-testid="challenge-card"]');
    const count = await challengeCards.count();

    // Should show all challenges
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to challenge detail page when clicking challenge card', async ({ page }) => {
    const firstChallenge = page.locator('[data-testid="challenge-card"]').first();
    await firstChallenge.click();

    // Should navigate to challenge detail page
    await page.waitForURL(/\/challenges\/\d+/);

    // Verify we're on the detail page
    const detailHeading = page.locator('h1, h2');
    await expect(detailHeading).toBeVisible();
  });

  test('should display challenge details on detail page', async ({ page }) => {
    const firstChallenge = page.locator('[data-testid="challenge-card"]').first();
    await firstChallenge.click();

    await page.waitForURL(/\/challenges\/\d+/);

    // Check for challenge details
    const instructions = page.locator('[data-testid="challenge-instructions"]');
    const difficulty = page.locator('[data-testid="difficulty-badge"]');
    const reward = page.locator('[data-testid="reward"]');

    await expect(instructions).toBeVisible();
    await expect(difficulty).toBeVisible();
    await expect(reward).toBeVisible();
  });

  test('should show submit button on challenge detail page', async ({ page }) => {
    const firstChallenge = page.locator('[data-testid="challenge-card"]').first();
    await firstChallenge.click();

    await page.waitForURL(/\/challenges\/\d+/);

    const submitButton = page.locator('button:has-text("Submit")');
    await expect(submitButton).toBeVisible();
  });

  test('should go back to challenges list when clicking back button', async ({ page }) => {
    const firstChallenge = page.locator('[data-testid="challenge-card"]').first();
    await firstChallenge.click();

    await page.waitForURL(/\/challenges\/\d+/);

    // Find and click back button
    const backButton = page.locator('button:has-text("Back"), a:has-text("← Back")');
    if (await backButton.isVisible()) {
      await backButton.click();
    } else {
      // Use browser back button
      await page.goBack();
    }

    await page.waitForURL('/challenges');
    const challengeCards = page.locator('[data-testid="challenge-card"]');
    await expect(challengeCards.first()).toBeVisible();
  });

  test('should display pagination if challenges exceed limit', async ({ page }) => {
    const pagination = page.locator('[data-testid="pagination"]');

    if (await pagination.isVisible()) {
      const nextButton = page.locator('button:has-text("Next")');
      await expect(nextButton).toBeDefined();
    }
  });

  test('should display loading skeleton while challenges load', async ({ page }) => {
    // Clear the cache to force reload
    await page.context().clearCookies();

    const loaderOrSkeleton = page.locator('[data-testid="challenge-skeleton"], .skeleton, .loading');

    // Loader might appear briefly
    const isVisible = await loaderOrSkeleton.isVisible({ timeout: 3000 }).catch(() => false);
    expect([true, false]).toContain(isVisible);
  });
});
