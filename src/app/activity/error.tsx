"use client";

import ApiErrorDisplay from "@/components/ApiErrorDisplay";

export default function ActivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ApiErrorDisplay error={error} reset={reset} />;
}
