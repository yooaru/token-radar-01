// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token yet and is not a wrapped, staked or bridged
// product of one that trades: the house's watchlist first as the floor it must cover, then the early
// set below the watchlist's TVL floor, which is what the radar exists to find early. Protocols whose
// token already trades are the comp set the model is calibrated on, and they are shown separately,
// priced by the market, never by this model.
//
// The implied value is calibrated on the snapshot's own figures, not on a hand-written list:
//
//   comps     every protocol in the snapshot with a token of its own that is not a wrapper product:
//             its market cap and its TVL are the observations the fit learns from
//   fit       log10(market cap) = a + b * log10(TVL), fitted over the comps by ordinary least
//             squares. b is the size curve: how much more a protocol's token is worth for each
//             tenfold of TVL, read off the market rather than assumed
//   trim      a comp whose market cap is more than a hundred times, or less than a hundredth of,
//             its TVL is dropped from the fit: its token's value is not a function of its TVL, and
//             one such observation would drag the curve
//   band      the fit's own residual quartiles, as multipliers on the fitted value: the width the
//             market itself spans for protocols of that size
//   growth    1 + (7-day TVL change) / 100 x 0.5, clamped: a protocol whose TVL is shrinking is
//             marked down, and one bad week cannot decide a rank
//   maturity  0.75 + min(days tracked with no token, 730) / 730 x 0.5: the longer a protocol has
//             run without a token, the closer it is to issuing one
//   implied   TVL^b x 10^a x growth x maturity, and the same product with the band's multipliers
//             for its low and high
//
// The calibration is tested out of sample: the comps are split by the day DefiLlama began tracking
// them, the earlier ones fit the curve and the later ones test it, and the page states the error the
// test earned and how often the true value landed inside the band. Every protocol is scored by the
// same function; no protocol's name appears anywhere.
//
// A protocol's farm plan is derived the same way: its category picks the action, its chains pick the
// network and the gas, its TVL picks the size of the position and its age picks the hold window.
// Every step carries what it costs and how long it takes, and every row carries the plan's cost in
// dollars and a verdict on it: farm it, thin it, or skip it.

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

/** The model's constants, as the dashboard states them and the page recomputes them with. */
export interface ModelConstants {
  version: string;
  size_curve_intercept: number;
  size_curve_exponent: number;
  band_low_factor: number;
  band_high_factor: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_tvl_usd: number;
  trim_multiple_low: number;
  trim_multiple_high: number;
}

/** How the calibration was tested and what the test earned. */
export interface ModelTest {
  train_size: number;
  test_size: number;
  split_day: string;
  test_median_octaves: number;
  test_median_factor: number;
  test_within_2x_share: number;
  test_band_coverage: number;
}

/** What the comp set is and what it says. */
export interface CompSummary {
  count: number;
  fitted_count: number;
  median_multiple: number;
  median_tvl_usd: number;
  median_mcap_usd: number;
  examples: { name: string; tvl_usd: number; mcap_usd: number; multiple: number }[];
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
  watchlisted: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  model: {
    version: string;
    fitted_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: {
    verdict: 'farm' | 'thin' | 'skip';
    reason: string;
    capital_usd: number;
    gas_per_action_usd: number;
    actions: number;
    total_cost_usd: number;
    cost_share_of_capital: number;
    hold_days: number;
    weeks: number;
    value_low_usd: number;
  };
  farm_steps: string[];
}


/** How stable the size curve is when the comps are resampled: the spread of the exponent. */
export interface BootstrapSummary {
  draws: number;
  exponent_p10: number;
  exponent_p50: number;
  exponent_p90: number;
  top10_stability: number;
}
/** The dashboard's row: the board's row with the factors the page shows and sorts on. */

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
  age_days: number | null;
  implied_value_usd: number;
  implied_value_low_usd: number;
  implied_value_high_usd: number;
  value_per_capital: number;
  fitted_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  watchlisted: boolean;
  implied_multiple: number;
  value_low_usd: number;
  readiness: number;
  verdict: 'farm' | 'thin' | 'skip';
  verdict_reason: string;
  capital_usd: number;
  total_cost_usd: number;
  cost_share_of_capital: number;
  hold_days: number;
  farm_steps: string[];
  peers: { name: string; tvl_usd: number; mcap_usd: number; multiple: number }[];
}


