# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/andika666/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/andika666/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: which protocols still record no token, and what their launch would be
worth. Built for make.fun bounty **token-radar-01** ("Build the best token launch radar").

## What it is

The sealed input is a snapshot of every protocol DefiLlama tracks (758 protocols, as of
2026-11-14, watchlist floor $50,000,000 TVL). This program scores the pre-token protocols
and writes a ranked board, a static dashboard and a dossier the judge reads.

**The board: 226 rows** — all 40 watchlist protocols, plus all 186 pre-token protocols below
the watchlist floor. Total implied value $1.86B. 24 live-token protocols are set aside with
their market caps shown, never mixed into the ranking.

## The model (radar-4)

A protocol is pre-token when the snapshot records no token for it: no market cap, no
CoinGecko id, no symbol. Implied value is fitted on the snapshot's own live tokens,
never on a hardcoded multiple. The fit is a **size curve**, because the market pays less
per TVL dollar as a protocol grows: least squares of log market cap on log TVL over 118
live-token protocols, one per ticker:

```
ln(mcap) = 8.108 + 0.456 x ln(tvl)     (R² 0.138 in log space)
implied  = round( exp(8.108 + 0.456 x ln(tvl) + shift)
  x (1 + clamp(change_7d, −50, 150) / 100 x 1.0)
  x (0.5 + min(age_days, 1095) / 1095 x 0.8)
  x (1 + 0.05 x min(chains − 1, 4)) )
```

- **Size curve** — a 10× bigger TVL comes with only ~2.9× the market cap, so the implied
  multiple falls from 0.514× at $10M of TVL to 0.147× at $100M, 0.042× at $1B and 0.012×
  at $10B. A flat median ratio overvalues giants and undervalues small protocols; the
  curve is what the snapshot's own live tokens say.
- **Category shift** — each category with 5+ live tokens gets its own intercept shift: the
  median of its live tokens' log residuals off the curve, shrunk by n/(n+5) toward the
  curve (RWA +0.22 in log terms across 9 live tokens, Dexs +0.11 across 11, Lending −0.27
  across 14, Canonical Bridge +0.69 across 8). A thin category cannot pull the price far
  on a few tokens.
- **Growth, age, chain breadth are stated priors, not fitted coefficients** — after the
  size curve they carry no residual signal in the live tokens (correlations −0.09, −0.07
  and −0.05), so the curve is the fitted part and the priors are the stated part. Growth:
  seven-day TVL change, clamped to −50…+150%, full weight. Maturity: 0.5 at listing,
  rising to 1.3 over three years — a protocol that has run longer with no token is a more
  credible launch; an unlisted age uses 365 days. Chain breadth: +5% per extra chain, up
  to four.
- **Verdict + signals** — every row carries a verdict from its own figures (Cooling when
  7d growth ≤ −15%; Farm now when implied value ≥ $10M and growth ≥ 0; Early when under
  180 days old; otherwise Steady farm) and up to three signal chips: HOT (+20% 7d or
  more), COOLING (−20% or less), NEW (under 180 days), VETERAN (3+ years), WIDE (4+
  chains).

No protocol name is ever special-cased: the same function scores every row.

