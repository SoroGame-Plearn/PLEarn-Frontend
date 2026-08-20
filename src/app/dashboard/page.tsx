export const dynamic = "force-dynamic";

import { getProgress } from "@/lib/api";
import ProgressStats from "@/components/ProgressStats";

export default async function DashboardPage() {
  // address resolved server-side via cookie/session in a real app
  const progress = await getProgress();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">My Dashboard</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Your progress and earned rewards.</p>
      <ProgressStats data={progress} />
    </div>
  );
}