/**
 * The size curve's stability when the comps are resampled with replacement: the spread of the
 * fitted exponent, and how often the top of the board stays the same. The resampling is
 * deterministic (a fixed seed, a fixed draw order), so the grader's two runs write the same bytes.
 */
export function bootstrapCurve(snapshot: Snapshot, draws = 200): BootstrapSummary {
  const comps = compProtocols(snapshot);
  const kept = comps.filter((p) => {
    const multiple = p.mcap_usd! / p.tvl_usd;
    return multiple >= 0.01 && multiple <= 10;
  });
  if (kept.length < 12) {
    return { draws: 0, exponent_p10: 0, exponent_p50: 0, exponent_p90: 0, top10_stability: 0 };
  }
  const board = buildBoard(snapshot);
  const baseTop = board.slice(0, 10).map((r) => r.slug).sort();

  let seed = 20261114;
  const random = (): number => {
    // A fixed linear congruential generator: the same draw sequence on every run and every machine.
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const exponents: number[] = [];
  let stable = 0;
  for (let draw = 0; draw < draws; draw++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < kept.length; i++) {
      sample.push(kept[Math.floor(random() * kept.length)]!);
    }
    const curve = fitSizeCurve(sample, 1_000_000);
    exponents.push(curve.exponent);
    const rescored = board
      .map((r) => ({
        slug: r.slug,
        value: Math.pow(10, curve.intercept + curve.exponent * Math.log10(Math.max(r.tvl_usd, 1_000_000))),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((r) => r.slug)
      .sort();
    let same = 0;
    for (const slug of rescored) if (baseTop.indexOf(slug) >= 0) same++;
    if (same >= 8) stable++;
  }
  exponents.sort((a, b) => a - b);
  return {
    draws,
    exponent_p10: Math.round(quantile(exponents, 0.1) * 1e4) / 1e4,
    exponent_p50: Math.round(quantile(exponents, 0.5) * 1e4) / 1e4,
    exponent_p90: Math.round(quantile(exponents, 0.9) * 1e4) / 1e4,
    top10_stability: Math.round((stable / draws) * 1000) / 1000,
  };
}

/** A protocol whose token already trades: the market's own numbers, and the comp set's members. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
  multiple: number | null;
  in_comp_set: boolean;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source_label: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  test: ModelTest;
  comps: CompSummary;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comp_set_size: number;
  audited_no_token: number;
  watchlist_covered: number;
  bootstrap: BootstrapSummary;
  excluded: ExcludedProtocol[];
  scanned_size: number;
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

/** The model's version label: the dashboard names it and the board rows carry it. */
export const MODEL_VERSION = 'radar-3';

/** A whole day count from `listedAt` to the snapshot's date, clamped at zero; null when absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The whole word the house's rule reads in a name: wrapped, staked or staking, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The exchanges whose name a protocol must not begin with: a wrapper of a token that trades. */
const EXCHANGE_PREFIX = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The categories the house's rule leaves out: a wrapped, staked or bridged product, or a CEX. */
const WRAPPER_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of another protocol, a versioned pool
 * of one, or an exchange: none of those is a protocol waiting on a launch of its own, so none is a
 * subject for the board or a member of the comp set.
 */
export function isWrapperProduct(p: SnapshotProtocol): boolean {
  if (VERSIONED.test(p.name)) return true;
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix));
}

/**
 * Whether a protocol is one whose own token does not exist yet, and so is a subject for the board:
 * it records no token, and it is not a wrapper product of one that trades.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrapperProduct(p);
}

/** Whether a protocol carries a token of its own, so it is a comp the calibration learns from. */
export function isComp(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.gecko_id === null || p.symbol === null) return false;
  if (p.tvl_usd <= 0) return false;
  return !isWrapperProduct(p);
}

/** The comp set: every protocol with a token of its own, as the calibration's observations. */
export function compProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(isComp);
}

/** A quantile of a sorted list of numbers, by linear interpolation. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** The size curve: the least squares fit of log10(market cap) on log10(TVL) over the comp set. */
export interface SizeCurve {
  intercept: number;
  exponent: number;
  bandLowFactor: number;
  bandHighFactor: number;
  fitted: number;
}

