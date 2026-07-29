# Pagination Pattern

This document describes how cursor-based pagination is implemented in the Plearn frontend, and how to extend it to new endpoints.

---

## Overview

All paginated API responses follow a uniform envelope:

```ts
{
  items: T[];          // Current page items
  hasMore: boolean;    // Whether more pages exist
  nextCursor?: string | null; // Pass to the next request to get the next page
  total?: number;      // Optional — total item count across all pages
}
```

The `nextCursor` is an opaque string managed by the backend. Clients must not construct or modify it — only echo it back.

---

## Schema

Zod schemas live in `src/lib/schemas.ts`:

```ts
import { PaginatedSchema, PaginatedChallengeListSchema, PaginatedLeaderboardSchema } from "@/lib/schemas";

// Create a paginated wrapper for any item schema:
const PaginatedFooSchema = PaginatedSchema(FooSchema);
```

Types are inferred via `z.infer` and re-exported from `src/types/index.ts`.

---

## API Layer

Paginated fetch functions live in `src/lib/api.ts`:

| Function | Endpoint | Notes |
|---|---|---|
| `getChallengesPaginated(params)` | `GET /challenges/paginated` | Supports `difficulty` filter |
| `getLeaderboardPaginated(params)` | `GET /leaderboard/paginated` | — |

**Parameters** (`PaginationParams`):

| Param | Type | Default | Description |
|---|---|---|---|
| `cursor` | `string \| undefined` | — | Token from previous page's `nextCursor` |
| `limit` | `number` | `20` | Items per page |
| `difficulty` | `string` | `"all"` | Difficulty filter (challenges only) |

Both functions include a **legacy fallback**: if the backend still returns a flat array (pre-pagination), it is automatically wrapped into `{ items, hasMore: false, nextCursor: null }` so the UI doesn't break.

---

## Challenges Page — Infinite Scroll

`src/app/challenges/page.tsx` is a **client component** that:

1. Fetches the first page on mount (and on every difficulty-filter change).
2. Uses `IntersectionObserver` to watch an invisible sentinel `<div>` at the bottom of the list.
3. When the sentinel scrolls into view, calls `getChallengesPaginated` with the latest `nextCursor`.
4. Deduplicates items by `id` before merging into state — safe against StrictMode double-invocation and duplicate cursors.
5. Shows `ChallengeCardSkeleton` rows while the next page loads.
6. Surfaces errors inline with a retry button; if the first page fails, shows `ApiErrorDisplay`.

### Extending to a new "load more" list

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMyThingsPaginated } from "@/lib/api";
import type { MyThing } from "@/types";

export default function MyThingsList() {
  const [items, setItems] = useState<MyThing[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);

  const load = useCallback(async (c: typeof cursor) => {
    if (isFetching.current || c === null) return;
    isFetching.current = true;
    const page = await getMyThingsPaginated({ cursor: c ?? undefined });
    setItems(prev => {
      const ids = new Set(prev.map(x => x.id));
      return [...prev, ...page.items.filter(x => !ids.has(x.id))];
    });
    setCursor(page.nextCursor ?? null);
    setHasMore(page.hasMore);
    isFetching.current = false;
  }, []);

  useEffect(() => { load(undefined); }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && hasMore) load(cursor); },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, hasMore, load]);

  return (
    <>
      {items.map(x => <MyThingCard key={x.id} thing={x} />)}
      <div ref={sentinelRef} />
    </>
  );
}
```

---

## Leaderboard Page — Traditional Prev/Next

`src/app/leaderboard/page.tsx` is a **client component** that uses a cursor **stack** to enable backward navigation without re-fetching all previous pages:

- `cursorStack[0]` is always `undefined` (first page, no cursor).
- Moving forward pushes the `nextCursor` from the current page onto the stack.
- Moving backward decrements the index — no new cursor is needed.

This means navigating back is O(1) without caching response data, and forward navigation is also O(1) per page.

---

## Adding a New Paginated Endpoint

1. **Schema** — add `PaginatedSchema(YourItemSchema)` and its inferred type to `src/lib/schemas.ts`.
2. **API function** — follow the `getChallengesPaginated` pattern in `src/lib/api.ts`. Include the legacy flat-array fallback until the backend is fully upgraded.
3. **Re-export** — add the new types to `src/types/index.ts`.
4. **UI** — use infinite scroll (challenges pattern) for lists, or Prev/Next (leaderboard pattern) for ranked tables.
5. **Tests** — add cases to `src/lib/pagination.test.ts` covering: successful paginated response, legacy fallback, `NETWORK_ERROR`, `HTTP_ERROR`, `VALIDATION_ERROR`, and empty results.

---

## Error Handling

Every paginated function can throw an `ApiError` with one of four codes:

| Code | Cause |
|---|---|
| `NETWORK_ERROR` | `fetch` itself threw (no internet, DNS failure, etc.) |
| `HTTP_ERROR` | Backend returned a non-2xx status |
| `PARSE_ERROR` | Response body couldn't be parsed as JSON |
| `VALIDATION_ERROR` | JSON didn't match the Zod schema |

The UI components catch these and:
- On first load: render `<ApiErrorDisplay>` with a "Try again" button that resets state and retries.
- On subsequent pages: show an inline retry prompt without losing already-loaded items.

Cursor expiry (backend returns HTTP 400/410 with the cursor token): caught as `HTTP_ERROR`. The recommended UX is to reset to the first page and inform the user with a toast or inline message.
