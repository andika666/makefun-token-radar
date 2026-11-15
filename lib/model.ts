// The token radar's model, version radar-3: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// pre-token protocol below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values, never
// mixed into the ranked board.
//
// What the board leaves out, and why: protocols above the watchlist floor that the watchlist rule
// leaves out are, in this snapshot, wrapped, staked or bridged products of a token that already
// trades (WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking product) or
// products of another protocol the snapshot does not name a parent for. They are not protocols
// still waiting on a launch of their own, so the board does not rank them; the Live view shows the
// tokens that already trade. Below the floor the same receipt-like protocols stay in, discounted:
// a small liquid-staking or bridge protocol can still launch a governance token of its own, and
// the discount says its launch is worth less because the underlying already trades.
//
// Implied value is calibrated on the snapshot's own live tokens, never on a hardcoded multiple:
//
//   comps    = the market-cap / TVL ratio of every live-token protocol in the snapshot
//              (market cap present and positive, TVL positive, not an exchange),
//              winsorized to [0.02, 5] so one outlier cannot set the price
//   multiple = the per-category median ratio where the category has 5 or more live comps,
//              else the global median ratio across all live comps
//   discount = 1.0 where the category median is used (the market already priced the kind);
//              where the global median is used instead, the category table still applies:
//              a receipt token 0.6x, a stablecoin token 0.7x, a curator token 0.85x
//   growth   = clamp(change_7d, -50, 150) per cent
//   growthMult = 1 + (growth / 100) x 1.0              (spans 0.5 to 2.5)
//   maturity = 0.5 + min(age_days, 1095) / 1095 x 0.8  (spans 0.5 to 1.3; unknown age: 365)
//   chainMult  = 1 + 0.05 x min(chains - 1, 4)         (distribution breadth)
//   implied  = max(1, round(tvl_usd x multiple x growthMult x maturity x chainMult x discount))
//
// No protocol name is ever special-cased: the same function scores every row, and the multiple
// comes from the snapshot's own live tokens. The calibration is checked blind: the live tokens
// are split by a deterministic hash of the slug (80% fit, 20% test), the comps curve is fitted
// on the fit set only, and the test set's market caps are predicted from TVL x the category
// multiple. The dashboard states the result: the median absolute error and the share of
// predictions within twice the true market cap. A multiple is a market anchor for ranking, not
// a price prediction: across live tokens the market-cap / TVL ratio spans 0.0003 to 400, so any
// TVL-only multiple is rough, and the blind check says how rough.
//
// The constants are the radar-3 model's, stated in the dashboard and changeable in the model
// sandbox. The multiples are not constants: they are computed from the snapshot on every run.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_steps: number;
  winsor_low: number;
  winsor_high: number;
  min_category_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 1.0,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.5,
  maturity_range: 0.8,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.05,
  chain_max_steps: 4,
  winsor_low: 0.02,
  winsor_high: 5,
  min_category_comps: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One protocol's farm budget for setting the plan up: capital plus gas, from the same helpers. */
