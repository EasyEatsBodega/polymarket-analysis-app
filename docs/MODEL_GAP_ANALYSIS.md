# Forecast Model Gap Analysis: Why Polymarket Odds Differ

## The Problem

Our model predictions are significantly different from Polymarket odds for new/pre-release titles:

| Title | Polymarket | Our Model | Gap |
|-------|-----------|-----------|-----|
| Run Away | **57%** | 47% | -10% |
| His & Hers | **35%** | 11% | -24% |
| Stranger Things 5 | 3% | 9% | +6% |
| Emily in Paris | 0% | 28% | +28% |

## Root Cause Analysis

### What Our Model Uses (Current State)

For **new/pre-release titles**, the model falls back to `generatePreReleaseForecast()` which ONLY considers:

1. **Google Trends** (7-day average) - weight: 33%
2. **Wikipedia pageviews** (7-day average) - weight: 33%
3. **Rank delta** (not available for new titles) - weight: 34%

**Result**: With minimal signals, new titles default to momentum=50 → predicted rank #5 with high uncertainty.

### What Polymarket Traders Consider (Market Intelligence)

Traders price in factors our model completely ignores:

#### 1. Creator/Author Track Record
- **Harlan Coben** (Run Away): His Netflix shows consistently hit #1
  - Fool Me Once: 98.2M views, #10 most-watched English show EVER
  - The Stranger, Stay Close, Safe: All global #1s
  - **Track record: ~90% hit rate for #1 position**

#### 2. Star Power
- **His & Hers**: Tessa Thompson + Jon Bernthal + Pablo Schreiber
  - Major A-list leads with proven Netflix draw
  - Our MarketThesis already has this data but model doesn't use it

#### 3. Source Material Popularity
- Alice Feeney bestselling novel (His & Hers)
- Harlan Coben #1 NYT bestseller (Run Away)
- Established fanbase before release

#### 4. Early Performance Data
- **Run Away is ALREADY #1** in 37 countries as of Jan 4
- It passed Stranger Things within 3 days of release
- This data may not be in our Netflix weekly data yet

#### 5. Genre/Format Patterns
- British mystery thrillers have 80%+ hit rate on Netflix
- Limited series format performs well (binge-friendly)

---

## Data Gaps to Fill

### Immediate Gaps (High Impact)

| Signal | Source | Impact | Difficulty |
|--------|--------|--------|------------|
| Creator track record | Manual database | HIGH | Medium |
| Current week Netflix rank | FlixPatrol daily | HIGH | Low |
| Star power score | Already have (MarketThesis) | HIGH | Already built |
| Source material (bestseller) | Manual tagging | MEDIUM | Low |

### Future Signals (Medium Impact)

| Signal | Source | Impact | Difficulty |
|--------|--------|--------|------------|
| Studio track record | TMDB | MEDIUM | Medium |
| Genre hit rate | Historical analysis | MEDIUM | Medium |
| Marketing spend proxy | Social mentions | LOW | Hard |
| International performance | FlixPatrol by country | MEDIUM | Medium |

---

## Proposed Solutions

### Phase 1: Quick Wins (Immediate)

#### 1.1 Incorporate Daily FlixPatrol Rank
We already have `FlixPatrolDaily` data. If a title is CURRENTLY #1, the model should know.

```typescript
// In featureBuilder.ts, add:
const currentDailyRank = await getLatestFlixPatrolRank(titleId);
if (currentDailyRank && currentDailyRank <= 3) {
  // Boost momentum significantly for currently-ranking titles
  momentumBoost = (4 - currentDailyRank) * 15; // #1 = +45, #2 = +30, #3 = +15
}
```

#### 1.2 Use Star Power Score in Forecast
We already calculate star power in MarketThesis. Feed it into the model:

```typescript
const thesis = await generateMarketThesis(title);
const starPowerBoost = (thesis.starPowerScore - 50) / 100 * 10; // -5 to +5 adjustment
```

#### 1.3 Creator Track Record Database
Create a simple lookup table for known hit-makers:

```typescript
const CREATOR_TRACK_RECORD: Record<string, number> = {
  'Harlan Coben': 0.90,      // 90% chance of #1
  'Shonda Rhimes': 0.75,
  'Ryan Murphy': 0.70,
  'Mike Flanagan': 0.65,
  // etc.
};
```

### Phase 2: Model Improvements

#### 2.1 Multi-Factor Pre-Release Model

Replace the simple momentum → rank mapping with a weighted scoring model:

```typescript
interface PreReleaseFactors {
  creatorTrackRecord: number;   // 0-100, weight: 30%
  starPowerScore: number;       // 0-100, weight: 25%
  sourceMaterialScore: number;  // 0-100, weight: 15%
  trendsSignal: number;         // 0-100, weight: 15%
  wikiSignal: number;           // 0-100, weight: 15%
}

function calculatePreReleaseProbability(factors: PreReleaseFactors): number {
  return (
    factors.creatorTrackRecord * 0.30 +
    factors.starPowerScore * 0.25 +
    factors.sourceMaterialScore * 0.15 +
    factors.trendsSignal * 0.15 +
    factors.wikiSignal * 0.15
  );
}
```

#### 2.2 Genre-Specific Base Rates

Calculate historical hit rates by genre:

| Genre | Base #1 Rate |
|-------|-------------|
| British Mystery Thriller | 65% |
| True Crime Documentary | 55% |
| Korean Drama | 45% |
| Reality Competition | 40% |
| Stand-up Comedy | 25% |

### Phase 3: UI Improvements

#### 3.1 "Why Market Favors This" Section

When our model diverges from Polymarket by >15%:
- Show explicit reasoning for market price
- List factors we may be missing
- Flag as "Market sees something we don't"

#### 3.2 Track Record Display

For each title, show:
- Creator's Netflix history
- Previous shows' rankings
- Hit rate percentage

---

## Validation Plan

### Backtest Approach
1. Get historical Polymarket odds for past markets
2. Compare to our model predictions
3. See which was more accurate
4. Identify patterns in our misses

### Forward Tracking
- Log both predictions each week
- Track actual outcomes
- Calculate accuracy over time
- Adjust weights based on what predicts best

---

## Implementation Priority

1. **This Week**:
   - Add daily FlixPatrol rank to pre-release model
   - Use star power score from MarketThesis

2. **Next Week**:
   - Create creator track record database
   - Add to pre-release forecast

3. **Following Weeks**:
   - Multi-factor model
   - Genre base rates
   - UI improvements

---

## Key Insight

> **The market is pricing in INSTITUTIONAL KNOWLEDGE that our model doesn't capture.**
>
> Polymarket traders know that Harlan Coben = guaranteed #1 because they've seen it happen 10+ times.
> Our model only sees "new show with moderate Google Trends" and predicts rank #5.
>
> The fix isn't more sophisticated math - it's **more data sources** that capture real-world predictors of success.
