import { test as base, expect } from '@playwright/test';

/**
 * Test fixtures for E2E tests
 * Provides common setup/teardown and helper functions
 */

export type TestFixtures = {
  mockWallet: boolean;
  walletAddress: string;
  apiBaseUrl: string;
};

export const test = base.extend<TestFixtures>({
  mockWallet: [true, { option: true }],
  walletAddress: ['GDUTHCF37UX32EMANXIL2WOOVEDP47GHBOENQWCE7ME7ODEYWQA7ON2', { option: true }],
  apiBaseUrl: [process.env.PLAYWRIGHT_TEST_API_URL || 'http://localhost:3001', { option: true }],
});

export { expect };

/**
 * Mock data for testing
 */
export const mockData = {
  challenges: [
    {
      id: '1',
      title: 'Hello Stellar',
      description: 'Write a program that connects to Stellar network',
      difficulty: 'Beginner',
      reward: 100,
      instructions: 'Connect to testnet and retrieve network info',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      title: 'Create an Account',
      description: 'Create a new Stellar account with funding',
      difficulty: 'Beginner',
      reward: 150,
      instructions: 'Use Friendbot to fund a test account',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      title: 'Send Payments',
      description: 'Send XLM between accounts',
      difficulty: 'Intermediate',
      reward: 250,
      instructions: 'Build and sign a payment transaction',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '4',
      title: 'Custom Smart Contracts',
      description: 'Deploy and interact with Soroban contracts',
      difficulty: 'Advanced',
      reward: 500,
      instructions: 'Write, deploy, and invoke a Soroban contract',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],

  leaderboardEntries: [
    {
      rank: 1,
      address: 'GDUTHCF37UX32EMANXIL2WOOVEDP47GHBOENQWCE7ME7ODEYWQA7ON2',
      solvedCount: 10,
      totalReward: 2500,
      lastSolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      rank: 2,
      address: 'GBFT7ZMLBXVYB4P3KICWGFVL6JTFMVBG3HFXDVVH5J7K6Z3F7K8L9M0N1O2P3',
      solvedCount: 8,
      totalReward: 1800,
      lastSolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      rank: 3,
      address: 'GCAQ7ZMLBXVYB4P3KICWGFVL6JTFMVBG3HFXDVVH5J7K6Z3F7K8L9M0N1O2P4',
      solvedCount: 6,
      totalReward: 1200,
      lastSolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],

  userProgress: {
    address: 'GDUTHCF37UX32EMANXIL2WOOVEDP47GHBOENQWCE7ME7ODEYWQA7ON2',
    solvedChallenges: 10,
    totalRewardsEarned: 2500,
    completedChallenges: [
      {
        id: '1',
        title: 'Hello Stellar',
        difficulty: 'Beginner',
        reward: 100,
        solvedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '2',
        title: 'Create an Account',
        difficulty: 'Beginner',
        reward: 150,
        solvedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: '3',
        title: 'Send Payments',
        difficulty: 'Intermediate',
        reward: 250,
        solvedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
};

/**
 * Common test helpers
 */
export async function setupMockServer(page: any) {
  // Route API calls to mock data
  await page.route('**/api/**', (route: any) => {
    const url = route.request().url();

    if (url.includes('/challenges')) {
      route.abort();
    } else if (url.includes('/leaderboard')) {
      route.abort();
    } else if (url.includes('/progress')) {
      route.abort();
    } else {
      route.continue();
    }
  });
}

export async function mockChallengesAPI(page: any) {
  await page.route('**/api/challenges*', (route: any) => {
    route.abort('blockedbyclient');
  });
}

export async function mockLeaderboardAPI(page: any) {
  await page.route('**/api/leaderboard*', (route: any) => {
    route.abort('blockedbyclient');
  });
}

export async function mockProgressAPI(page: any) {
  await page.route('**/api/progress*', (route: any) => {
    route.abort('blockedbyclient');
  });
}