export interface FarmBudget {
  capital_usd: number;
  gas_usd: number;
  total_usd: number;
  chain: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comps_multiple: number;
    comps_source: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    category_multiplier: number;
    category_factor: string;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_budget: FarmBudget;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  comps_multiple: number;
  comps_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  category_multiplier: number;
  category_factor: string;
  farm_budget: FarmBudget;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's comps: its median market-cap / TVL ratio and how many live tokens set it. */
export interface CompsCategory {
  category: string;
  median: number;
  count: number;
}

/** The blind check's result: the comps curve fitted on one set, tested on the held-out set. */
export interface BlindValidation {
  fit_count: number;
  test_count: number;
  median_abs_pct_error: number;
  within_2x_count: number;
  within_2x_share: number;
}

/** Everything the dashboard needs: the board, the live set, the comps and the blind check. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps_global_median: number;
  comps_live_count: number;
  comps_categories: CompsCategory[];
  validation: BlindValidation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers; 0 for an empty list. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return s[(n - 1) / 2]!;
  return (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/**
 * The category factor: what kind of token this protocol could launch, as a multiplier on the
 * implied value. It applies only where the comps table has too few live tokens of the category
 * to price the kind itself; where the category median is used, the market already priced it and
 * this factor is 1. A receipt token is worth less because the asset it wraps already trades; a
 * curator's token is worth a little less because the curator earns fees on other protocols'
 * pools; a stablecoin's token is worth less because the stable asset itself carries the value.
 * Every other category scores 1.0. Categories, never names: the same table scores every row.
 */
export function categoryFactor(category: string | null): { factor: number; label: string } {
  const c = (category ?? '').toLowerCase();
  if (
    c === 'bridge' ||
    c === 'canonical bridge' ||
    c === 'cross chain bridge' ||
    c === 'liquid staking' ||
    c === 'liquid restaking' ||
    c === 'restaked btc' ||
    c === 'stablecoin wrapper' ||
    c === 'staking pool'
  ) {
    return { factor: 0.6, label: 'receipt token' };
  }
  if (c === 'stablecoin') return { factor: 0.7, label: 'stablecoin token' };
  if (c === 'risk curators' || c === 'onchain capital allocator') {
    return { factor: 0.85, label: 'curator token' };
  }
  return { factor: 1.0, label: 'core protocol token' };
}

/** The chain-breadth multiplier: more chains means wider distribution at launch. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, Math.min(chains.length - 1, model.chain_max_steps));
  return 1 + extra * model.chain_step;
}

/** The live-token protocols the comps are calibrated on: a market cap that exists, a TVL above zero, not an exchange. */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** The comps table: the global median ratio and one median per category. */
export interface CompsTable {
  global_median: number;
  global_count: number;
  by_category: Map<string, CompsCategory>;
}

export function buildCompsTable(live: SnapshotProtocol[], model: ModelConstants): CompsTable {
  const winsor = (r: number): number => Math.min(model.winsor_high, Math.max(model.winsor_low, r));
  const global_median = median(live.map((p) => winsor(p.mcap_usd! / p.tvl_usd)));
  const groups = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const arr = groups.get(key) ?? [];
    arr.push(winsor(p.mcap_usd! / p.tvl_usd));
    groups.set(key, arr);
  }
  const by_category = new Map<string, CompsCategory>();
  for (const [category, ratios] of groups) {
    by_category.set(category, { category, median: median(ratios), count: ratios.length });
  }
  return { global_median, global_count: live.length, by_category };
}

/**
 * The multiple one category is priced at: its own median market-cap / TVL ratio where the
 * category has enough live comps to price the kind, else the global median with the category
 * factor still applied, because a thin category's kind is not priced by its own market yet.
 */
export function multipleFor(
  category: string | null,
  table: CompsTable,
  model: ModelConstants,
): { multiple: number; source: string; category_multiplier: number; category_factor: string } {
  const key = category ?? 'Other';
  const entry = table.by_category.get(key);
  if (entry !== undefined && entry.count >= model.min_category_comps) {
    return {
      multiple: entry.median,
      source: `${key} median (${entry.count} live)`,
      category_multiplier: 1,
      category_factor: 'comps-calibrated',
    };
  }
  const { factor, label } = categoryFactor(category);
  return {
    multiple: table.global_median,
    source: `global median (${table.global_count} live)`,
    category_multiplier: factor,
    category_factor: label,
  };
}

/** The five factors and the implied value one protocol gets under `model` and `table`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: CompsTable,
  model: ModelConstants,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  compsMultiple: number;
  compsSource: string;
  categoryMult: number;
  categoryLabel: string;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = chainMultiplier(protocol.chains, model);
  const m = multipleFor(protocol.category, table, model);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * m.multiple * growthMult * maturityMult * chainMult * m.category_multiplier),
  );
  return {
    implied,
    growthPct,
    growthMult,
    maturityMult,
    chainMult,
    compsMultiple: m.multiple,
    compsSource: m.source,
    categoryMult: m.category_multiplier,
    categoryLabel: m.category_factor,
    age,
  };
}

/** A deterministic split of a string into [0, 1): FNV-1a, never random at runtime. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The blind check: the live comps are split by slug hash (80% fit, 20% test), the comps curve
 * is fitted on the fit set only, and each test protocol's market cap is predicted from its TVL
 * times the category multiple the fit set gives it. The median absolute error and the share of
 * predictions within twice the true market cap are the check's result.
 */