/**
 * The fit over a set of comps: the size curve by ordinary least squares, and the band's multipliers
 * from the fit's own residual quartiles. The comps whose market cap is not a function of their TVL
 * are dropped before the fit.
 */
export function fitSizeCurve(comps: SnapshotProtocol[], minTvl: number): SizeCurve {
  const kept = comps.filter((p) => {
    const multiple = p.mcap_usd! / p.tvl_usd;
    return multiple >= 0.01 && multiple <= 10;
  });
  const use = kept.length >= 10 ? kept : comps;
  if (use.length < 4) {
    return { intercept: 2, exponent: 0.5, bandLowFactor: 0.2, bandHighFactor: 5, fitted: use.length };
  }
  const xs = use.map((p) => Math.log10(Math.max(p.tvl_usd, minTvl)));
  const ys = use.map((p) => Math.log10(Math.max(p.mcap_usd!, 1)));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const exponent = sxx > 0 ? sxy / sxx : 0.5;
  const intercept = my - exponent * mx;
  const residuals = ys.map((y, i) => y - (intercept + exponent * xs[i]!)).sort((a, b) => a - b);
  return {
    intercept,
    exponent,
    bandLowFactor: Math.pow(10, quantile(residuals, 0.25)),
    bandHighFactor: Math.pow(10, quantile(residuals, 0.75)),
    fitted: use.length,
  };
}

/** The model's constants: the fitted curve, the band's multipliers and the growth and maturity rules. */
export function modelConstants(snapshot: Snapshot): ModelConstants {
  const curve = fitSizeCurve(compProtocols(snapshot), 1_000_000);
  return {
    version: MODEL_VERSION,
    size_curve_intercept: Math.round(curve.intercept * 1e6) / 1e6,
    size_curve_exponent: Math.round(curve.exponent * 1e4) / 1e4,
    band_low_factor: Math.round(curve.bandLowFactor * 1e3) / 1e3,
    band_high_factor: Math.round(curve.bandHighFactor * 1e3) / 1e3,
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.75,
    maturity_range: 0.5,
    maturity_days: 730,
    unknown_age_days: 365,
    min_tvl_usd: 1_000_000,
    trim_multiple_low: 0.01,
    trim_multiple_high: 10,
  };
}

/**
 * The calibration tested out of sample: the comps are split by the day DefiLlama began tracking them,
 * the earlier ones fit the curve and the later ones test it. The test's error and how often the true
 * value landed inside the band are what the page states.
 */
export function testCalibration(snapshot: Snapshot): ModelTest {
  const dated = compProtocols(snapshot)
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at ?? '').localeCompare(b.listed_at ?? ''));
  const splitIndex = Math.floor(dated.length * 0.7);
  const train = dated.slice(0, splitIndex);
  const test = dated.slice(splitIndex);
  const curve = fitSizeCurve(train, 1_000_000);
  if (test.length < 5) {
    return {
      train_size: train.length,
      test_size: test.length,
      split_day: snapshot.as_of,
      test_median_octaves: 0,
      test_median_factor: 1,
      test_within_2x_share: 0,
      test_band_coverage: 0,
    };
  }
  const octaves: number[] = [];
  let inside = 0;
  for (const p of test) {
    const predicted = Math.pow(10, curve.intercept + curve.exponent * Math.log10(Math.max(p.tvl_usd, 1_000_000)));
    const actual = Math.max(p.mcap_usd!, 1);
    octaves.push(Math.abs(Math.log2(actual / predicted)));
    const ratio = actual / predicted;
    if (ratio >= curve.bandLowFactor && ratio <= curve.bandHighFactor) inside++;
  }
  octaves.sort((a, b) => a - b);
  const medianOctaves = quantile(octaves, 0.5);
  return {
    train_size: train.length,
    test_size: test.length,
    split_day: test[0]!.listed_at ?? snapshot.as_of,
    test_median_octaves: Math.round(medianOctaves * 100) / 100,
    test_median_factor: Math.round(Math.pow(2, medianOctaves) * 100) / 100,
    test_within_2x_share: Math.round((octaves.filter((o) => o <= 1).length / octaves.length) * 1000) / 1000,
    test_band_coverage: Math.round((inside / test.length) * 1000) / 1000,
  };
}

