# End-to-End Testing with Playwright

This guide covers how to run and write E2E tests for the Plearn Frontend using Playwright.

## Table of Contents

- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Best Practices](#best-practices)
- [Debugging](#debugging)
- [CI/CD Integration](#cicd-integration)

---

## Setup

### Prerequisites

- Node.js 18+
- Plearn Frontend dev server running or accessible

### Installation

Playwright is already included in `devDependencies`. If not installed, run:

```bash
npm install --save-dev @playwright/test
```

### Configuration

The main configuration file is `playwright.config.ts`. Key settings:

- **Base URL:** `http://localhost:3000` (configurable via `PLAYWRIGHT_TEST_BASE_URL`)
- **Test Directory:** `tests/e2e/`
- **Reporter:** HTML (output in `playwright-report/`)
- **Browsers:** Chromium, Firefox, WebKit
- **Mobile Devices:** Pixel 5, iPhone 12

---

## Running Tests

### Start the dev server (in one terminal)

```bash
npm run dev
```

### Run all E2E tests (in another terminal)

```bash
npm run test:e2e
```

### Run tests in UI mode (interactive browser)

```bash
npm run test:e2e:ui
```

Best for developing and debugging tests. Opens a browser where you can:
- See test execution in real-time
- Step through tests
- Inspect DOM
- Replay failed tests

### Run tests in headed mode (browser visible)

```bash
npm run test:e2e:headed
```

Useful to watch tests run without the interactive UI.

### Run tests in debug mode

```bash
npm run test:e2e:debug
```

Opens Playwright Inspector to step through test code.

### Run specific test file

```bash
npx playwright test tests/e2e/challenges.spec.ts
```

### Run tests matching a pattern

```bash
npx playwright test --grep "filter challenges"
```

### Run tests for specific browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Run mobile tests only

```bash
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

### View HTML report

After tests complete:

```bash
npx playwright show-report
```

Opens the detailed HTML report with screenshots and videos.

---

## Test Structure

Tests are organized by user flow:

```
tests/
├── e2e/
│   ├── auth.spec.ts           # Wallet connection flows
│   ├── challenges.spec.ts      # Challenge browsing & filtering
│   ├── submission.spec.ts      # Solution submission
│   ├── dashboard.spec.ts       # User progress dashboard
│   └── leaderboard.spec.ts     # Leaderboard & rankings
├── fixtures.ts                 # Test utilities & mock data
└── playwright.config.ts        # Configuration
```

### Test File Anatomy

```typescript
import { test, expect } from '../fixtures';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/path');
  });

  test('should perform action and verify result', async ({ page }) => {
    // Arrange
    const element = page.locator('[data-testid="element"]');

    // Act
    await element.click();

    // Assert
    await expect(element).toHaveAttribute('data-state', 'active');
  });
});
```

---

## Writing Tests

### Basic Test Template

```typescript
import { test, expect } from '../fixtures';

test('user can complete action', async ({ page }) => {
  // Navigate to page
  await page.goto('/features');

  // Interact with element
  const button = page.locator('button:has-text("Submit")');
  await button.click();

  // Verify result
  await expect(page).toHaveURL('/success');
});
```

### Finding Elements

Use `data-testid` attributes (preferred):

```typescript
const element = page.locator('[data-testid="element-id"]');
```

Alternative selectors:

```typescript
// By text
page.locator('button:has-text("Click me")');

// By role
page.locator('button[role="submit"]');

// By CSS class
page.locator('.button-class');

// Chaining
page.locator('[data-testid="card"]').locator('[data-testid="title"]');
```

### Common Actions

```typescript
// Click
await element.click();

// Type text
await input.fill('user input');

// Select option
await select.selectOption('option-value');

// Check checkbox
await checkbox.check();

// Hover
await element.hover();

// Press key
await page.press('Escape');

// Wait for navigation
await page.waitForURL('/expected-path');

// Wait for element
await page.waitForSelector('[data-testid="new-element"]');
```

### Assertions

```typescript
// Visibility
await expect(element).toBeVisible();
await expect(element).toBeHidden();

// State
await expect(element).toBeDisabled();
await expect(element).toBeEnabled();

// Text content
await expect(element).toHaveText('Expected text');
await expect(element).toContainText('Partial text');

// Attribute
await expect(element).toHaveAttribute('href', '/path');

// Value
await expect(input).toHaveValue('input value');

// Count
await expect(locator).toHaveCount(5);

// URL
await expect(page).toHaveURL('/path');
```

### Mock Data

Use fixtures in `tests/fixtures.ts`:

```typescript
import { test, expect, mockData } from '../fixtures';

test('displays mock challenges', async ({ page }) => {
  // Access mock data
  console.log(mockData.challenges);
  // => Array of mock challenge objects
});
```

### Timeouts

```typescript
// Global timeout in playwright.config.ts: 30 seconds

// Per test
test('slow test', async ({ page }, testInfo) => {
  testInfo.setTimeout(60000); // 60 seconds
});

