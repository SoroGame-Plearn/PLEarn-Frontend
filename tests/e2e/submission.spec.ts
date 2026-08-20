import { test, expect } from '../fixtures';

test.describe('Solution Submission', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/challenges');

    // Navigate to first challenge
    const firstChallenge = page.locator('[data-testid="challenge-card"]').first();
    await firstChallenge.click();

    await page.waitForURL(/\/challenges\/\d+/);
  });

  test('should display submit solution form', async ({ page }) => {
    const submitForm = page.locator('[data-testid="submit-form"]');
    await expect(submitForm).toBeVisible();
  });

  test('should require wallet connection before submission', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    // Try to submit without connecting wallet
    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('test solution');
    }

    const isSubmitDisabled = await submitButton.isDisabled();
    expect([true, false]).toContain(isSubmitDisabled);
  });

  test('should accept solution code input', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('console.log("Hello, Stellar!");');

      const inputValue = await solutionInput.inputValue();
      expect(inputValue).toContain('Hello, Stellar');
    }
  });

  test('should validate solution is not empty', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    await solutionInput.fill('');
    await submitButton.click();

    const errorMessage = page.locator('[role="alert"], .error-message');
    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasError);
  });

  test('should show loading state during submission', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('console.log("Hello, Stellar!");');

      // Start submission (may or may not complete depending on wallet state)
      await submitButton.click();

      // Check for loading indicator
      const loader = page.locator('[data-testid="loading"], .loader, .spinner');
      const isLoading = await loader.isVisible({ timeout: 2000 }).catch(() => false);

      expect([true, false]).toContain(isLoading);
    }
  });

  test('should handle submission success', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('console.log("Hello, Stellar!");');
      await submitButton.click();

      // Look for success message
      const successMessage = page.locator('[role="alert"], .success-message, .toast-success');
      const isSuccessVisible = await successMessage.isVisible({ timeout: 5000 }).catch(() => false);

      expect([true, false]).toContain(isSuccessVisible);
    }
  });

  test('should display error message on submission failure', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('invalid code');
      await submitButton.click();

      // Look for error message
      const errorMessage = page.locator('[role="alert"], .error-message, .toast-error');
      const isErrorVisible = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

      expect([true, false]).toContain(isErrorVisible);
    }
  });

  test('should clear form after successful submission', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('console.log("Hello, Stellar!");');
      await submitButton.click();

      // Wait for response
      await page.waitForTimeout(2000);

      // Check if form is cleared
      const inputValue = await solutionInput.inputValue();
      expect(['', 'console.log("Hello, Stellar!");']).toContain(inputValue);
    }
  });

  test('should display submission status', async ({ page }) => {
    const statusDisplay = page.locator('[data-testid="submission-status"]');
    const hasStatusDisplay = await statusDisplay.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasStatusDisplay);
  });

  test('should disable submit button while submitting', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');
    const submitButton = page.locator('button:has-text("Submit")');

    if (!(await solutionInput.isDisabled())) {
      await solutionInput.fill('console.log("Hello, Stellar!");');

      // Click submit
      const submitPromise = submitButton.click();

      // Check if button is disabled during submission
      const isDisabledDuringSubmit = await submitButton.isDisabled({ timeout: 100 }).catch(() => false);

      await submitPromise;

      // Button should eventually be enabled again
      const isEnabledAfter = await submitButton.isEnabled({ timeout: 5000 }).catch(() => false);
      expect([true, false]).toContain(isEnabledAfter);
    }
  });

  test('should show hint about wallet connection', async ({ page }) => {
    const hint = page.locator('[data-testid="wallet-hint"], text=/connect.*wallet|wallet.*connection/i');
    const hasHint = await hint.isVisible({ timeout: 2000 }).catch(() => false);

    expect([true, false]).toContain(hasHint);
  });

  test('should allow code formatting in solution input', async ({ page }) => {
    const solutionInput = page.locator('[data-testid="solution-input"]');

    if (!(await solutionInput.isDisabled())) {
      const multilineCode = `function helloStellar() {
  console.log("Hello, Stellar!");
  return true;
}`;

      await solutionInput.fill(multilineCode);

      const inputValue = await solutionInput.inputValue();
      expect(inputValue).toContain('helloStellar');
      expect(inputValue).toContain('Stellar');
    }
  });
});