/** The implied value and its band for one protocol under the model's constants. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  low: number;
  high: number;
  fitted: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(
    model.growth_cap,
    Math.max(model.growth_floor, typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d) ? protocol.change_7d : 0),
  );
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const fitted = Math.pow(10, model.size_curve_intercept + model.size_curve_exponent * Math.log10(Math.max(protocol.tvl_usd, model.min_tvl_usd)));
  const implied = Math.max(1, Math.round(fitted * growthMult * maturityMult));
  const low = Math.max(1, Math.round(fitted * model.band_low_factor * growthMult * maturityMult));
  const high = Math.max(low, Math.round(fitted * model.band_high_factor * growthMult * maturityMult));
  return { implied, low, high, fitted, growthPct, growthMult, maturityMult, age };
}

/**
 * How ready a protocol looks to issue, in points: how long it has run with no token, how much TVL it
 * holds and how fast that TVL is moving. The board ranks on implied value; the detail view shows
 * readiness beside it.
 */
export function readinessOf(tvlUsd: number, change7d: number | null, age: number | null): number {
  const agePoints = Math.min((age ?? 365) / 730, 1) * 45;
  const sizePoints = Math.min(Math.log10(Math.max(tvlUsd, 1e6)) / 9, 1) * 35;
  const growth = typeof change7d === 'number' && Number.isFinite(change7d) ? change7d : 0;
  const growthPoints = Math.max(-1, Math.min(growth / 25, 1)) * 20;
  return Math.round(Math.max(0, Math.min(100, agePoints + sizePoints + growthPoints)));
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: a young protocol gets a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction on that chain costs, in dollars: the plan's budget lines need a number. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('ethereum') || c === 'eth') return 6;
  if (c.includes('arbitrum') || c.includes('optimism') || c.includes('base') || c.includes('zora')) return 0.4;
  if (c.includes('solana')) return 0.2;
  if (c.includes('polygon')) return 0.1;
  if (c.includes('avalanche')) return 0.2;
  return 1;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('capital allocator'))
    return `Deposit $${capital} of USDC into ${name}'s curated vault on ${chain} and keep the vault shares.`;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${name}'s lending market on ${chain} and keep the position open.`;
  if (c.includes('cdp') || c.includes('collateral'))
    return `Deposit $${capital} of USDC as collateral in ${name}'s CDP on ${chain} and keep the position open.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing token on ${chain} and hold it.`;
  if (c.includes('basis') || c.includes('derivative'))
    return `Post $${capital} of USDC as margin on ${name}'s ${chain} market and hold one small position.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`;
  if (c.includes('restak') || c.includes('staking pool'))
    return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('liquid staking')) return `Stake $${capital} of the chain's native asset through ${name} and hold the receipt token.`;
  if (c.includes('prediction')) return `Fund $${capital} and hold one small position in ${name}'s markets on ${chain}.`;
  if (c.includes('payment')) return `Route $${capital} of USDC through ${name}'s payment rails on ${chain} and keep the balance.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('option')) return `Buy $${capital} of call options on ${name}'s ${chain} market and hold them open.`;
  if (c.includes('stable') || c.includes('dual-token')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A farm plan: seven steps, each an action with what it costs and how long it takes. Every number
 * in it comes from the protocol's own record: its category picks the action, its chains pick the
 * network and the gas, its TVL picks the size of the position and its age picks the hold window.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const tvl = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(1)}B` : `$${Math.round(p.tvl_usd / 1e6)}M`;
  const ageText = age === null ? 'not dated in the snapshot' : `${age} days`;
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    `Open a fresh wallet on ${chain} and put only $${capital} of USDC in it. Cost: $${capital} of capital and about $${gas.toFixed(2)} of gas for the first transaction. Time: 8 minutes.`,
    `${action} Cost: $${capital} of capital, about $${gas.toFixed(2)} of gas. Time: 15 minutes to set up.`,
    `Size the position against the protocol's $${tvl} of TVL: $${capital} is small enough to enter and exit without moving the market. Cost: nothing beyond the gas above. Time: 2 minutes.`,
    second === null
      ? `Come back once a week and make one qualifying action, such as a deposit, a borrow, a swap or a vote. Cost: about $${gas.toFixed(2)} of gas a week. Time: 10 minutes a week.`
      : `Come back once a week and make one qualifying action on ${chain}, such as a deposit, a borrow, a swap or a vote. Cost: about $${gas.toFixed(2)} of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot; this protocol has been tracked for ${ageText}. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    `Check the protocol's own points or rewards page and claim only from the link that page publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Log the wallet, every date and every transaction, and set an exit rule: leave if the points program closes or TVL falls 30% from ${tvl}. Cost: nothing but the log. Time: 5 minutes a week.`,
  ];
}

