# Retry Logic Documentation

## Overview

The retry logic implements exponential backoff with jitter to handle transient failures in API calls. It's designed to improve reliability for operations like solution submissions without causing cascading failures.

## Configuration

The retry system accepts the following configuration:

```typescript
interface RetryConfig {
  maxRetries?: number;        // Default: 3
  baseDelay?: number;         // Default: 1000ms
  maxDelay?: number;          // Default: 30000ms
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}
```

## Usage

```typescript
import { withRetry } from "@/lib/retry";

const { result, retryState } = await withRetry(
  async () => {
    return submitSolution(challengeId, address, signedXdr);
  },
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    onRetry: (attempt, delay, error) => {
      console.log(`Retry attempt ${attempt}, waiting ${delay}ms`);
    },
  }
);
```

## Exponential Backoff Strategy

The retry logic uses exponential backoff with jitter:

- **Attempt 1 failure**: Wait 1000ms ± 10% jitter
- **Attempt 2 failure**: Wait 2000ms ± 10% jitter
- **Attempt 3 failure**: Wait 4000ms ± 10% jitter
- **Maximum delay**: Capped at 30 seconds

The jitter (0-10% of calculated delay) prevents the "thundering herd" problem where multiple clients retry simultaneously.

## Retryable vs Non-Retryable Errors

### Errors that WILL be retried (Transient Failures)

- **Network Errors** (`NETWORK_ERROR`): Connection issues, timeouts
- **Server Errors** (5xx): 500, 502, 503, etc.
- **Rate Limiting** (429): Too many requests
- **Request Timeout** (408): Client timeout from server
- **Parse Errors** (`PARSE_ERROR`): Unreadable server response (may indicate temporary issue)

### Errors that WILL NOT be retried (Client/Validation Errors)

- **Bad Request** (400): Malformed request - retrying won't help
- **Unprocessable Entity** (422): Validation failure - retrying won't help
- **Unauthorized** (401): Authentication required - retrying won't help
- **Forbidden** (403): Permission denied - retrying won't help
- **Validation Errors** (`VALIDATION_ERROR`): Schema mismatch - likely a code issue

## Default Behavior

The `withRetry` function uses `defaultShouldRetry` to determine if an error is retryable:

```typescript
function defaultShouldRetry(error: Error): boolean {
  if (!(error instanceof ApiError)) {
    return true; // Retry unknown errors to be safe
  }

  const status = error.status;
  const code = error.code;

  if (code === "NETWORK_ERROR") return true;

  if (code === "HTTP_ERROR") {
    if (!status) return true;
    if (status >= 500) return true;       // Server errors
    if (status === 408 || status === 429) return true; // Timeout and rate limit
    if ([400, 422, 401, 403].includes(status)) return false; // Client errors
  }

  if (code === "PARSE_ERROR") return true;
  if (code === "VALIDATION_ERROR") return false;

  return true; // Default to retrying
}
```

## Custom Retry Logic

You can override the default retry behavior:

```typescript
const { result } = await withRetry(
  async () => submitSolution(challengeId, address, signedXdr),
  {
    maxRetries: 5,
    shouldRetry: (error) => {
      // Custom logic: only retry on specific errors
      if (error instanceof ApiError) {
        return error.status === 503; // Only retry service unavailable
      }
      return false;
    },
  }
);
```

## Return Value

`withRetry` returns:

```typescript
{
  result: T;              // The successful return value
  retryState: RetryState; // Information about the retry process
}
```

Where `RetryState` contains:

```typescript
interface RetryState {
  attempt: number;     // Which attempt succeeded (1-based)
  nextRetryIn: number; // ms until next retry (0 if succeeded)
  isRetrying: boolean; // Currently retrying
  isCancelled: boolean; // User cancelled retries
}
```

## Cancellation

The `SubmitSolution` component implements cancellation via `AbortController`:

```typescript
const abortController = new AbortController();

const { result } = await withRetry(
  async () => {
    if (abortController.signal.aborted) {
      throw new Error("Retry cancelled by user");
    }
    return submitSolution(challengeId, address, signedXdr);
  }
);

// User can cancel:
abortController.abort();
```

## User Feedback

The UI provides clear feedback during retries:

1. **Retry Status Message**: "Retry attempt X of 4..."
2. **Progress Indicator**: Visual progress bar showing wait time
3. **Countdown Timer**: Seconds until next retry attempt
4. **Cancel Button**: User can abort retry attempts
5. **Error Message**: Clear description if all retries fail

## Integration with SubmitSolution

The `SubmitSolution` component uses retry logic automatically:

- Wraps the `submitSolution` call with `withRetry`
- Shows retry UI during attempts
- Provides user cancellation option
- Displays clear error messages
- Tracks retry state for debugging

## Best Practices

1. **Use reasonable timeouts**: Default values work well for most cases
2. **Implement UI feedback**: Keep users informed about retry progress
3. **Log failures**: Track failed submissions for debugging
4. **Don't retry everything**: Use `shouldRetry` to avoid retrying unrecoverable errors
5. **Monitor retry success rate**: Track how many requests succeed on retry vs first attempt
6. **Consider max delay**: 30 seconds is a reasonable upper bound for user interactions

## Testing

The `retry.test.ts` file includes comprehensive tests for:

- Exponential backoff calculation
- Jitter implementation
- Retryable vs non-retryable errors
- Callback invocation
- Cancellation handling
- Custom retry logic
- Edge cases and error handling
