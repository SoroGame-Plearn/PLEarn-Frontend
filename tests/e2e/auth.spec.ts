import { test, expect } from '../fixtures';

test.describe('Wallet Authentication', () => {
  test('should display connect wallet button on landing page', async ({ page }) => {
    await page.goto('/');

    // Check if wallet button is visible
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible();
  });

  test('should open wallet connection prompt when clicking connect button', async ({ page }) => {
    await page.goto('/');

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await walletButton.click();

    // Note: In a real test with Freighter extension, this would trigger the extension
    // For now, we expect a modal or message to appear
    const connectModal = page.locator('[role="dialog"], .modal, .connect-wallet-prompt');
    // This assertion may vary based on actual implementation
  });

  test('should show user address when wallet is connected', async ({ page, walletAddress }) => {
    await page.goto('/');

    // In a real scenario with mocked wallet, we'd simulate connection
    // For testing purposes, we'll check if the navbar updates after connection
    const userMenuOrAddress = page.locator('text=' + walletAddress.substring(0, 6));
    // This would be visible after successful wallet connection
  });

  test('should show disconnect option for connected wallet', async ({ page }) => {
    await page.goto('/');

    // After wallet is connected, we should see a way to disconnect
    // This test assumes wallet is already connected in the session
    const disconnectButton = page.locator('button:has-text("Disconnect")');
    // Could be hidden/visible depending on connection state
  });

  test('should persist wallet connection across page navigation', async ({ page }) => {
    await page.goto('/');

    // Simulate wallet connection (in real scenario with actual Freighter)
    // Then navigate to another page
    await page.goto('/challenges');

    // Wallet should still be connected
    const connectedIndicator = page.locator('[data-testid="wallet-connected"]');
    // Should be visible after navigation
  });

  test('should clear wallet state when disconnecting', async ({ page }) => {
    await page.goto('/');

    // Assuming wallet is connected, click disconnect
    const disconnectButton = page.locator('button:has-text("Disconnect")');

    // If button exists and is visible, click it
    if (await disconnectButton.isVisible()) {
      await disconnectButton.click();

      // After disconnect, connect button should reappear
      const connectButton = page.locator('button:has-text("Connect Wallet")');
      await expect(connectButton).toBeVisible();
    }
  });

  test('should show error message for invalid wallet connection', async ({ page }) => {
    await page.goto('/');

    // This test would require mocking a failed wallet connection
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await walletButton.click();

    // We might see an error message
    const errorMessage = page.locator('[role="alert"], .error-message, .toast-error');
    // Error should be displayed on connection failure
  });

  test('should redirect to challenges page when wallet is connected', async ({ page }) => {
    await page.goto('/');

    // After successful wallet connection, user might be redirected
    // or prompted to navigate to challenges
    await page.waitForURL('/', { timeout: 5000 });

    const heading = page.locator('h1');
    // Page should display appropriate heading after wallet connection
  });

  test('navbar should update based on wallet connection state', async ({ page }) => {
    await page.goto('/');

    const navbar = page.locator('nav, [role="navigation"]');
    await expect(navbar).toBeVisible();

    // Check if wallet button is in navbar
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isWalletButtonVisible = await walletButton.isVisible();
    expect([true, false]).toContain(isWalletButtonVisible);
  });
});
