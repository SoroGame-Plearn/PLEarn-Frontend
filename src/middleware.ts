import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy.
 *
 * The wallet bridge lives in this origin, so any script that runs here can
 * reach it. The integrity snapshot in src/lib/wallet.ts catches an API method
 * swapped after page load; it cannot catch a hostile script that ran before
 * that. A nonce-based CSP is what keeps such a script off the page in the
 * first place. See docs/WALLET_SECURITY.md.
 *
 * Freighter's own injection is unaffected: scripts a browser extension
 * injects are exempt from the page's CSP.
 */

/** Origins the app is allowed to talk to, derived from the same env the API and socket use. */
function connectSources(): string[] {
  const sources = new Set<string>(["'self'"]);

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (backend) {
    sources.add(backend);
    // The socket manager derives ws(s):// from the backend URL when
    // NEXT_PUBLIC_WS_URL is unset, so both schemes have to be allowed.
    sources.add(backend.replace(/^http/, "ws"));
  }

  const ws = process.env.NEXT_PUBLIC_WS_URL;
  if (ws) sources.add(ws);

  return [...sources];
}

function buildPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Next's dev server compiles and evaluates on the client.
    isDev ? "'unsafe-eval'" : "",
  ].filter(Boolean);

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    // Tailwind and Next inject style tags at runtime; there is no nonce hook
    // for them, and styles cannot reach the wallet.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src ${connectSources().join(" ")}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    isDev ? "" : "upgrade-insecure-requests",
  ].filter(Boolean);

  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildPolicy(nonce, process.env.NODE_ENV === "development");

  // Next reads the nonce back off the request header to stamp its own script
  // tags, so the same policy has to travel both ways.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    // Static assets and prefetches carry no inline script, so they skip the
    // per-request nonce work.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
