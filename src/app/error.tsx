"use client";

import ApiErrorDisplay from "@/components/ApiErrorDisplay";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ApiErrorDisplay error={error} reset={reset} />;
}
