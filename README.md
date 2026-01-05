# PredictEasy

**Polymarket Intelligence Platform**

A modular analytics platform that generates forecasts for various markets and compares predictions against Polymarket betting odds. Build your edge by combining real-world data signals with market sentiment.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Overview

PredictEasy helps analysts and traders identify opportunities across Polymarket by:

- **Aggregating Real-World Signals** - Collect and process data from multiple sources
- **Building Predictive Models** - Generate probability forecasts with confidence intervals
- **Comparing Against Markets** - Spot discrepancies between model predictions and market prices
- **Tracking Performance** - Monitor how your forecasts perform over time

## Market Modules

PredictEasy is built as a modular platform. Each market category has its own dedicated analysis module.

### Available Modules

| Module | Status | Description |
|--------|--------|-------------|
| **Netflix Entertainment** | In Development | Track Netflix Top 10 rankings for shows and movies |
| *Sports* | Planned | Coming soon |
| *Politics* | Planned | Coming soon |
| *Culture & Events* | Planned | Coming soon |

### Netflix Module Features

The first module focuses on Netflix-related Polymarket markets:

- **4 Dashboard Views**: Global Shows, Global Movies, US Shows, US Movies
- **Data Sources**: Netflix official rankings, Google Trends, Wikipedia pageviews
- **Momentum Scoring**: Identify titles climbing fast in popularity
- **Forecast Bands**: p10/p50/p90 predictions with confidence intervals

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

### Discrepancy Detection

- Side-by-side comparison of model forecast vs market price
- Historical tracking of identified discrepancies
- Performance metrics on past predictions

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── [module]/          # Module-specific pages
│   └── admin/             # Admin settings
├── components/            # Shared React components
├── lib/                   # Core utilities
├── jobs/                  # Data pipeline scripts
├── modules/               # Market-specific modules
│   └── netflix/           # Netflix analysis module
└── types/                 # TypeScript definitions
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Add Vercel Postgres from the Storage tab
3. Configure environment variables
4. Deploy

## Roadmap

- [x] Project scaffold and core infrastructure
- [ ] Netflix entertainment module
- [ ] Polymarket API integration
- [ ] User authentication
- [ ] Admin configuration panel
- [ ] Additional market modules

## Contributing

Contributions are welcome! Please open an issue or submit a PR.

## License

MIT License - see [LICENSE](LICENSE) for details.
