"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { ApiError } from "@/lib/api-error";

const CODE_COPY: Record<string, string> = {
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  HTTP_ERROR: "The server rejected the request.",
  PARSE_ERROR: "The server sent back something we couldn't read.",
  VALIDATION_ERROR: "The server's response didn't match what we expected.",
};

export default function ApiErrorDisplay({
  error,
  reset,
}: {
  error: unknown;
  reset?: () => void;
}) {
  const isApiError = error instanceof ApiError;
  const description = isApiError
    ? CODE_COPY[error.code] ?? error.message
    : "Something went wrong while loading this page.";

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
        <AlertTriangle className="text-red-500 dark:text-red-400" size={28} />
      </div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">We hit a snag</h1>
      <p className="text-gray-500 dark:text-gray-400">{description}</p>
      {isApiError && (
        <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
          {error.code}
          {error.status ? ` · status ${error.status}` : ""}
        </p>
      )}
      {reset && (
        <button
          onClick={reset}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark transition px-5 py-2.5 rounded-xl font-semibold text-sm text-white mt-2"
        >
          <RotateCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
