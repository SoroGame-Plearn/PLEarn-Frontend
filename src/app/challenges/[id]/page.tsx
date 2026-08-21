export const dynamic = "force-dynamic";

import { ApiError, getChallenge } from "@/lib/api";
import SubmitSolution from "@/components/SubmitSolution";
import WalletErrorBoundary from "@/components/WalletErrorBoundary";
import DifficultyBadge from "@/components/DifficultyBadge";
import { notFound } from "next/navigation";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let challenge;
  try {
    challenge = await getChallenge(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{challenge.title}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{challenge.description}</p>
        </div>
        <DifficultyBadge difficulty={challenge.difficulty} />
      </div>

      <div className="bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Instructions</h2>
        <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
          {challenge.instructions}
        </pre>
      </div>

      <div className="bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h2 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Reward</h2>
        <p className="text-brand-light font-bold text-2xl">
          {challenge.reward} PLN
        </p>
      </div>

      <WalletErrorBoundary>
        <SubmitSolution
          challengeId={challenge.id}
          challengeTitle={challenge.title}
          reward={challenge.reward}
        />
      </WalletErrorBoundary>
    </div>
  );
}
