# PredictEasy

**Polymarket Intelligence Platform**

A modular analytics platform that generates forecasts for various markets and compares predictions against Polymarket betting odds. Build your edge by combining real-world data signals with market sentiment.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Overview

PredictEasy helps analysts and traders identify opportunities across Polymarket by:

- **Aggregating Multi-Source Signals** - Collect odds from prediction markets, sportsbooks, and expert consensus
- **Building Consensus Estimates** - Generate weighted probability forecasts from multiple data sources
- **Detecting Edge Opportunities** - Spot discrepancies between sources to find trading opportunities
- **Tracking Performance** - Monitor how your forecasts perform over time

## Market Modules

PredictEasy is built as a modular platform. Each market category has its own dedicated analysis module.

### Available Modules

| Module | Status | Description |
|--------|--------|-------------|
| **Awards Intelligence** | Live | Track Golden Globes, Oscars with multi-source consensus |
| **Netflix Entertainment** | Live | Track Netflix Top 10 rankings for shows and movies |
| **Insider Finder** | Live | Analyze wallet trading patterns and performance |
| *Sports* | Planned | Coming soon |
| *Politics* | Planned | Coming soon |

### Awards Module Features

The Awards Intelligence Hub provides comprehensive awards prediction tracking:

- **Multi-Source Consensus**: Weighted estimates from Polymarket, sportsbooks (MyBookie, Bovada), and Gold Derby expert predictions
- **Edge Detection**: Identify discrepancies between sources for trading opportunities
- **Source Badges**: Visual indicators showing which data sources are available per category
- **Confidence Scoring**: High/Medium/Low confidence based on source agreement
- **Category Deep-Dives**: Detailed nominee comparisons with probability bars

**Data Sources & Weights:**
| Source | Weight | Type |
|--------|--------|------|
| Polymarket | 35% | Prediction Market |
| Gold Derby | 25% | Expert Consensus |
| MyBookie | 15% | Sportsbook |
| Bovada | 15% | Sportsbook |
| DraftKings | 5% | Sportsbook |
| BetMGM | 5% | Sportsbook |

### Netflix Module Features

Track Netflix-related Polymarket markets:

- **4 Dashboard Views**: Global Shows, Global Movies, US Shows, US Movies
- **Data Sources**: Netflix official rankings, Google Trends, Wikipedia pageviews
- **Momentum Scoring**: Identify titles climbing fast in popularity
- **Forecast Bands**: p10/p50/p90 predictions with confidence intervals

### Insider Finder Features

Analyze Polymarket wallet trading patterns:

- **Wallet Performance Tracking**: Win rate, ROI, and profit metrics
- **Trading Pattern Analysis**: Identify consistent performers
- **Position Monitoring**: Track current holdings and trade history

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Charts | Recharts |
| Database | PostgreSQL (Vercel Postgres) |
| ORM | Prisma |
| Auth | Clerk (Email, Google, Apple) |
| ML/Stats | simple-statistics, ml-regression |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Vercel Postgres)
- Clerk account (for authentication)

### Installation

```bash
# Clone the repository
git clone https://github.com/EasyEatsBodega/polymarket-analysis-app.git
cd polymarket-analysis-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Set up your database URL and API keys in .env

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate:dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

See `.env.example` for all required and optional environment variables.

## Core Features

### Multi-Source Consensus

- Aggregate odds from multiple sources (prediction markets, sportsbooks, experts)
- Weighted average calculations with configurable source weights
- Agreement scoring to measure source consensus
- Confidence levels based on data availability and agreement

### Edge Detection

- Compare Polymarket prices against sportsbook odds
- Highlight significant discrepancies (>5% difference)
- Surface edge opportunities on category and nominee level

### Polymarket Integration

- Auto-discover markets by keyword filters
- Real-time price tracking
- Order book depth analysis
- Historical price charts
- Volume and liquidity metrics

### Forecasting Engine

- Configurable model weights (admin-adjustable)
- Multiple output formats: p10 (optimistic), p50 (median), p90 (pessimistic)
- Feature importance explanations
- Backtesting support

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── awards/        # Awards API endpoints
│   ├── awards/            # Awards pages
│   ├── netflix/           # Netflix module
│   ├── insider-finder/    # Wallet analysis
│   └── admin/             # Admin settings
├── components/            # Shared React components
│   └── awards/            # Awards-specific components
├── lib/                   # Core utilities
│   └── consensusCalculator.ts  # Multi-source consensus
├── jobs/                  # Data pipeline scripts
│   ├── ingestSportsbookOdds.ts # Sportsbook data
│   └── ingestGoldDerby.ts      # Expert consensus
└── types/                 # TypeScript definitions
```

## Data Ingestion

### Sportsbook Odds

Run the sportsbook ingestion job to update odds:

```bash
npx dotenv -e .env.local -- npx tsx src/jobs/ingestSportsbookOdds.ts
```

### Gold Derby Expert Consensus

Run the Gold Derby ingestion job:

```bash
npx dotenv -e .env.local -- npx tsx src/jobs/ingestGoldDerby.ts
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Add Vercel Postgres from the Storage tab
3. Configure environment variables
4. Deploy

Automatic deployments trigger on push to `master` branch.

## Roadmap

- [x] Project scaffold and core infrastructure
- [x] Netflix entertainment module
- [x] Polymarket API integration
- [x] User authentication
- [x] Admin configuration panel
- [x] Awards Intelligence Hub
- [x] Multi-source consensus calculator
- [x] Sportsbook odds integration (MyBookie, Bovada)
- [x] Gold Derby expert consensus
- [x] Edge detection and opportunities
- [x] Insider Finder wallet analysis
- [ ] Article aggregation with AI extraction
- [ ] Oscar predictions module
- [ ] Additional award shows

## Contributing

Contributions are welcome! Please open an issue or submit a PR.

## License

MIT License - see [LICENSE](LICENSE) for details.
