import Link from "next/link";
import { ArrowRight, Code2, Trophy, Wallet } from "lucide-react";

const features = [
  {
    icon: Code2,
    title: "Solve Challenges",
    desc: "Work through curated smart contract challenges across multiple difficulty levels.",
  },
  {
    icon: Wallet,
    title: "Connect & Earn",
    desc: "Link your Stellar wallet and receive on-chain rewards for every solved challenge.",
  },
  {
    icon: Trophy,
    title: "Track Progress",
    desc: "Monitor your rank, completed challenges, and earned tokens on the leaderboard.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-32 gap-6">
        <span className="text-xs font-semibold tracking-widest uppercase text-brand-light bg-brand/10 px-3 py-1 rounded-full">
          Phase 3 — Live
        </span>
        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight max-w-3xl text-gray-900 dark:text-white">
          Learn.&nbsp;
          <span className="text-brand-light">Solve.</span>
          &nbsp;Earn.
        </h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-xl text-lg">
          Plearn is a decentralized challenge platform built on Stellar. Complete
          coding challenges, submit solutions, and earn real on-chain rewards.
        </p>
        <div className="flex gap-4 mt-2 flex-wrap justify-center">
          <Link
            href="/challenges"
            className="flex items-center gap-2 bg-brand hover:bg-brand-dark transition px-6 py-3 rounded-xl font-semibold text-white"
          >
            Browse Challenges <ArrowRight size={16} />
          </Link>
          <Link
            href="/leaderboard"
            className="flex items-center gap-2 border border-black/10 dark:border-white/10 hover:border-brand-light transition px-6 py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:text-brand dark:hover:text-white"
          >
            Leaderboard
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-3 gap-6 px-6 pb-24 max-w-5xl mx-auto w-full">
        {features.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="bg-white dark:bg-card border border-black/10 dark:border-white/5 rounded-2xl p-6 flex flex-col gap-3 shadow-sm dark:shadow-none"
          >
            <Icon className="text-brand-light" size={28} />
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
