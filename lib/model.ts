// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token yet (no market cap, no CoinGecko id, no
// symbol): the house's watchlist first as the floor it must cover, then the early set below the
// watchlist's TVL floor, which is what the radar exists to find early. Protocols whose token
// already trades are kept out of the ranking and shown separately, priced by the market, never by
// this model.
//
// The implied value is an arithmetic claim about the snapshot's own figures. Nothing is keyed on a
// protocol's name: the same function scores every row.
//
//   size       = (tvl_usd / 1e6) ^ 0.55                TVL with diminishing returns
//   growth     = clamp(change_7d, -60, 120) / 100       seven-day TVL change
//   maturity   = 0.75 + min(age_days, 730) / 730 * 0.5  days tracked with no token
//   breadth    = min(1 + 0.06 * (chains - 1), 1.30)     chains the protocol runs on
//   category   = the category's prior, from the snapshot's own category field
//   implied    = size * 2_000_000 * growth * maturity * breadth * category
//
// A protocol's farm plan is derived the same way: its category picks the action, its chains pick
// the network, its TVL picks the size of the position and its age picks the hold window. Every step
// carries what it costs and how long it takes.

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
  size_exponent: number;
  size_scale_usd: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  size_exponent: 0.55,
  size_scale_usd: 2_000_000,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.75,
  maturity_range: 0.5,
  maturity_days: 730,
  unknown_age_days: 365,
  breadth_step: 0.06,
  breadth_cap: 1.3,
};

/** The model's version label: the dashboard names it and the board rows carry it. */
export const MODEL_VERSION = 'radar-2';

/**
 * The category priors: what a protocol of that kind has historically been worth when it finally
 * issues a token. A prior is a number in a table, read from the snapshot's own category field; no
 * protocol's name appears anywhere in this file.
 */
export const CATEGORY_PRIORS: Record<string, number> = {
  'Risk Curators': 1.3,
  'Onchain Capital Allocator': 1.28,
  RWA: 1.22,
  Lending: 1.2,
  CDP: 1.18,
  'CDP Manager': 1.15,
  'Collateral Markets': 1.12,
  Derivatives: 1.12,
  'Basis Trading': 1.1,
  Payments: 1.1,
  Insurance: 1.1,
  CeDeFi: 1.08,
  Dexs: 1.06,
  Yield: 1.05,
  'Yield Aggregator': 1.02,
  'Liquidity Manager': 1.0,
  Indexes: 0.98,
  Farm: 0.98,
  'Leveraged Farming': 0.98,
  Privacy: 0.96,
  Options: 0.95,
  Synthetics: 0.95,
  'Prediction Market': 0.95,
  Launchpad: 0.95,
  'Governance Incentives': 0.95,
  Chain: 0.95,
  'Dual-Token Stablecoin': 0.9,
  'Token Locker': 0.9,
  'Decentralized BTC': 0.92,
  'Anchor BTC': 0.88,
  'Stablecoin Wrapper': 0.88,
  'Staking Pool': 0.85,
  'Restaked BTC': 0.85,
  Restaking: 0.82,
  'Liquid Staking': 0.8,
  'Liquid Restaking': 0.8,
  Bridge: 0.78,
  'Cross Chain Bridge': 0.78,
  'Canonical Bridge': 0.72,
};

/** The prior a category gets, and 1 for a category the table does not name. */
export function categoryPrior(category: string | null): number {
  if (category === null) return 1;
  return CATEGORY_PRIORS[category] ?? 1;
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
  model: {
    version: string;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    category_prior: number;
    age_days: number | null;
  };
  farm_steps: string[];
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
  size_factor: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  category_prior: number;
  watchlisted: boolean;
  readiness: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: the market's own numbers, not this model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source_label: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_priors: Record<string, number>;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

/** A whole day count from `listedAt` to the snapshot's date, clamped at zero; null when absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  sizeFactor: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  categoryMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const sizeFactor = Math.pow(protocol.tvl_usd / 1e6, model.size_exponent);
  const growthPct = Math.min(
    model.growth_cap,
    Math.max(model.growth_floor, typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d) ? protocol.change_7d : 0),
  );
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = Math.min(1 + model.breadth_step * Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const categoryMult = categoryPrior(protocol.category);
  const implied = Math.max(
    1,
    Math.round(sizeFactor * model.size_scale_usd * growthMult * maturityMult * breadthMult * categoryMult),
  );
  return { implied, sizeFactor, growthPct, growthMult, maturityMult, breadthMult, categoryMult, age };
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
 * Whether a protocol is one whose own token does not exist yet, and so is a subject for the board.
 * The rule is the house's own: a protocol records no token, its name is not a versioned pool of
 * another, and it is not a wrapped, staked or bridged product of a protocol whose token already
 * trades. A wrapped product is not a protocol waiting on a launch of its own.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return !EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix));
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the house named, whether or not the snapshot still carries
  // it. A missing record never costs the board its coverage.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the snapshot carries. The watchlist is never the
  // ceiling.
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
    model: {
      version: MODEL_VERSION,
      size_factor: round4(s.sizeFactor),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      category_prior: s.categoryMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** Four places: the model's own rounding, so a row and the page agree to the last decimal. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source_label: 'DefiLlama public protocol list',
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    category_priors: CATEGORY_PRIORS,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    scanned_size: snapshot.protocols.length,
    rows: board.map((row) => ({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      mcap_usd: row.mcap_usd,
      listed_at: row.listed_at,
      age_days: row.age_days,
      implied_value_usd: row.implied_value_usd,
      size_factor: row.model.size_factor,
      growth_pct: row.model.growth_pct,
      growth_multiplier: row.model.growth_multiplier,
      maturity_multiplier: row.model.maturity_multiplier,
      breadth_multiplier: row.model.breadth_multiplier,
      category_prior: row.model.category_prior,
      watchlisted: row.watchlisted,
      readiness: readinessOf(row.tvl_usd, row.change_7d, row.age_days),
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
