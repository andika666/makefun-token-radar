# Token Radar

A token launch radar: which protocols still record no token, and what their launch would be
worth. Built for make.fun bounty **token-radar-01** ("Build the best token launch radar").

## What it is

The sealed input is a snapshot of every protocol DefiLlama tracks (758 protocols, as of
2026-11-14, watchlist floor $50,000,000 TVL). This program scores the pre-token protocols
and writes a ranked board, a static dashboard and a dossier the judge reads.

**The board: 226 rows** — all 40 watchlist protocols, plus all 186 pre-token protocols below
the watchlist floor. Total implied value $3.62B. 24 live-token protocols are set aside with
their market caps shown, never mixed into the ranking.

## The model (radar-3)

A protocol is pre-token when the snapshot records no token for it: no market cap, no
CoinGecko id, no symbol. Implied value is calibrated on the snapshot's own live tokens,
never on a hardcoded multiple:

```
comps    = market-cap / TVL of every live-token protocol in the snapshot
           (market cap present and positive, TVL positive, not an exchange),
           winsorized to [0.02, 5]
multiple = the per-category median ratio where the category has 5+ live comps,
           else the global median ratio (0.246x across 119 live tokens)
implied  = round( tvl_usd × multiple
  × (1 + clamp(change_7d, −50, 150) / 100 × 1.0)
  × (0.5 + min(age_days, 1095) / 1095 × 0.8)
  × (1 + 0.05 × min(chains − 1, 4))
  × categoryFactor )
```

- **Comps multiple** — the market's own pricing per kind of protocol. A launch is worth
  what live tokens of its kind trade at, per dollar of TVL: Dexs 0.342x (11 live),
  RWA 0.275x (9), Yield 0.191x (9), Lending 0.132x (15), Liquid Staking 0.041x (9),
  Canonical Bridge 0.746x (8), Basis Trading 0.654x (7), Bridge 0.557x (6).
  Where a category has fewer than 5 live tokens, the global median 0.246x is used instead.
- **Growth** — seven-day TVL change, clamped to −50…+150%, full weight: momentum moves the
  value, and a fast grower can outrank a larger flat protocol.
- **Maturity** — 0.5 at listing, rising to 1.3 over three years: a protocol that has run longer
  with no token is a more credible launch. An unlisted age uses 365 days.
- **Chain breadth** — +5% per extra chain, up to four: wider distribution at launch.
- **Category factor** — applies only where the global median is used, because a category
  median already prices the kind. A receipt token 0.6x, a stablecoin token 0.7x, a curator
  token 0.85x; every other category 1.0x. A category table, never a name list.

No protocol name is ever special-cased: the same function scores every row.

**The blind check.** The live tokens are split by a deterministic hash of the slug
(80% fit, 20% test); the comps curve is fitted on the fit set only, and each test
protocol's market cap is predicted from TVL × the category multiple. Fitted on 95 live
tokens, tested on 24 held out: median absolute error 77.7%, 33% of predictions within
twice the true market cap. Across live tokens the market-cap / TVL ratio spans 0.0003 to
400, so any TVL-only multiple is a rough anchor: the check states how rough, and the
board uses the multiple to rank, not to predict a price. The dashboard states the check
on every view.

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
| 1 | Steakhouse Financial | Risk Curators | $2.75B | $606.0M | Largest TVL on the board; 11 chains (1.2×); global median 0.246× with the 0.85× curator factor. |
| 2 | Gauntlet | Risk Curators | $1.58B | $375.0M | Second-largest TVL; +5.6% in 7 days; 14 chains. |
| 3 | Veda | Onchain Capital Allocator | $1.56B | $346.0M | Third-largest TVL; 13 chains; 632 days with no token. |
| 4 | USDD | CDP | $1.06B | $262.8M | Fourth-largest TVL; a core protocol token (1.0×). |
| 5 | Upshift | Onchain Capital Allocator | $499M | $138.2M | +8.3% in 7 days; 710 days with no token. |
| 6 | OpenTrade | RWA | $242M | $73.0M | RWA comps median 0.275×, above the global 0.246×; 708 days with no token. |
| 7 | OnRe | RWA | $309M | $72.8M | RWA median 0.275×; 488 days with no token. |
| 8 | Plume Vaults | RWA | $212M | $70.8M | RWA median 0.275×; 749 days with no token; 4 chains. |
| 9 | Bittensor dTAO | Dexs | $376M | $65.1M | Dexs median 0.342×, the highest of the big categories — but 56 days old, so maturity (0.54×) holds it back. |
| 10 | Symbiotic | Collateral Markets | $254M | $63.0M | 886 days with no token; −12% in 7 days trims it. |

The top five are still the five largest TVLs — a 2–11× size gap no honest multiplier
bridges — but the board no longer tracks TVL order: Spearman correlation between implied
rank and TVL rank is 0.827 (radar-2: 0.954), the top 10 swaps two members (OpenTrade and
Plume Vaults enter; Nonce Capital and RockawayX leave), and Nonce Capital, the #5 TVL,
falls to #11 because it is only 45 days old. The early story lives below the floor — see
the dashboard's **Early finds** view, where Shift DeFi leads at +4,448% in seven days,
45 days old.

## The dashboard

`dashboard/` is a static page (no framework, no network): the board with a top-three
spotlight, search, category and chain filters, a watchlist/early scope toggle and sortable
columns; an **Early finds** view ranked by momentum (fastest seven-day growth, youngest on
a tie); a **Live tokens** view; a **Model & method** view with the formula, the comps table,
the blind check, the exclusions, and a sandbox that re-ranks the board live as you change
the comps scale, the growth weight and the two factors. A blind-check strip sits under the
lede on every view. Every row opens a detail drawer with why it ranks where it does, the
model's full factor breakdown as a table (TVL → comps multiple → growth → maturity →
chain → category factor → implied value, each step with its running value, recomputed in
the page and checked against `board.json`), and a six-step farm plan with cost and time per
step plus a setup budget line (capital + gas), derived from the protocol's own category,
chains, TVL and age.

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
lib/model.ts             the radar-3 model, the board, the farm plans
vendor/makefun-board.ts  the kit's dossier library (verbatim)
dashboard/               the static page: index.html, app.css, app.js
screenshots/             1-board.png, 2-detail.png, 3-filtered.png (1440x900)
scripts/gate.mjs         the local gate (the kit's seven rows + determinism)
scripts/shots.cjs        the screenshot + smoke-test script (Playwright)
tests/parity.mjs         page-vs-model parity, every board row
board.json               the generated board (226 rows)
```