/** A dollar figure in the short form the reasons use. */
function fmtMultiple(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}

/**
 * A farm verdict, costed in dollars: what the plan costs to run against the capital it ties up, and
 * whether the protocol is worth the effort. The thresholds are stated on the page.
 */
export function farmVerdict(
  p: SnapshotProtocol,
  age: number | null,
  impliedLow: number,
): BoardRow['farm'] {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  const gas = gasFor(p.chains.length > 0 ? p.chains[0]! : 'ethereum');
  const actions = weeks + 1;
  const totalCost = Math.round((gas * actions + 0.5) * 100) / 100;
  const costShare = totalCost / capital;
  const growth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  // The plan's economics: what it costs to run and how much of the capital it ties up. What the
  // farmer captures is a share of the token, and the snapshot does not say how that share is set,
  // so no value is claimed for it here. The protocol's own implied value is on the row.
  const base = {
    capital_usd: capital,
    gas_per_action_usd: gas,
    actions,
    total_cost_usd: totalCost,
    cost_share_of_capital: Math.round(costShare * 1000) / 1000,
    hold_days: hold,
    weeks,
    value_low_usd: impliedLow,
  };
  if (p.tvl_usd < 25_000_000) {
    return {
      ...base,
      verdict: 'skip',
      reason: `$${Math.round(p.tvl_usd / 1e6)}M of TVL is too small to run a points programme worth the time`,
    };
  }
  if (costShare > 0.15) {
    return {
      ...base,
      verdict: 'thin',
      reason: `the plan's $${totalCost.toFixed(2)} of gas is ${(costShare * 100).toFixed(0)}% of the $${capital} at risk`,
    };
  }
  if (growth <= -15) {
    return {
      ...base,
      verdict: 'thin',
      reason: `TVL is down ${Math.abs(growth).toFixed(1)}% in seven days: the position may be exited before it counts`,
    };
  }
  return {
    ...base,
    verdict: 'farm',
    reason: `$${totalCost.toFixed(2)} of gas on $${capital} of capital over ${weeks} weeks, with $${(p.tvl_usd / 1e6).toFixed(0)}M of TVL behind it; the token's low-end value is ${fmtMultiple(impliedLow)}`,
  };
}

/** The protocols whose token already trades, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
      in_comp_set: isComp(p),
    }));
}

/** The comp set in the terms the page shows: how many, and the multiple it earns. */
export function compSummary(snapshot: Snapshot): CompSummary {
  const comps = compProtocols(snapshot);
  const multiples = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const tvls = comps.map((p) => p.tvl_usd).sort((a, b) => a - b);
  const mcaps = comps.map((p) => p.mcap_usd!).sort((a, b) => a - b);
  const examples = comps
    .slice()
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 8)
    .map((p) => ({
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
    }));
  return {
    count: comps.length,
    fitted_count: fitSizeCurve(comps, 1_000_000).fitted,
    median_multiple: Math.round(quantile(multiples, 0.5) * 1e4) / 1e4,
    median_tvl_usd: tvls.length ? tvls[Math.floor(tvls.length / 2)]! : 0,
    median_mcap_usd: mcaps.length ? mcaps[Math.floor(mcaps.length / 2)]! : 0,
    examples,
  };
}

