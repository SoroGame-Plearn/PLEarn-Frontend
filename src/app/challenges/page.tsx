export const dynamic = "force-dynamic";

import ChallengeCard from "@/components/ChallengeCard";
import DifficultyFilter from "@/components/DifficultyFilter";
import { getChallenges } from "@/lib/api";

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string }>;
}) {
  const { difficulty = "all" } = await searchParams;
  const challenges = await getChallenges(difficulty);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Challenges</h1>
      <p className="text-gray-400 mb-8">
        Pick a challenge, write your solution, and earn PLN tokens.
      </p>
      <DifficultyFilter active={difficulty} />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </div>
    </div>
  );
}
