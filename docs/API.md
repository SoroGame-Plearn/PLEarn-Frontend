# API layer

`src/lib/api.ts` is the only place in the app that talks to the backend.
Every response is parsed through a [Zod](https://zod.dev) schema in
`src/lib/schemas.ts` before it reaches any component, so a backend contract
change fails loudly at the fetch call instead of silently corrupting the UI.

## How it fits together

- **`src/lib/schemas.ts`** — Zod schemas for every response shape, plus the
  TypeScript types inferred from them (`z.infer`). This is the single source
  of truth: `src/types/index.ts` re-exports these inferred types rather than
  declaring its own, so the compile-time types and the runtime validation can
  never drift apart.
- **`src/lib/api-error.ts`** — the `ApiError` class thrown for every failure
  mode. Check `error.code` to branch on the failure type:
  - `NETWORK_ERROR` — the `fetch` call itself failed (offline, DNS, CORS, …)
  - `HTTP_ERROR` — the server responded with a non-2xx status (`error.status`
    is set, `error.details` holds the parsed error body if there was one)
  - `PARSE_ERROR` — the response body wasn't valid JSON
  - `VALIDATION_ERROR` — the JSON body didn't match the expected schema
    (`error.details` holds `zodError.flatten()`)
- **`src/lib/api.ts`** — one exported function per endpoint. Internally each
  one calls the shared `request(path, schema, init?)` helper, which does the
  fetch + status check + JSON parse + schema validation and returns fully
  typed data or throws `ApiError`.
- **`src/components/ApiErrorDisplay.tsx`** / **`src/components/ErrorBoundary.tsx`**
  — UI for surfacing an `ApiError`. Every route that fetches data has a
  colocated `error.tsx` (Next.js App Router error boundary) that renders
  `ApiErrorDisplay`. Use the `ErrorBoundary` component directly only for
  subtrees that aren't their own route segment.

## Adding a new endpoint

1. **Define the schema** in `src/lib/schemas.ts`:

   ```ts
   export const ChallengeStatsSchema = z.object({
     challengeId: z.string(),
     attempts: z.number(),
     successRate: z.number(),
   });

   export type ChallengeStats = z.infer<typeof ChallengeStatsSchema>;
   ```

2. **Add the fetch function** in `src/lib/api.ts`, reusing the shared
   `request` helper — never call `fetch` directly outside of it:

   ```ts
   export const getChallengeStats = (id: string) =>
     request<ChallengeStats>(`/challenges/${id}/stats`, ChallengeStatsSchema);
   ```

3. **Consume it from a component.** Server components can `await` it
   directly and rely on the nearest `error.tsx` to catch a thrown
   `ApiError`; client components should catch it explicitly and branch on
   `error.code` (see `src/components/SubmitSolution.tsx` for an example).

4. **Write a schema test** in `src/lib/schemas.test.ts` covering at least one
   valid payload and one invalid payload (wrong type, missing field, or
   unexpected enum value) — see the existing describe blocks for the
   pattern. Add a matching case to `src/lib/api.test.ts` if the endpoint has
   nontrivial request-building logic (query params, POST body, etc).

There's intentionally no way to add an endpoint to `api.ts` without a schema
— `request<T>` requires one, so an unvalidated response can't ship.

## Running the tests

```
npm test        # run once
npm run test:watch
```
