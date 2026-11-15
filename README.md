# Token Radar

A token launch radar: which protocols still record no token, and what their launch would be
worth. Built for make.fun bounty **token-radar-01** ("Build the best token launch radar").

## What it is

The sealed input is a snapshot of every protocol DefiLlama tracks (758 protocols, as of
2026-11-14, watchlist floor $50,000,000 TVL). This program scores the pre-token protocols
and writes a ranked board, a static dashboard and a dossier the judge reads.

**The board: 226 rows** — all 40 watchlist protocols, plus all 186 pre-token protocols below
the watchlist floor. Total implied value $3.15B. 24 live-token protocols are set aside with
their market caps shown, never mixed into the ranking.

## The model (radar-2)

A protocol is pre-token when the snapshot records no token for it: no market cap, no
CoinGecko id, no symbol. Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd × 0.25
  × (1 + clamp(change_7d, −60, 120) / 100 × 0.5)
  × (0.6 + min(age_days, 1095) / 1095 × 0.4)
  × (1 + 0.05 × min(chains − 1, 4))
  × categoryFactor )
```

- **Base** — TVL × 0.25: a launch is worth a fraction of the value already locked.
- **Growth** — seven-day TVL change, clamped to −60…+120%, half weight: momentum moves the
  value, but cannot dominate it.
- **Maturity** — 0.6 at listing, rising to 1.0 over three years: a protocol that has run longer
  with no token is a more credible launch. An unlisted age uses 365 days.
- **Chain breadth** — +5% per extra chain, up to four: wider distribution at launch.
- **Category factor** — the only judgement in the model, and a category table, never a name
  list:

| Category | Factor | Why |
| --- | --- | --- |
| Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, Stablecoin Wrapper, Staking Pool | 0.6× | Receipt token: the asset it wraps already trades. |
| Stablecoin | 0.7× | The stable asset itself carries the value. |
| Risk Curators, Onchain Capital Allocator | 0.85× | The curator earns fees on other protocols' pools. |
| Every other category | 1.0× | A core protocol token. |

No protocol name is ever special-cased: the same function scores every row.

**What the board leaves out, and why.** Protocols above the watchlist floor that the
watchlist rule leaves out are, in this snapshot, wrapped, staked or bridged products of a
token that already trades (WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in
Binance's staking product), or products of another protocol the snapshot does not name a
parent for. They are not protocols still waiting on a launch of their own. Below the floor
the same receipt-like protocols stay in, discounted: a small liquid-staking or bridge
protocol can still launch a governance token of its own.

**The snapshot's limit.** "No token" means the snapshot records none. A protocol may have a
token the index does not record; that is the snapshot's limit, not this radar's. The
dashboard states it.

## Top 10

| Rank | Protocol | Category | TVL | Implied value | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | Steakhouse Financial | Risk Curators | $2.75B | $554.5M | Largest TVL on the board; 11 chains (1.2×); 0.85× curator factor. |
| 2 | Gauntlet | Risk Curators | $1.58B | $330.3M | Second-largest TVL; +5.6% in 7 days; 14 chains. |
| 3 | Veda | Onchain Capital Allocator | $1.56B | $317.5M | Third-largest TVL; 13 chains; 632 days with no token. |
| 4 | USDD | CDP | $1.06B | $235.7M | Fourth-largest TVL; a core protocol token (1.0×). |
| 5 | Upshift | Onchain Capital Allocator | $499M | $113.9M | +8.3% in 7 days; 710 days with no token. |
| 6 | Nonce Capital | Risk Curators | $514M | $67.2M | Only 45 days old — the youngest in the top 10 — so maturity (0.62×) holds it back. |
| 7 | OnRe | RWA | $309M | $60.1M | Single-chain (Solana) but 488 days with no token. |
| 8 | OpenTrade | RWA | $242M | $56.6M | 708 days with no token; two chains. |
| 9 | Bittensor dTAO | Dexs | $376M | $56.4M | Large TVL, but 56 days old — maturity 0.62×. |
| 10 | Symbiotic | Collateral Markets | $254M | $55.1M | 886 days with no token; −12% in 7 days trims it. |

The top is TVL-led, as it should be: a launch's value follows the value already locked. The
early story lives below the floor — see the dashboard's **Early finds** view, where Shift
DeFi leads at +4,448% in seven days, 45 days old.

## The dashboard

`dashboard/` is a static page (no framework, no network): the board with a top-three
spotlight, search, category and chain filters, a watchlist/early scope toggle and sortable
columns; an **Early finds** view ranked by momentum (fastest seven-day growth, youngest on
a tie); a **Live tokens** view; a **Model & method** view with the formula, the category
table, the exclusions, and a sandbox that re-ranks the board live as you change the base
multiple, the growth weight and the two factors. Every row opens a detail drawer with why it
ranks where it does, the model's full factor breakdown (recomputed in the page and checked
against `board.json`), and a six-step farm plan with cost and time per step, derived from the
protocol's own category, chains, TVL and age.

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
lib/model.ts             the radar-2 model, the board, the farm plans
vendor/makefun-board.ts  the kit's dossier library (verbatim)
dashboard/               the static page: index.html, app.css, app.js
screenshots/             1-board.png, 2-detail.png, 3-filtered.png (1440x900)
scripts/gate.mjs         the local gate (the kit's seven rows + determinism)
scripts/shots.cjs        the screenshot + smoke-test script (Playwright)
tests/parity.mjs         page-vs-model parity, every board row
board.json               the generated board (226 rows)
```