export function blindValidation(live: SnapshotProtocol[], model: ModelConstants): BlindValidation {
  const fit = live.filter((p) => slugHash(p.slug) < 0.8);
  const test = live.filter((p) => slugHash(p.slug) >= 0.8);
  const fitTable = buildCompsTable(fit, model);
  const errors: number[] = [];
  let within = 0;
  for (const p of test) {
    const m = multipleFor(p.category, fitTable, model);
    const predicted = p.tvl_usd * m.multiple * m.category_multiplier;
    const actual = p.mcap_usd!;
    errors.push((Math.abs(predicted - actual) / actual) * 100);
    if (predicted / actual >= 0.5 && predicted / actual <= 2) within++;
  }
  return {
    fit_count: fit.length,
    test_count: test.length,
    median_abs_pct_error: errors.length > 0 ? median(errors) : 0,
    within_2x_count: within,
    within_2x_share: test.length > 0 ? within / test.length : 0,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  table?: CompsTable,
): BoardRow[] {
  const comps = table ?? buildCompsTable(liveComps(snapshot), model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol below the watchlist floor. No cap: the board exists
  // to find them all, and the gate takes up to 4,000 rows. Never a replacement for a watchlist
  // row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, comps, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const wl = new Set(snapshot.watchlist);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: wl.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      comps_multiple: s.compsMultiple,
      comps_source: s.compsSource,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      category_multiplier: s.categoryMult,
      category_factor: s.categoryLabel,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
    farm_budget: farmBudget(s.p),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on the protocol's first chain, in the words a farmer budgets by. */
export function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $5 of gas';
  if (chain === 'Solana') return 'under $0.10 of gas';
  if (chain === 'Bitcoin' || chain === 'Hyperliquid L1') return 'about $2 of gas';
  return 'under $0.50 of gas';
}

/** The same gas in dollars, so the farm budget adds up: the words above, as numbers. */
export function gasUsdFor(chain: string): number {
  if (chain === 'Ethereum') return 5;
  if (chain === 'Solana') return 0.1;
  if (chain === 'Bitcoin' || chain === 'Hyperliquid L1') return 2;
  return 0.5;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** What setting the plan up costs: the capital plus gas for two transactions, the first funding and the main position. */
export function farmBudget(p: SnapshotProtocol): FarmBudget {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = 2 * gasUsdFor(chain);
  return { capital_usd: capital, gas_usd: gas, total_usd: capital + gas, chain };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} through its official bridge and use the chain's apps.`;
  if (c.includes('otc')) return `Fund $${capital} and place one quote request on ${name}.`;
  if (c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s main farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, by category: the habit that keeps the wallet in the snapshots. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis')) return 'Open and close one small trade each week so the wallet shows steady activity.';
  if (c.includes('dex') || c.includes('yield')) return 'Make one swap or adjust one pool position each week so the wallet shows steady activity.';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Adjust the position once a week, such as a top-up, a borrow or a repayment.';
  if (c.includes('bridge')) return 'Bridge a small amount each week so the wallet shows steady cross-chain activity.';
  if (c.includes('prediction')) return 'Place one small market position each week so the wallet shows steady activity.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL and age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under $3 of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    comps_multiple: row.model.comps_multiple,
    comps_source: row.model.comps_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    category_multiplier: row.model.category_multiplier,
    category_factor: row.model.category_factor,
    farm_budget: row.farm_budget,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const live = liveComps(snapshot);
  const table = buildCompsTable(live, model);
  const validation = blindValidation(live, model);
  const board = buildBoard(snapshot, model, table);
  const liveList = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const comps_categories = [...table.by_category.values()]
    .filter((c) => c.count >= model.min_category_comps)
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: liveList.length,
    comps_global_median: table.global_median,
    comps_live_count: table.global_count,
    comps_categories,
    validation,
    rows: board.map(radarRow),
    live: liveList,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
