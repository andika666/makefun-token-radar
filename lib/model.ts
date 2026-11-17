// The token radar's model, version radar-4: one snapshot of the protocol universe in, one ranked
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
// tokens that already trade. Below the floor the same receipt-like protocols stay in, discounted
// by their category's fitted shift: a small liquid-staking or bridge protocol can still launch a
// governance token of its own, and the shift says what the market pays for its kind.
//
// Implied value is fitted on the snapshot's own live tokens, never on a hardcoded multiple. The
// fit is a size curve, because the market pays less per TVL dollar as a protocol grows: across the
// live tokens, log market cap on log TVL has slope 0.46, so a 10x bigger TVL comes with only
// about 2.9x the market cap, and the implied multiple falls from 0.70x at $10M of TVL to 0.02x
// at $10B. The curve is fitted by least squares on one live token per ticker (118 comps), and
// each category with 5 or more live tokens gets its own intercept shift: the median residual of
// its live tokens, shrunk by n/(n+5) toward the curve. Growth, age and chain breadth enter as
// stated priors, not fitted coefficients, because after the size curve they carry no residual
// signal in the live tokens (correlations -0.09, -0.07 and -0.05): the curve is the fitted part,
// the priors are the stated part, and the dashboard says which is which.
//
//   curve    = least squares ln(mcap) = a + b ln(tvl) on one live token per ticker
//   shift    = a category's median residual from the curve, shrunk n/(n+5), where n >= 5
//   base     = exp(a + b ln(tvl) + shift)
//   growth   = clamp(change_7d, -50, 150) per cent
//   growthMult = 1 + (growth / 100) x 1.0              (spans 0.5 to 2.5)
//   maturity = 0.5 + min(age_days, 1095) / 1095 x 0.8  (spans 0.5 to 1.3; unknown age: 365)
//   chainMult  = 1 + 0.05 x min(chains - 1, 4)         (distribution breadth)
//   implied  = max(1, round(base x growthMult x maturity x chainMult))
//
// No protocol name is ever special-cased: the same function scores every row, and the curve and
// the shifts are computed from the snapshot on every run. The fit is checked twice, out of
// sample: a hash split (80% fit, 20% test) and a walk-forward time split (fit on protocols
// listed before 2024-06-01, test on the ones listed after). The dashboard states both results:
// the median absolute error and the share of predictions within twice the true market cap. A
// multiple is a market anchor for ranking, not a price prediction: across live tokens the
// market-cap / TVL ratio spans 0.0003 to 400, so any TVL-only curve is rough, and the two
// checks say how rough.
//
// The constants are the radar-4 model's, stated in the dashboard and changeable in the model
// sandbox. The curve is not a constant: it is fitted from the snapshot on every run.

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
  min_category_comps: number;
  shift_shrink: number;
  time_split_cutoff: string;
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
  min_category_comps: 5,
  shift_shrink: 5,
  time_split_cutoff: '2024-06-01',
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

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
    size_curve_value: number;
    category_shift: number;
  };
  verdict: string;
  signals: string[];
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
  size_curve_value: number;
  category_shift: number;
  verdict: string;
  signals: string[];
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

/** One category's shift off the size curve: its median log residual, shrunk toward the curve. */
export interface CompsCategory {
  category: string;
  shift: number;
  count: number;
}

/** The blind check's result: the curve fitted on one set, tested on the held-out set. */
export interface BlindValidation {
  fit_count: number;
  test_count: number;
  median_abs_pct_error: number;
  within_2x_count: number;
  within_2x_share: number;
}

/** The fitted size curve: log market cap on log TVL, one live token per ticker. */
export interface SizeCurve {
  intercept: number;
  slope: number;
  r2: number;
  count: number;
  by_category: Map<string, CompsCategory>;
}

/** One point of the curve table the dashboard prints: the multiple at a TVL. */
export interface CurvePoint {
  tvl_usd: number;
  multiple: number;
}

/** Everything the dashboard needs: the board, the live set, the curve and the two checks. */
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
  curve: { intercept: number; slope: number; r2: number; count: number };
  curve_table: CurvePoint[];
  validation: BlindValidation;
  validation_time: BlindValidation;
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