// Per action
await element.click({ timeout: 5000 });
await page.waitForURL('/path', { timeout: 10000 });
```

---

## Best Practices

### ✅ Do

- **Use data-testid attributes** for reliable element selection
- **Organize tests by feature** (auth, challenges, etc.)
- **Test real user interactions** (clicks, typing, scrolling)
- **Keep tests independent** (no test should depend on another)
- **Use descriptive test names** that explain the scenario
- **Wait for elements properly** (avoid hard-coded waits)
- **Test critical flows** (core user journeys)
- **Handle async operations** correctly

```typescript
// Good: Waits for element before acting
const element = page.locator('[data-testid="result"]');
await expect(element).toBeVisible();
await element.click();

// Bad: Hard-coded wait
await page.waitForTimeout(2000);
```

### ❌ Don't

- **Don't use fragile selectors** (XPath with indexes)
- **Don't test implementation details** (test behavior, not code)
- **Don't have tests depend on each other** (each should be independent)
- **Don't ignore timeouts** (set appropriate waits)
- **Don't mock everything** (test real behavior when possible)

```typescript
// Bad: Fragile selector
page.locator('//*[@class="button"][3]');

// Good: Reliable selector
page.locator('[data-testid="submit-button"]');
```

### Performance

- Tests should complete in **under 5 minutes total**
- Each test suite (8-10 tests) should take **under 60 seconds**
- Use `test.skip()` for slow or flaky tests (mark with TODO)
- Run parallel tests when possible (default in `playwright.config.ts`)

---

## Debugging

### Debug a Single Test

```bash
npm run test:e2e:debug -- tests/e2e/challenges.spec.ts
```

### View Test Execution

```bash
npm run test:e2e:headed
```

Opens browser showing test execution step-by-step.

### Inspect Failure

After test failure:

```bash
npx playwright show-report
```

Report shows:
- Test name and status
- Screenshots (on failure)
- Video recordings (on failure)
- Full trace of test execution

### Print Debug Information

```typescript
test('debug example', async ({ page }) => {
  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());

  const element = page.locator('[data-testid="element"]');
  console.log('Element text:', await element.textContent());
  console.log('Is visible:', await element.isVisible());
});
```

### Add `page.pause()`

Pauses test execution and opens Inspector:

```typescript
test('inspect during test', async ({ page }) => {
  await page.goto('/challenges');

  await page.pause(); // Inspector opens, test pauses

  // Continue from Inspector console
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

A workflow file runs tests on every PR. Configuration:

- **Trigger:** Every pull request to `main`
- **Runs:** On a Linux runner
- **Browsers:** All (Chromium, Firefox, WebKit)
- **Artifacts:** HTML report, screenshots, videos
- **Timeout:** 30 minutes

### Local Pre-Commit Hook (Optional)

To run tests before committing:

```bash
# .git/hooks/pre-commit
#!/bin/bash
npm run test:e2e --maxWorkers=1
if [ $? -ne 0 ]; then
  echo "E2E tests failed. Commit aborted."
  exit 1
fi
```

### Against Staging Backend

Tests typically run against the dev server. To test against staging:

```bash
PLAYWRIGHT_TEST_BASE_URL=https://staging.plearn.dev npm run test:e2e
```

---

## Adding New Tests

### Checklist

- [ ] Identify the user flow to test
- [ ] Choose the appropriate `*.spec.ts` file
- [ ] Add `data-testid` attributes to components being tested
- [ ] Write test with clear description
- [ ] Use fixtures and mock data
- [ ] Run test locally: `npm run test:e2e`
- [ ] Debug any failures
- [ ] Verify HTML report
- [ ] Commit with test files

### Example: New Feature Test

1. Add `data-testid` to new UI component:

```typescript
<button data-testid="new-feature-button">New Feature</button>
```

2. Write test in appropriate `*.spec.ts`:

```typescript
test('should display new feature button', async ({ page }) => {
  await page.goto('/features');

  const button = page.locator('[data-testid="new-feature-button"]');
  await expect(button).toBeVisible();
  await button.click();

  // Verify result
});
```

3. Run and verify locally

---

## Flaky Tests

If a test fails intermittently:

1. **Identify the issue**
   - Check timeouts (increase if needed)
   - Verify element existence
   - Check for race conditions

2. **Add explicit waits**

```typescript
// Instead of assuming element exists
const element = page.locator('[data-testid="element"]');
await expect(element).toBeVisible(); // Waits up to 30s

// Then interact
await element.click();
```

3. **Mark as slow**

```typescript
test.slow('slow test', async ({ page }) => {
  // Test runs with 3x timeout
});
```

4. **Report and fix**

   - Open GitHub issue with flaky test details
   - Include reproduction steps
   - Add to project's "Known Flaky Tests" list

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests can't connect to dev server | Ensure `npm run dev` is running on port 3000 |
| Element not found errors | Check `data-testid` exists in component, increase timeout |
| "Timeout waiting for..." | Increase timeout or add explicit waits before action |
| Browser extension errors (e.g., Freighter) | Mock wallet connection or disable extension in test |
| Screenshot/video not captured | Ensure Playwright config has `screenshot` and `video` options |
| Tests pass locally but fail in CI | Check environment variables, backend URLs differ locally vs CI |

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Locators Guide](https://playwright.dev/docs/locators)
- [Assertions Reference](https://playwright.dev/docs/test-assertions)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)

---

## Support

For test-related questions or issues:

1. Check existing E2E tests for examples
2. Review Playwright docs
3. Run `npm run test:e2e:debug` to inspect
4. Open a GitHub issue with reproduction steps
