# Plearn Frontend

> **Learn. Solve. Earn.** — A decentralized challenge platform built on Stellar.

Plearn is a Web3 learning platform where developers complete coding challenges, submit solutions on-chain, and earn **PLN token rewards**. This repository is **Phase 3** of the Plearn project — the user-facing Next.js application.

```
Browse → Solve → Earn → Track
```

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Layer](#api-layer)
- [Features](#features)
- [Wallet Integration](#wallet-integration)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

---

## Overview

| Phase | Repo | Description |
|-------|------|-------------|
| 1 | `contracts/` | Soroban smart contracts — challenge engine & reward logic |
| 2 | `backend/` | REST API — progress tracking, submission validation |
| **3** | **`frontend/`** | **Next.js UI — this repo** |

### System Architecture

Plearn integrates three independent phases into a unified Web3 learning platform. See the full architecture details in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

**Quick Flow:**
```
User connects wallet → Browse challenges → Submit solution → Freighter signs XDR → Backend broadcasts to blockchain → Contract distributes rewards → Progress updated
```

For comprehensive architecture documentation including data flows, wallet integration details, and integration points, see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

#### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PLEARN SYSTEM ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────┐
    │  User's Browser      │
    │  ┌────────────────┐  │
    │  │ Next.js        │  │  Phase 3: Frontend
    │  │ Frontend App   │  │
    │  └────────────────┘  │
    │         ↓            │
    │  ┌────────────────┐  │
    │  │ Freighter      │  │ Browser Extension
    │  │ Wallet         │  │
    │  └────────────────┘  │
    └─────────────────┬────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ↓             ↓             ↓
   Challenge      Wallet       Transaction
   Data Fetch    Connection    Signing
        │             │             │
        └─────────────┼─────────────┘
                      ↓
            ┌──────────────────────┐
            │  Backend REST API    │  Phase 2: Backend
            │  ├─ Challenges      │
            │  ├─ Progress        │
            │  ├─ Leaderboard     │
            │  └─ Submit          │
            └──────┬───────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
   PostgreSQL         Stellar Network
   Database          (Blockchain)
                          │
                          ↓
                  ┌─────────────────┐
                  │ Soroban Smart   │  Phase 1: Contracts
                  │ Contracts       │
                  │ ├─ Challenge    │
                  │ ├─ Reward       │
                  │ └─ Validator    │
                  └─────────────────┘
```

**Key Integration Points:**
- **Frontend ↔ Wallet:** Freighter for wallet connection and transaction signing
- **Frontend ↔ Backend:** REST API calls for data and transaction submission
- **Backend ↔ Blockchain:** Broadcasting signed transactions and listening for events
- **All Three Phases:** Coordinated reward distribution and progress tracking

For detailed component descriptions, data flows, and security considerations, refer to [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| [Next.js 14](https://nextjs.org) (App Router) | Framework |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [@stellar/freighter-api](https://docs.freighter.app) | Wallet connection |
| [@stellar/stellar-sdk](https://stellar.github.io/js-stellar-sdk) | Transaction signing |
| [Lucide React](https://lucide.dev) | Icons |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Navbar + WalletProvider)
│   ├── page.tsx                # Landing page
│   ├── challenges/
│   │   ├── page.tsx            # Challenge dashboard (filterable)
│   │   └── [id]/page.tsx       # Challenge detail + submit
│   ├── leaderboard/page.tsx    # Global leaderboard
│   └── dashboard/page.tsx      # User progress dashboard
│
├── components/
│   ├── Navbar.tsx              # Top navigation
│   ├── WalletButton.tsx        # Connect / disconnect wallet
│   ├── ChallengeCard.tsx       # Challenge list card
│   ├── DifficultyBadge.tsx     # Beginner / Intermediate / Advanced pill
│   ├── DifficultyFilter.tsx    # Filter bar for challenges page
│   ├── SubmitSolution.tsx      # Solution submission form
│   └── ProgressStats.tsx       # Dashboard stats + completed list
│
├── context/
│   └── WalletContext.tsx       # Freighter wallet state (connect, sign, disconnect)
│
├── lib/
│   ├── api.ts                  # Typed fetch helpers for the backend
│   └── utils.ts                # cn() utility (clsx + tailwind-merge)
│
└── types/
    └── index.ts                # Shared TypeScript types
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Freighter wallet](https://freighter.app) browser extension (for wallet features)
- Plearn backend running (Phase 2) — or mock the API

### Install & Run

```bash
# 1. Clone
git clone https://github.com/your-org/PLEarn-Frontend.git
cd PLEarn-Frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:3001` | Plearn backend base URL |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | — | Deployed Soroban contract ID |

---

## API Layer

All backend responses are validated at runtime with [Zod](https://zod.dev)
before they reach the UI, and failures surface as a typed `ApiError`
(`NETWORK_ERROR` / `HTTP_ERROR` / `PARSE_ERROR` / `VALIDATION_ERROR`) caught
by a route-level error boundary. See [`docs/API.md`](./docs/API.md) for how
the layer is structured and how to add a new endpoint.

---

## Features

### Challenge Dashboard
- Browse all challenges with difficulty filtering (Beginner / Intermediate / Advanced)
- Each card shows title, description, difficulty badge, and PLN reward

### Challenge Detail
- Full instructions view
- Reward display
- Solution submission form (requires wallet connection)

### Wallet Integration
- One-click connect via **Freighter** browser extension
- Signs transactions client-side — private keys never leave the browser
- Disconnect at any time

### Leaderboard
- Ranked list of top solvers
- Shows solved count and total PLN earned per address

### User Dashboard
- Personal stats: challenges solved, total rewards earned
- Full list of completed challenges with difficulty and reward

---

## Wallet Integration

Plearn uses [Freighter](https://freighter.app) — the official Stellar browser wallet.

**Flow:**
1. User clicks **Connect Wallet** → Freighter prompts for permission
2. Public key is stored in React context (never the private key)
3. On submission, the backend returns an unsigned XDR transaction
4. Freighter signs it client-side
5. Signed XDR is sent back to the backend for broadcast and reward distribution

**Supported networks:** Testnet (default) · Mainnet

---

## Contributing

Contributions are welcome! This project follows the Wave issue model for onboarding.

```bash
# Create a feature branch
git checkout -b feat/your-feature

# Make changes, then open a PR against main
```

**Good first issues:**
- UI component improvements
- UX flow enhancements
- Leaderboard pagination
- Mobile navigation menu
- Dark/light theme toggle

Please follow the existing code style (TypeScript strict, Tailwind utility classes, minimal abstractions).

---

## Roadmap

- [x] Landing page
- [x] Challenge dashboard with difficulty filter
- [x] Challenge detail + solution submission
- [x] Freighter wallet integration
- [x] Leaderboard
- [x] User progress dashboard
- [ ] Mobile navigation drawer
- [ ] Pagination for challenges and leaderboard
- [ ] Real-time submission status via WebSocket
- [ ] On-chain activity explorer
- [ ] Dark / light theme toggle
- [ ] Internationalization (i18n)

---

## License

MIT © Plearn Contributors