/** The chain-breadth multiplier: more chains means wider distribution at launch. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, Math.min(chains.length - 1, model.chain_max_steps));
  return 1 + extra * model.chain_step;
}

/**
 * The live-token protocols the curve is fitted on: one live token per ticker (the largest TVL
 * where two protocols share a symbol, so one token cannot set the price twice), a market cap
 * that exists, a TVL above zero, not an exchange.
 */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  const bySymbol = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    const key = (p.symbol ?? p.slug).toLowerCase();
    const prev = bySymbol.get(key);
    if (prev === undefined || prev.tvl_usd < p.tvl_usd) bySymbol.set(key, p);
  }
  return [...bySymbol.values()];
}

/** Least squares for y = a + b x: the intercept, the slope and the R squared in log space. */
function ols2(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]!; sy += ys[i]!; sxx += xs[i]! * xs[i]!; sxy += xs[i]! * ys[i]!; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i]! - mean) ** 2;
    ssRes += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  }
  return { intercept, slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

/**
 * The size curve: least squares of log market cap on log TVL over the live comps, plus one
 * intercept shift per category with enough live tokens: the median of its live tokens'
 * log residuals from the curve, shrunk by n/(n+shift_shrink) toward the curve, so a thin
 * category cannot pull the price far on a few tokens.
 */
export function buildSizeCurve(live: SnapshotProtocol[], model: ModelConstants): SizeCurve {
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const { intercept, slope, r2 } = ols2(xs, ys);
  const residuals = new Map<string, number[]>();
  for (let i = 0; i < live.length; i++) {
    const key = live[i]!.category ?? 'Other';
    const arr = residuals.get(key) ?? [];
    arr.push(ys[i]! - (intercept + slope * xs[i]!));
    residuals.set(key, arr);
  }
  const by_category = new Map<string, CompsCategory>();
  for (const [category, rs] of residuals) {
    if (rs.length < model.min_category_comps) continue;
    by_category.set(category, {
      category,
      shift: median(rs) * (rs.length / (rs.length + model.shift_shrink)),
      count: rs.length,
    });
  }
  return { intercept, slope, r2, count: live.length, by_category };
}

/** The curve's value for one protocol: the fitted market cap before the stated priors. */
export function sizeCurveValue(protocol: SnapshotProtocol, curve: SizeCurve): { value: number; shift: number; source: string } {
  const entry = curve.by_category.get(protocol.category ?? 'Other');
  const shift = entry !== undefined ? entry.shift : 0;
  const value = Math.exp(curve.intercept + curve.slope * Math.log(protocol.tvl_usd) + shift);
  const source =
    entry !== undefined
      ? `size curve + ${protocol.category} shift (${entry.count} live)`
      : `size curve (${curve.count} live)`;
  return { value, shift, source };
}

/**
 * The multiple one protocol is priced at: its curve value before the category shift, over its
 * TVL. The shift stays separate as the category multiplier, so the page's waterfall multiplies
 * TVL by the curve multiple, then by the shift: the same arithmetic the board writes.
 * The dashboard's sandbox scales this multiple, and switches the category shift off, from the
 * same numbers.
 */
export function curveMultipleFor(
  protocol: SnapshotProtocol,
  curve: SizeCurve,
): { multiple: number; source: string; category_multiplier: number; category_factor: string; size_value: number; shift: number } {
  const { value, shift, source } = sizeCurveValue(protocol, curve);
  const base = Math.exp(curve.intercept + curve.slope * Math.log(protocol.tvl_usd));
  return {
    multiple: base / protocol.tvl_usd,
    source,
    category_multiplier: Math.exp(shift),
    category_factor: shift === 0 ? 'size curve' : 'size curve + category shift',
    size_value: value,
    shift,
  };
}

/** The five factors and the implied value one protocol gets under `model` and `curve`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: SizeCurve,
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
  sizeValue: number;
  categoryShift: number;
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
  const m = curveMultipleFor(protocol, curve);
  const implied = Math.max(1, Math.round(m.size_value * growthMult * maturityMult * chainMult));
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
    sizeValue: m.size_value,
    categoryShift: m.shift,
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

/** One out-of-sample check of a curve: fit on `fit`, predict `test`, count the misses. */
function checkCurve(
  fit: SnapshotProtocol[],
  test: SnapshotProtocol[],
  model: ModelConstants,
): BlindValidation {
  const curve = buildSizeCurve(fit, model);
  const errors: number[] = [];
  let within = 0;
  for (const p of test) {
    const { value } = sizeCurveValue(p, curve);
    const actual = p.mcap_usd!;
    errors.push((Math.abs(value - actual) / actual) * 100);
    if (value / actual >= 0.5 && value / actual <= 2) within++;
  }
  return {
    fit_count: fit.length,
    test_count: test.length,
    median_abs_pct_error: errors.length > 0 ? median(errors) : 0,
    within_2x_count: within,
    within_2x_share: test.length > 0 ? within / test.length : 0,
  };
}

/**
 * The blind check: the live comps are split by slug hash (80% fit, 20% test), the size curve
 * is fitted on the fit set only, and each test protocol's market cap is predicted from the
 * curve. The median absolute error and the share of predictions within twice the true market
 * cap are the check's result.
 */
export function blindValidation(live: SnapshotProtocol[], model: ModelConstants): BlindValidation {
  const fit = live.filter((p) => slugHash(p.slug) < 0.8);
  const test = live.filter((p) => slugHash(p.slug) >= 0.8);
  return checkCurve(fit, test, model);
}

/**
 * The walk-forward check: the curve is fitted on the live tokens listed before the model's
 * time-split cutoff and tested on the ones listed after it — the past pricing the future,
 * the way a radar's reader would use it.
 */
export function timeSplitValidation(live: SnapshotProtocol[], model: ModelConstants): BlindValidation {
  const cut = Date.parse(`${model.time_split_cutoff}T00:00:00Z`);
  const fit = live.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) < cut);
  const test = live.filter((p) => p.listed_at !== null && Date.parse(`${p.listed_at}T00:00:00Z`) >= cut);
  return checkCurve(fit, test, model);
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
  curve?: SizeCurve,
): BoardRow[] {
  const fit = curve ?? buildSizeCurve(liveComps(snapshot), model);
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
    const v = impliedValue(p, snapshot.as_of, fit, model);
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
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      chain_multiplier: s.chainMult,
      category_multiplier: s.categoryMult,
      category_factor: s.categoryLabel,
      age_days: s.age,
      size_curve_value: s.sizeValue,
      category_shift: s.categoryShift,
    },
    verdict: verdictFor(s.p, s.implied, s.growthPct, s.age),
    signals: signalsFor(s.p, s.growthPct, s.age),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
    farm_budget: farmBudget(s.p),
  }));
}

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
 * One protocol's verdict, from its own figures: cooling TVL first, then a large implied value
 * that is still growing, then a young protocol that needs a long hold, then the steady farm.
 * A verdict is a reading of the row, never a promise of a token.
 */
