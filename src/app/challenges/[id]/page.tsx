export const dynamic = "force-dynamic";

import { getChallenge } from "@/lib/api";
import SubmitSolution from "@/components/SubmitSolution";
import DifficultyBadge from "@/components/DifficultyBadge";
import { notFound } from "next/navigation";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{challenge.title}</h1>
          <p className="text-gray-400 mt-2">{challenge.description}</p>
        </div>
        <DifficultyBadge difficulty={challenge.difficulty} />
      </div>

      <div className="bg-card border border-white/5 rounded-2xl p-6">
        <h2 className="font-semibold text-lg mb-3">Instructions</h2>
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
          {challenge.instructions}
        </pre>
      </div>

      <div className="bg-card border border-white/5 rounded-2xl p-6">
        <h2 className="font-semibold text-lg mb-3">Reward</h2>
        <p className="text-brand-light font-bold text-2xl">
          {challenge.reward} PLN
        </p>
      </div>

      <SubmitSolution challengeId={challenge.id} />
    </div>
  );
}