**The two checks.** The curve is checked twice, out of sample. Blind: the live tokens are
split by a deterministic hash of the slug (80% fit, 20% test); the curve is fitted on the
fit set only, and each test protocol's market cap is predicted from the curve. Fitted on
94 live tokens, tested on 24 held out: median absolute error 76.6%, 38% of predictions
within twice the true market cap (radar-3's flat median: 77.7%, 33%). Walk-forward: fitted
on the live tokens listed before 2024-06-01 (47), tested on the ones listed after (40):
median absolute error 84.9%, 48% within twice (radar-3: 85.5%, 30%). A third split, fitted
on the newer tokens and tested on the older ones, gives 75.0% median error (radar-3:
89.3%). Across live tokens the market-cap / TVL ratio spans 0.0003 to 400, so any TVL-only
curve is a rough anchor: the checks state how rough, and the board uses the curve to rank,
not to predict a price. The dashboard states both checks on every view.

**What the board leaves out, and why.** Protocols above the watchlist floor that the
watchlist rule leaves out are, in this snapshot, wrapped, staked or bridged products of a
token that already trades (WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in
Binance's staking product), or products of another protocol the snapshot does not name a
parent for. They are not protocols still waiting on a launch of their own. Below the floor
the same receipt-like protocols stay in, priced by their category's fitted shift: a small
liquid-staking or bridge protocol can still launch a governance token of its own.

**The snapshot's limit.** "No token" means the snapshot records none. A protocol may have a
token the index does not record; that is the snapshot's limit, not this radar's. The
dashboard states it.

## Top 10

| Rank | Protocol | Category | TVL | Implied value | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | Steakhouse Financial | Risk Curators | $2.75B | $70.0M | Largest TVL on the board; 11 chains (1.2×); curve multiple 0.024×. |
| 2 | Gauntlet | Risk Curators | $1.58B | $58.6M | Second-largest TVL; +5.6% in 7 days; 14 chains; Farm now. |
| 3 | Veda | Onchain Capital Allocator | $1.56B | $54.4M | Third-largest TVL; 13 chains; 632 days with no token. |
| 4 | USDD | CDP | $1.06B | $43.5M | Fourth-largest TVL; a core protocol token on the curve. |
| 5 | Upshift | Onchain Capital Allocator | $499M | $40.4M | +8.3% in 7 days; 710 days with no token; Farm now. |
| 6 | Plume Vaults | RWA | $212M | $31.4M | RWA shift ×1.25; 749 days with no token; 5 chains. |
| 7 | OpenTrade | RWA | $242M | $30.2M | RWA shift ×1.25; 708 days with no token. |
| 8 | OnRe | RWA | $309M | $26.3M | RWA shift ×1.25; Farm now. |
| 9 | Lofty | RWA | $101M | $24.0M | Smallest TVL in the top 10; 1,563 days with no token — the curve, not size, puts it here. |
| 10 | Symbiotic | Collateral Markets | $254M | $22.6M | 886 days with no token; −12% in 7 days trims it. |

The top five are still the five largest TVLs — a 2–11× size gap no honest curve
bridges — but the board no longer tracks TVL order: Spearman correlation between implied
rank and TVL rank is 0.772 (radar-3: 0.827, radar-2: 0.954), the top 10 swaps two members
(Lofty enters at #9; Bittensor dTAO leaves), and only 7 of the top 10 are top-10 by TVL.
The early story lives below the floor — see the dashboard's **Early finds** view, where
Shift DeFi leads at +4,448% in seven days, 45 days old.

## The dashboard

`dashboard/` is a static page (no framework, no network): the board with a top-three
spotlight, search, category and chain filters, a watchlist/early scope toggle and sortable
columns; an **Early finds** view ranked by momentum (fastest seven-day growth, youngest on
a tie); a **Live tokens** view; a **Model & method** view with the formula, the size curve
and its table, the category shifts, both out-of-sample checks, the exclusions, and a
sandbox that re-ranks the board live as you change the curve scale, the growth weight and
the two factors. A two-check strip sits under the lede on every view. Every row opens a
detail drawer with its verdict and signal chips, why it ranks where it does, the model's
full factor breakdown as a table (TVL → size curve → growth → maturity → chain → category
shift → implied value, each step with its running value, recomputed in the page and checked
against `board.json`), and a seven-step farm plan with cost and time per step — including
a week-one, day-by-day schedule — plus a setup budget line (capital + gas), derived from
the protocol's own category, chains, TVL and age.

## Build, check, grade

Node 22, standard library only.

```sh
# Build the output (board.json, data.js, dashboard/, screenshots/, dossier.json)
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

# The local gate: the kit's seven rows, plus determinism (two runs, identical bytes)
node scripts/gate.mjs --input <snapshot.json>

# The parity check: dashboard/app.js must derive the same implied values and farm steps
# as lib/model.ts, for every board row
node tests/parity.mjs --input <snapshot.json>

# Screenshots (needs Playwright; 1440x900, board / detail drawer / Early finds)
NODE_PATH=<playwright node_modules> node scripts/shots.cjs --out screenshots --root out
```

`board.json` at the repo root is the generated artifact from the latest build (regenerate with
the build command above). The kit's snapshot and grader live outside this repo; nothing here
reads the network.

## Layout

```
main.ts                  the program (Node 22, stdlib only)
lib/model.ts             the radar-4 model, the board, the farm plans
vendor/makefun-board.ts  the kit's dossier library (verbatim)
dashboard/               the static page: index.html, app.css, app.js
screenshots/             1-board.png, 2-detail.png, 3-filtered.png (1440x900)
scripts/gate.mjs         the local gate (the kit's seven rows + determinism)
scripts/shots.cjs        the screenshot + smoke-test script (Playwright)
tests/parity.mjs         page-vs-model parity, every board row
board.json               the generated board (226 rows)
```