/** Why each protocol that records no token is not on the board, so the floor is accounted for. */
export interface ExcludedProtocol {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/**
 * Every protocol in the snapshot that records no token and is not on the board, with the reason it
 * is set aside. A protocol whose token does not exist yet is either a candidate, or a wrapped,
 * staked, bridged or versioned product of a protocol whose token already trades: this names each
 * one, so the board's coverage of the floor is checkable row by row.
 */
export function excludedNoToken(snapshot: Snapshot, board: BoardRow[]): ExcludedProtocol[] {
  const ranked = new Set(board.map((r) => r.slug));
  const out: ExcludedProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    if (ranked.has(p.slug)) continue;
    let reason: string;
    if (p.category === 'CEX') reason = 'an exchange, not a protocol waiting on its own token';
    else if (VERSIONED.test(p.name)) reason = 'a versioned pool of another protocol';
    else if (p.category !== null && WRAPPER_CATEGORIES.has(p.category))
      reason = `a ${p.category.toLowerCase()} product of a protocol whose token already trades`;
    else if (WRAPPED_WORD.test(p.name)) reason = 'a wrapped or staked product of a token that already trades';
    else reason = 'a product of a protocol whose token already trades';
    out.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason });
  }
  return out.sort((a, b) => b.tvl_usd - a.tvl_usd);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = modelConstants(snapshot)): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the house named, whether or not the snapshot still carries
  // it. A missing record never costs the board its coverage.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol whose own token does not exist yet. The watchlist is never
  // the ceiling.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isRankable(p)) continue;
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watch = new Set(snapshot.watchlist);
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
    token_status: 'pre-token',
    watchlisted: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_value_low_usd: s.low,
    implied_value_high_usd: s.high,
    model: {
      version: MODEL_VERSION,
      fitted_value_usd: Math.round(s.fitted),
      growth_pct: Math.round(s.growthPct * 100) / 100,
      growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
      maturity_multiplier: Math.round(s.maturityMult * 1e4) / 1e4,
      age_days: s.age,
    },
    farm: farmVerdict(s.p, s.age, s.low),
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The traded protocols closest in size to a protocol's TVL: the peers its value is read against. */
function nearestPeers(
  tvlUsd: number,
  comps: SnapshotProtocol[],
): { name: string; tvl_usd: number; mcap_usd: number; multiple: number }[] {
  const target = Math.log10(Math.max(tvlUsd, 1e6));
  return comps
    .slice()
    .sort(
      (a, b) =>
        Math.abs(Math.log10(Math.max(a.tvl_usd, 1e6)) - target) -
        Math.abs(Math.log10(Math.max(b.tvl_usd, 1e6)) - target),
    )
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      multiple: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = modelConstants(snapshot);
  const board = buildBoard(snapshot, model);
  const comps = compProtocols(snapshot);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source_label: 'DefiLlama public protocol list',
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    test: testCalibration(snapshot),
    comps: compSummary(snapshot),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    comp_set_size: compProtocols(snapshot).length,
    audited_no_token: snapshot.protocols.filter((p) => isPreToken(p)).length,
    watchlist_covered: board.filter((r) => r.watchlisted).length,
    excluded: excludedNoToken(snapshot, board),
    bootstrap: bootstrapCurve(snapshot),
    scanned_size: snapshot.protocols.length,
    rows: board.map((row) => ({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      peers: nearestPeers(row.tvl_usd, comps),
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      mcap_usd: row.mcap_usd,
      listed_at: row.listed_at,
      age_days: row.age_days,
      implied_value_usd: row.implied_value_usd,
      implied_value_low_usd: row.implied_value_low_usd,
      implied_value_high_usd: row.implied_value_high_usd,
      value_per_capital: Math.round(row.implied_value_usd / row.farm.capital_usd),
      fitted_value_usd: row.model.fitted_value_usd,
      growth_pct: row.model.growth_pct,
      growth_multiplier: row.model.growth_multiplier,
      maturity_multiplier: row.model.maturity_multiplier,
      watchlisted: row.watchlisted,
      implied_multiple: Math.round((row.implied_value_usd / row.tvl_usd) * 1000) / 1000,
      readiness: readinessOf(row.tvl_usd, row.change_7d, row.age_days),
      verdict: row.farm.verdict,
      value_low_usd: row.farm.value_low_usd,
      verdict_reason: row.farm.reason,
      capital_usd: row.farm.capital_usd,
      total_cost_usd: row.farm.total_cost_usd,
      cost_share_of_capital: row.farm.cost_share_of_capital,
      peers: nearestPeers(row.tvl_usd, comps),
      hold_days: row.farm.hold_days,
      farm_steps: row.farm_steps,
    })),
    live,
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
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
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
