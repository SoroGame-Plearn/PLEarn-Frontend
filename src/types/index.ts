export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  instructions: string;
  difficulty: Difficulty;
  reward: number;
  solved: boolean;
}

export interface LeaderboardEntry {
  address: string;
  solved: number;
  totalRewards: number;
}

export interface UserProgress {
  address: string;
  solved: number;
  totalRewards: number;
  completedChallenges: Pick<Challenge, "id" | "title" | "difficulty" | "reward">[];
}
