"use client";

import ApiErrorDisplay from "@/components/ApiErrorDisplay";

export default function ChallengesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ApiErrorDisplay error={error} reset={reset} />;
}