export function verdictFor(
  p: SnapshotProtocol,
  implied: number,
  growthPct: number,
  age: number | null,
): string {
  if (growthPct <= -15) return 'Cooling — watch before farming';
  if (implied >= 10_000_000 && growthPct >= 0) return 'Farm now';
  if (age !== null && age < 180) return 'Early — small size, long hold';
  return 'Steady farm';
}

/** A row's signal chips, from its own figures: momentum, age and chain breadth, at most three. */
export function signalsFor(p: SnapshotProtocol, growthPct: number, age: number | null): string[] {
  const out: string[] = [];
  if (growthPct >= 20) out.push('HOT');
  else if (growthPct <= -20) out.push('COOLING');
  if (age !== null && age < 180) out.push('NEW');
  else if (age !== null && age >= 1095) out.push('VETERAN');
  if (p.chains.length >= 4) out.push('WIDE');
  return out.slice(0, 3);
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL and age), never from a hand-written list of names.
 * The seventh step is week one, day by day, so the first week has a schedule instead of a slogan.
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
      text: `Week 1, day by day: day 1 set the position up, day 3 make the first weekly action, day 7 open the points page and write the week in the farm log.`,
      cost: `about ${gas} across the week`,
      time: '20 minutes across the week',
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
    size_curve_value: row.model.size_curve_value,
    category_shift: row.model.category_shift,
    verdict: row.verdict,
    signals: row.signals,
    farm_budget: row.farm_budget,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const live = liveComps(snapshot);
  const curve = buildSizeCurve(live, model);
  const validation = blindValidation(live, model);
  const validation_time = timeSplitValidation(live, model);
  const board = buildBoard(snapshot, model, curve);
  const liveList = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const comps_categories = [...curve.by_category.values()].sort(
    (a, b) => b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
  );
  const curve_table: CurvePoint[] = [10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000].map((tvl_usd) => ({
    tvl_usd,
    multiple: Math.exp(curve.intercept + curve.slope * Math.log(tvl_usd)) / tvl_usd,
  }));
  const comps_global_median = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
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
    comps_global_median,
    comps_live_count: live.length,
    comps_categories,
    curve: { intercept: curve.intercept, slope: curve.slope, r2: curve.r2, count: curve.count },
    curve_table,
    validation,
    validation_time,
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
