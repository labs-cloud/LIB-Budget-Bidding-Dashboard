// unifiedTransform.ts — Pure transformers that turn the live ProjectSnapshot
// data into the shapes the unified Budget & Bidding dashboard renders.
// Everything here runs server-side and is passed to <UnifiedDashboard /> as
// plain JSON so the client component never re-fetches.

import {
  BiddingTask,
  BIDDING_STATUSES,
  BiddingStatus,
  BudgetTask,
  ProjectSnapshot,
  STATUS_CODE,
} from './clickup/types';
import { tradeKey } from './clickup/client';
import { computeUpdatedBudgets, resolveWinningBid } from './clickup/budgetAutomation';
import { MOCK_PROJECTS } from './clickup/mockData';
import { fmtUsd, daysSince } from './formatting';

// ClickUp workspace ID (constant — verified in AGENTS.md §3). Used to
// construct folder URLs; task URLs we always read from the API response.
const CLICKUP_WORKSPACE_ID = '9017603275';
function clickupFolderUrl(folderId: string): string {
  return `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}/v/o/f/${folderId}`;
}

// ----------------------------------------------------------------------------
// Public shape — everything the client component needs to render.
// ----------------------------------------------------------------------------

export type StatusCode = 'NS' | 'RS' | 'FU' | 'BR' | 'LV' | 'LP' | 'NR' | 'ND' | 'AW';
export type CostType = 'hard' | 'soft';

export interface UnifiedPortfolio {
  source: 'live' | 'mock';
  refreshedAt: number;
  refreshedAgo: string;
  warnings: string[];
  hero: {
    inFlight: number;
    activeProjects: number;
  };
  kpis: {
    inFlight: number; inFlightDelta: string;
    awaitingFollowUp: number; awaitingStale: number;
    readyToAward: number; readyDelta: string;
    tradeTypePending: number; tradeTypePendingProjects: number;
    syncIssues: number; syncProjects: number;
  };
  matrix: {
    projects: Array<{ folderId: string; name: string; url: string }>;
    rows: Array<{
      trade: string;
      cost: CostType;
      cells: Array<{ code: StatusCode | null; name: string | null; syncIssues: number }>;
    }>;
    distribution: Array<{ code: StatusCode; n: number }>;
    totalCells: number;
  };
  stale: Array<{
    sub: string;
    trade: string;
    project: string;
    projectFolderId: string;
    days: number;
    rfp: string;
    url: string;
  }>;
  gantt: Array<{
    cost: CostType;
    label: 'Soft Cost' | 'Hard Cost';
    count: string;
    rows: GanttRow[];
  }>;
  ganttAxis: {
    todayPct: number;
    ticks: Array<{ left: number; label: string; today?: boolean }>;
  };
  projects: UnifiedProject[];
}

export type GanttBarKind = 'in-flight' | 'in-flight stale' | 'awarded' | 'set';

export interface GanttRow {
  tagShort: 'SOFT' | 'HARD';
  name: string;
  barKind: GanttBarKind;
  left: number;
  width: number;
  span: string;
  pips: number;
  pillKind: GanttBarKind;
  pillText: string;
  sub: string;
}

export interface UnifiedProject {
  folderId: string;
  folderName: string;
  /** ClickUp folder URL — for the "Open in ClickUp" header button. */
  url: string;
  address: string | null;
  coord: { initials: string; name: string };
  projectId: string | null;
  phase: string;
  summary: {
    trades: number;
    awarded: number;
    bidding: number;
    set: number;
    updatedBudget: string;
    syncIssues: number;
  };
  rollup: {
    hardTrades: number; hardTotal: string;
    softTrades: number; softTotal: string;
    updated: string;
    allocated: string;
    variance: string;
    varianceKind: 'pos' | 'neg' | 'zero';
  };
  timeline: TimelineGroup[];
  inFlight: InFlightCard[];
  ptTrades: PtTrade[];
}

export type TimelineStat = 'aw' | 'lv' | 'rs' | 'fu' | 'br' | 'set';

export interface TimelineRow {
  stat: TimelineStat;
  tag: string;
  name: string;
  sub: string;
  amt: string | null;
  alloc: string;
  rfp: string | null;
  date: string;
  warn?: boolean;
  /** ClickUp URL for the relevant bid task (or budget task for Set rows). */
  url: string | null;
}

export interface TimelineGroup {
  group: 'awarded' | 'bidding' | 'set';
  label: string;
  sub: string;
  rows: TimelineRow[];
}

export interface InFlightCard {
  trade: string;
  sub: string;
  days: string;
  meta: string;
  crit?: boolean;
  url: string;
}

export interface PtSub {
  name: string;
  status: StatusCode;
  amount: number | null;
  isLow?: boolean;
  rfp: string;
  last: string;
  url: string;
}

export interface PtTrade {
  name: string;
  cost: CostType;
  tag: string;
  stage: string;
  syncStatus: 'ok' | 'warn' | 'error';
  syncIssues: string[];
  expectedBiddingCount: number;
  actualBiddingCount: number;
  updated: number;
  allocated: number;
  subs: (PtSub | null)[];
  /** ClickUp URL for the budget task (the trade row). */
  url: string;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const IN_FLIGHT_STATUSES: BiddingStatus[] = [
  'RFP Sent', 'Followed Up', 'Bid Received', 'Leveling', 'Leveled - Pending Review',
];

const STATUS_PRIORITY: BiddingStatus[] = [
  'Awarded', 'Leveling', 'Leveled - Pending Review', 'Bid Received',
  'Followed Up', 'Needs Rebid', 'RFP Sent', 'No Bid / Declined', 'Not Started',
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function bidsByTradeFor(snapshot: ProjectSnapshot): Map<string, BiddingTask[]> {
  const out = new Map<string, BiddingTask[]>();
  for (const b of snapshot.biddingTasks) {
    if (!b.trade) continue;
    const k = tradeKey(b.trade);
    const list = out.get(k) ?? [];
    list.push(b);
    out.set(k, list);
  }
  return out;
}

function shortTag(trade: string): string {
  const map: Record<string, string> = {
    'SOE & Foundation & Superstructure': 'SOE',
    'Foundation Waterproofing': 'FW',
    'Plumbing & Sprinkler': 'P&S',
    'Electrical': 'ELEC',
    'Scaffolding / Shed': 'SCF',
    'Live Security': 'SEC',
    'Rubbish Removal': 'RUB',
    'HVAC': 'HVAC',
    'Elevator': 'ELV',
    'Windows': 'WIN',
    'Roofing': 'ROOF',
    'Stucco': 'STC',
    'Fire Alarm': 'FA',
    'Kitchens': 'KIT',
    'Appliances': 'APP',
  };
  if (map[trade]) return map[trade];
  const initials = trade.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 4);
  return initials || trade.slice(0, 3).toUpperCase();
}

function fmtMonthDay(dateMs: number | null): string {
  if (dateMs == null || !Number.isFinite(dateMs) || dateMs <= 0) return '—';
  const d = new Date(dateMs);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function dateMsOf(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  const p = Date.parse(String(s));
  return Number.isFinite(p) ? p : null;
}

function rollupStatusForTrade(bids: BiddingTask[]): BiddingStatus | null {
  if (bids.length === 0) return null;
  for (const s of STATUS_PRIORITY) {
    if (bids.some((b) => b.status === s)) return s;
  }
  return null;
}

function relativeDays(days: number | null): string {
  if (days == null) return '—';
  if (days <= 1) return 'today';
  return `${days}d ago`;
}

// ----------------------------------------------------------------------------
// Portfolio transform
// ----------------------------------------------------------------------------

const TRADE_DISPLAY_ORDER = [
  'SOE & Foundation & Superstructure', 'Foundation Waterproofing', 'Plumbing & Sprinkler',
  'Electrical', 'Scaffolding / Shed', 'Live Security', 'Rubbish Removal', 'HVAC',
  'Elevator', 'Windows', 'Roofing', 'Stucco', 'Fire Alarm', 'Kitchens', 'Appliances',
];

const HARD_TRADES_FOR_COST = new Set([
  'SOE & Foundation & Superstructure', 'Foundation Waterproofing', 'Plumbing & Sprinkler',
  'Electrical', 'HVAC', 'Elevator', 'Windows', 'Roofing', 'Stucco', 'Fire Alarm',
  'Kitchens', 'Appliances',
]);

function costOf(trade: string): CostType {
  return HARD_TRADES_FOR_COST.has(trade) ? 'hard' : 'soft';
}

export function buildUnifiedPortfolio(input: {
  snapshots: ProjectSnapshot[];
  source: 'live' | 'mock';
  refreshedAt: number;
  warnings: string[];
}): UnifiedPortfolio {
  const { snapshots, source, refreshedAt, warnings } = input;

  // Project columns — alphabetical by full folder name. We use the verbatim
  // ClickUp folder name (e.g. "800 Brady Ave", "1931-1935 Bedford") so the
  // header is the canonical project identifier, copyable and screen-reader
  // friendly. Every folder under the Active Projects space appears as a
  // column; empty folders render as columns of "—" cells, signalling
  // "not yet in bidding" rather than being silently dropped.
  const projects = snapshots
    .slice()
    .sort((a, b) => a.folderName.localeCompare(b.folderName))
    .map((s) => ({
      folderId: s.folderId,
      name: s.folderName,
      url: clickupFolderUrl(s.folderId),
    }));

  // Build union of trade rows (canonical order, then extras alpha).
  const seenTrades = new Map<string, string>();
  for (const s of snapshots) {
    for (const b of s.budgetTasks) seenTrades.set(tradeKey(b.trade), b.trade);
    for (const g of s.tradeGroups) {
      if (!seenTrades.has(tradeKey(g.trade))) seenTrades.set(tradeKey(g.trade), g.trade);
    }
  }
  const orderedTrades: string[] = [];
  const taken = new Set<string>();
  for (const t of TRADE_DISPLAY_ORDER) {
    const k = tradeKey(t);
    if (seenTrades.has(k) && !taken.has(k)) {
      orderedTrades.push(seenTrades.get(k) as string);
      taken.add(k);
    }
  }
  for (const [k, name] of Array.from(seenTrades.entries()).sort((a, b) => a[1].localeCompare(b[1]))) {
    if (!taken.has(k)) {
      orderedTrades.push(name);
      taken.add(k);
    }
  }

  // Index snapshots by folderId in the projects order.
  const snapByFolder = new Map(snapshots.map((s) => [s.folderId, s]));

  // Compute matrix cells.
  const rows = orderedTrades.map((trade) => {
    const k = tradeKey(trade);
    const cells = projects.map((p) => {
      const snap = snapByFolder.get(p.folderId);
      if (!snap) return { code: null, name: null, syncIssues: 0 };
      const tradeBids = snap.biddingTasks.filter((b) => b.trade && tradeKey(b.trade) === k);
      const group = snap.tradeGroups.find((g) => tradeKey(g.trade) === k);
      const budgetTask = snap.budgetTasks.find((bt) => tradeKey(bt.trade) === k);
      const syncIssues = budgetTask?.syncIssues.length ?? 0;
      const statuses = tradeBids.map((b) => b.status);
      if (statuses.length === 0 && group) statuses.push(group.status);
      const winning = STATUS_PRIORITY.find((s) => statuses.includes(s));
      if (!winning) return { code: null, name: null, syncIssues };
      return { code: STATUS_CODE[winning] as StatusCode, name: winning, syncIssues };
    });
    return { trade, cost: costOf(trade), cells };
  });
  // Drop trade rows with no real cells or sync warnings anywhere.
  const filteredRows = rows.filter((r) => r.cells.some((c) => c.code != null || c.syncIssues > 0));

  // KPIs.
  let inFlight = 0;
  let awaitingFollowUp = 0;
  let awaitingStale = 0;
  let readyToAward = 0;
  for (const r of filteredRows) {
    for (const c of r.cells) {
      if (!c.name) continue;
      if (IN_FLIGHT_STATUSES.includes(c.name as BiddingStatus)) inFlight += 1;
      if (c.name === 'RFP Sent' || c.name === 'Followed Up') awaitingFollowUp += 1;
      if (c.name === 'Leveled - Pending Review') readyToAward += 1;
    }
  }
  // Stale awaiting follow-up: RFP Sent bids whose dateUpdated > 7 days ago.
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (b.status === 'RFP Sent') {
        const d = daysSince(b.dateUpdated);
        if (d != null && d > 7) awaitingStale += 1;
      }
    }
  }
  // Trade Type pending — setup work, not a broken sync. Count both blank and
  // explicit Pending values so the dashboard shows how much Budget setup is
  // still waiting before Bidding automation should be expected.
  let tradeTypePending = 0;
  const pendingProjects = new Set<string>();
  for (const s of snapshots) {
    for (const bt of s.budgetTasks) {
      if (bt.tradeType != null && bt.tradeType !== 'Pending') continue;
      tradeTypePending += 1;
      pendingProjects.add(s.folderId);
    }
  }
  const syncIssues = snapshots.reduce((sum, s) => sum + s.syncHealth.total, 0);
  const syncProjects = snapshots.filter((s) => s.syncHealth.total > 0).length;

  // Stale follow-up list — top 5 oldest RFP-sent or followed-up bids across all projects.
  const projectNameById = new Map(snapshots.map((s) => [s.folderId, s.folderName]));
  const staleAll: UnifiedPortfolio['stale'] = [];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (!IN_FLIGHT_STATUSES.includes(b.status)) continue;
      const d = daysSince(b.dateUpdated);
      if (d == null || d < 7) continue;
      staleAll.push({
        sub: b.subcontractor || '(no name)',
        trade: b.trade ?? 'Unknown trade',
        project: projectNameById.get(s.folderId) ?? '',
        projectFolderId: s.folderId,
        days: d,
        rfp: fmtMonthDay(dateMsOf(b.dateUpdated)),
        url: b.url,
      });
    }
  }
  staleAll.sort((a, b) => b.days - a.days);

  // Distribution.
  const distCounts = new Map<StatusCode, number>();
  let totalCells = 0;
  for (const r of filteredRows) {
    for (const c of r.cells) {
      if (!c.code) continue;
      distCounts.set(c.code, (distCounts.get(c.code) ?? 0) + 1);
      totalCells += 1;
    }
  }
  const distOrder: StatusCode[] = ['AW', 'LP', 'LV', 'BR', 'FU', 'RS', 'NS', 'NR', 'ND'];
  const distribution = distOrder
    .filter((k) => (distCounts.get(k) ?? 0) > 0)
    .map((k) => ({ code: k, n: distCounts.get(k)! }));

  // Portfolio gantt — per trade aggregate timeline (oldest start → newest activity).
  const gantt = buildPortfolioGantt(filteredRows.map((r) => r.trade), snapshots);
  const ganttAxis = buildGanttAxis(snapshots);

  // Per-project transforms.
  const projectTransforms = projects.map((p) => transformProject(snapByFolder.get(p.folderId)!));

  // Hero refresh string.
  const sec = Math.max(1, Math.floor((Date.now() - refreshedAt) / 1000));
  const refreshedAgo = sec < 90 ? `${sec}s ago` : `${Math.round(sec / 60)}m ago`;

  return {
    source,
    refreshedAt,
    refreshedAgo,
    warnings,
    hero: { inFlight, activeProjects: snapshots.length },
    kpis: {
      inFlight, inFlightDelta: 'across all trades',
      awaitingFollowUp, awaitingStale,
      readyToAward, readyDelta: 'leveled · pending review',
      tradeTypePending, tradeTypePendingProjects: pendingProjects.size,
      syncIssues, syncProjects,
    },
    matrix: { projects, rows: filteredRows, distribution, totalCells },
    stale: staleAll.slice(0, 5),
    gantt,
    ganttAxis,
    projects: projectTransforms,
  };
}

// ----------------------------------------------------------------------------
// Portfolio gantt: per-trade aggregated bar across all projects.
// ----------------------------------------------------------------------------

function buildPortfolioGantt(trades: string[], snapshots: ProjectSnapshot[]): UnifiedPortfolio['gantt'] {
  // Window: earliest bid dateUpdated → latest, plus a small tail. Falls back
  // to the last 90 days if there's no signal.
  const allDates: number[] = [];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      const d = dateMsOf(b.dateUpdated);
      if (d != null) allDates.push(d);
    }
  }
  const now = Date.now();
  const minD = allDates.length > 0 ? Math.min(...allDates) : now - 90 * 86_400_000;
  const maxD = allDates.length > 0 ? Math.max(...allDates, now) : now;
  const start = minD;
  const end = Math.max(maxD, now + 14 * 86_400_000);
  const span = Math.max(1, end - start);

  const pctOf = (ms: number) => Math.max(0, Math.min(100, ((ms - start) / span) * 100));

  const soft: GanttRow[] = [];
  const hard: GanttRow[] = [];
  for (const trade of trades) {
    const k = tradeKey(trade);
    const tradeBids: BiddingTask[] = [];
    for (const s of snapshots) {
      for (const b of s.biddingTasks) if (b.trade && tradeKey(b.trade) === k) tradeBids.push(b);
    }
    if (tradeBids.length === 0) continue;

    const datesForTrade = tradeBids.map((b) => dateMsOf(b.dateUpdated)).filter((d): d is number => d != null);
    const tradeMin = datesForTrade.length > 0 ? Math.min(...datesForTrade) : start;
    const tradeMax = datesForTrade.length > 0 ? Math.max(...datesForTrade) : now;
    const left = pctOf(tradeMin);
    const right = pctOf(tradeMax);
    const width = Math.max(2, right - left);

    const inFlightCount = tradeBids.filter((b) => IN_FLIGHT_STATUSES.includes(b.status)).length;
    const awardedCount = tradeBids.filter((b) => b.status === 'Awarded').length;
    const allAwarded = inFlightCount === 0 && awardedCount > 0;
    // "Set" classification: every trade-group says all bidding is closed
    // because there are no live bids. We approximate with: no biddable bids
    // ever produced an amount → treat as set when no in-flight + no awarded
    // amount.
    const isSet = inFlightCount === 0 && awardedCount === 0;
    const stale = tradeBids.some((b) => {
      if (!IN_FLIGHT_STATUSES.includes(b.status)) return false;
      const d = daysSince(b.dateUpdated);
      return d != null && d > 10;
    });
    const barKind: GanttBarKind = allAwarded
      ? 'awarded'
      : isSet
        ? 'set'
        : stale
          ? 'in-flight stale'
          : 'in-flight';
    const pillKind = barKind;
    const oldestInFlight = tradeBids
      .filter((b) => IN_FLIGHT_STATUSES.includes(b.status))
      .map((b) => daysSince(b.dateUpdated))
      .filter((d): d is number => d != null)
      .sort((a, b) => b - a)[0];
    const pillText = allAwarded
      ? `${awardedCount} awarded`
      : isSet
        ? `${tradeBids.length} set`
        : stale
          ? `${oldestInFlight ?? '?'}d · stale`
          : `${oldestInFlight ?? 0}d · in flight`;
    const subText = allAwarded
      ? 'complete'
      : isSet
        ? 'no bidding'
        : `${inFlightCount} in flight`;

    const spanLabel = `${fmtMonthDay(tradeMin)} → ${fmtMonthDay(tradeMax)}${isSet ? ' · SET' : ''}`;
    const pips = Math.min(3, Math.max(1, Math.ceil(tradeBids.length / 4)));

    const tag = costOf(trade);
    const row: GanttRow = {
      tagShort: tag === 'hard' ? 'HARD' : 'SOFT',
      name: trade, barKind, left, width, span: spanLabel, pips,
      pillKind, pillText, sub: subText,
    };
    if (tag === 'soft') soft.push(row); else hard.push(row);
  }

  const groups: UnifiedPortfolio['gantt'] = [];
  if (soft.length > 0) groups.push({ cost: 'soft', label: 'Soft Cost', count: `${soft.length} trades`, rows: soft });
  if (hard.length > 0) groups.push({ cost: 'hard', label: 'Hard Cost', count: `${hard.length} trades`, rows: hard });
  return groups;
}

function buildGanttAxis(snapshots: ProjectSnapshot[]): UnifiedPortfolio['ganttAxis'] {
  const allDates: number[] = [];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      const d = dateMsOf(b.dateUpdated);
      if (d != null) allDates.push(d);
    }
  }
  const now = Date.now();
  const start = allDates.length > 0 ? Math.min(...allDates) : now - 90 * 86_400_000;
  const end = Math.max(allDates.length > 0 ? Math.max(...allDates, now) : now, now + 14 * 86_400_000);
  const span = Math.max(1, end - start);
  const todayPct = ((now - start) / span) * 100;

  // 8 evenly-spaced ticks (mark today with the closest one).
  const ticks: Array<{ left: number; label: string; today?: boolean }> = [];
  for (let i = 0; i < 8; i += 1) {
    const left = (i / 7) * 100;
    const ms = start + (left / 100) * span;
    ticks.push({ left, label: fmtMonthDay(ms) });
  }
  // Insert the today tick (replace nearest if within 4%).
  let nearest = 0;
  let nearestDist = Math.abs(todayPct - ticks[0].left);
  for (let i = 1; i < ticks.length; i += 1) {
    const d = Math.abs(todayPct - ticks[i].left);
    if (d < nearestDist) { nearest = i; nearestDist = d; }
  }
  if (nearestDist < 4) {
    ticks[nearest] = { left: todayPct, label: fmtMonthDay(now), today: true };
  } else {
    ticks.push({ left: todayPct, label: fmtMonthDay(now), today: true });
    ticks.sort((a, b) => a.left - b.left);
  }
  return { todayPct, ticks };
}

// ----------------------------------------------------------------------------
// Project transform: one snapshot → all four shapes for the project shell.
// ----------------------------------------------------------------------------

function transformProject(snapshot: ProjectSnapshot): UnifiedProject {
  const bidsByTrade = bidsByTradeFor(snapshot);
  const computed = computeUpdatedBudgets(snapshot);
  const computedById = new Map(computed.map((c) => [c.budgetTaskId, c]));

  // Counts.
  const trades = snapshot.budgetTasks.length;
  let awardedCount = 0;
  let biddingCount = 0;
  let setCount = 0;
  for (const bt of snapshot.budgetTasks) {
    if (bt.tradeType === 'Set') { setCount += 1; continue; }
    const bids = bidsByTrade.get(tradeKey(bt.trade)) ?? [];
    if (bids.some((b) => b.status === 'Awarded')) awardedCount += 1;
    else if (bids.some((b) => IN_FLIGHT_STATUSES.includes(b.status))) biddingCount += 1;
  }

  const updatedTotal = computed.reduce((sum, r) => sum + (r.nextUpdated ?? 0), 0);
  const allocatedTotal = snapshot.budgetTasks.reduce((sum, b) => sum + (b.budgetAllocated ?? 0), 0);

  // Cost-type rollup.
  let hardSum = 0; let hardTrades = 0;
  let softSum = 0; let softTrades = 0;
  for (const bt of snapshot.budgetTasks) {
    const v = computedById.get(bt.id)?.nextUpdated ?? bt.updatedBudget ?? bt.budgetAllocated ?? 0;
    if (bt.costType === 'Hard') { hardSum += v; hardTrades += 1; }
    else { softSum += v; softTrades += 1; }
  }
  const variance = updatedTotal - allocatedTotal;
  const varianceKind: 'pos' | 'neg' | 'zero' = variance === 0 ? 'zero' : variance < 0 ? 'pos' : 'neg';

  // Timeline groups.
  type Row = TimelineRow & { sortKey: number; sumDollars: number };
  const awarded: Row[] = [];
  const bidding: Row[] = [];
  const set: Row[] = [];
  for (const bt of snapshot.budgetTasks) {
    const bids = bidsByTrade.get(tradeKey(bt.trade)) ?? [];
    const winner = resolveWinningBid(bids);
    const updatedAmt = computedById.get(bt.id)?.nextUpdated ?? null;
    const allocLabel = fmtUsd(bt.budgetAllocated);
    const tag = shortTag(bt.trade);

    if (bt.tradeType === 'Set') {
      const winningSub = bids.find((b) => b.status === 'Awarded') ?? bids[0];
      const dateMs = dateMsOf(winningSub?.awardDate) ?? dateMsOf(winningSub?.dateUpdated);
      const dollars = updatedAmt ?? bt.budgetAllocated ?? 0;
      set.push({
        stat: 'set', tag, name: bt.trade,
        sub: winningSub?.subcontractor ?? '(direct)',
        amt: fmtUsd(dollars), alloc: allocLabel,
        rfp: null,
        date: `Set · ${fmtMonthDay(dateMs)} · no bidding`,
        sortKey: dateMs ?? 0,
        sumDollars: dollars,
        url: winningSub?.url ?? bt.url,
      });
      continue;
    }

    const awardedBid = bids.find((b) => b.status === 'Awarded');
    if (awardedBid) {
      const dateMs = dateMsOf(awardedBid.awardDate) ?? dateMsOf(awardedBid.dateUpdated);
      awarded.push({
        stat: 'aw', tag, name: bt.trade,
        sub: awardedBid.subcontractor,
        amt: fmtUsd(awardedBid.bidAmount), alloc: allocLabel,
        rfp: fmtMonthDay(dateMsOf(awardedBid.dateUpdated)),
        date: `Awarded · ${fmtMonthDay(dateMs)}`,
        sortKey: dateMs ?? 0,
        sumDollars: awardedBid.bidAmount ?? 0,
        url: awardedBid.url,
      });
      continue;
    }

    const inFlightBids = bids.filter((b) => IN_FLIGHT_STATUSES.includes(b.status));
    if (inFlightBids.length === 0) continue; // nothing to show

    const rollup = rollupStatusForTrade(bids);
    let stat: TimelineStat = 'rs';
    if (rollup === 'Leveling' || rollup === 'Leveled - Pending Review') stat = 'lv';
    else if (rollup === 'Bid Received') stat = 'br';
    else if (rollup === 'Followed Up') stat = 'fu';
    else stat = 'rs';

    const oldest = inFlightBids
      .map((b) => daysSince(b.dateUpdated))
      .filter((d): d is number => d != null)
      .sort((a, b) => b - a)[0];
    const stale = oldest != null && oldest > 10;
    const winningAmount = winner?.amount ?? null;
    const rfpDate = inFlightBids
      .map((b) => dateMsOf(b.dateUpdated))
      .filter((d): d is number => d != null)
      .sort((a, b) => a - b)[0];

    let dateLabel: string;
    if (stat === 'lv') dateLabel = `Leveling · bids due ${fmtMonthDay((rfpDate ?? Date.now()) + 14 * 86_400_000)}`;
    else if (stat === 'fu' && stale) dateLabel = `⚠ Followed up ${oldest}d ago · stale`;
    else if (stat === 'fu') dateLabel = `Followed up ${oldest ?? 0}d ago`;
    else dateLabel = `Awaiting response · RFP sent ${fmtMonthDay(rfpDate ?? null)}`;

    // For the row's deep-link target, pick the oldest in-flight bid — that's
    // the one most likely needing follow-up. Fall back to the budget task URL.
    const oldestBid = inFlightBids
      .slice()
      .sort((a, b) => (daysSince(b.dateUpdated) ?? 0) - (daysSince(a.dateUpdated) ?? 0))[0];
    bidding.push({
      stat, tag, name: bt.trade,
      sub: `${inFlightBids.length} sub${inFlightBids.length === 1 ? '' : 's'} invited${winningAmount != null ? ` · low ${shortPickName(winner?.bid.subcontractor)}` : ''}`,
      amt: winningAmount != null ? fmtUsd(winningAmount) : null,
      alloc: allocLabel,
      rfp: fmtMonthDay(rfpDate ?? null),
      date: dateLabel,
      sortKey: -(oldest ?? 0),
      warn: stale && stat === 'fu',
      sumDollars: winningAmount ?? bt.budgetAllocated ?? 0,
      url: oldestBid?.url ?? bt.url,
    });
  }

  awarded.sort((a, b) => b.sortKey - a.sortKey);
  bidding.sort((a, b) => a.sortKey - b.sortKey);
  set.sort((a, b) => b.sortKey - a.sortKey);

  const groupSum = (rows: Row[]) => fmtUsd(rows.reduce((sum, r) => sum + (r.sumDollars || 0), 0));

  const timeline: TimelineGroup[] = [];
  if (awarded.length > 0) timeline.push({ group: 'awarded', label: `Awarded · ${awarded.length} trade${awarded.length === 1 ? '' : 's'}`, sub: `${groupSum(awarded)} committed`, rows: stripSort(awarded) });
  if (bidding.length > 0) timeline.push({ group: 'bidding', label: `Bidding set · in progress · ${bidding.length} trade${bidding.length === 1 ? '' : 's'}`, sub: `${groupSum(bidding)} projected`, rows: stripSort(bidding) });
  if (set.length > 0) timeline.push({ group: 'set', label: `Trade Type: Set · ${set.length} trade${set.length === 1 ? '' : 's'}`, sub: `${groupSum(set)} direct`, rows: stripSort(set) });

  // In-flight cards — oldest 4 in-flight bids across the project.
  const allInFlight = snapshot.biddingTasks
    .filter((b) => IN_FLIGHT_STATUSES.includes(b.status))
    .map((b) => ({
      bid: b,
      days: daysSince(b.dateUpdated),
    }))
    .filter((x) => x.days != null)
    .sort((a, b) => (b.days! - a.days!))
    .slice(0, 4);
  const inFlight: InFlightCard[] = allInFlight.map(({ bid, days }) => ({
    trade: bid.trade ?? 'Unknown',
    sub: bid.subcontractor,
    days: (days! > 10 ? `${days}d · stale` : `${days}d`),
    meta: `RFP ${fmtMonthDay(dateMsOf(bid.dateUpdated))} · ${bid.bidAmount != null ? `BR ${fmtUsd(bid.bidAmount)}` : 'awaiting reply'}`,
    crit: days! > 12,
    url: bid.url,
  }));

  // Per-trade matrix rows.
  const ptTrades: PtTrade[] = snapshot.budgetTasks
    .slice()
    .sort((a, b) => (b.budgetAllocated ?? 0) - (a.budgetAllocated ?? 0))
    .map((bt) => {
      const bids = bidsByTrade.get(tradeKey(bt.trade)) ?? [];
      const winner = resolveWinningBid(bids);
      const lowestId = winner?.bid.id;
      const subsSorted = bids.slice().sort((a, b) => {
        const aw = a.status === 'Awarded' ? -2 : 0;
        const bw = b.status === 'Awarded' ? -2 : 0;
        if (aw !== bw) return aw - bw;
        return Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0);
      });
      const padded: (BiddingTask | null)[] = [subsSorted[0] ?? null, subsSorted[1] ?? null, subsSorted[2] ?? null, subsSorted[3] ?? null];
      const updated = computedById.get(bt.id)?.nextUpdated ?? bt.updatedBudget ?? bt.budgetAllocated ?? 0;
      const allocated = bt.budgetAllocated ?? 0;
      const stage = stageLabelFor(bt, bids);

      const subs: (PtSub | null)[] = padded.map((b) => {
        if (!b) return null;
        return {
          name: b.subcontractor,
          status: STATUS_CODE[b.status] as StatusCode,
          amount: b.bidAmount,
          isLow: b.id === lowestId,
          rfp: fmtMonthDay(dateMsOf(b.dateUpdated)),
          last: relativeDays(daysSince(b.dateUpdated)),
          url: b.url,
        };
      });

      return {
        name: bt.trade,
        cost: bt.costType === 'Hard' ? 'hard' : 'soft',
        tag: shortTag(bt.trade),
        stage,
        syncStatus: bt.syncStatus,
        syncIssues: bt.syncIssues.map((issue) => issue.message),
        expectedBiddingCount: bt.expectedBiddingCount,
        actualBiddingCount: bt.actualBiddingCount,
        updated,
        allocated,
        subs,
        url: bt.url,
      } satisfies PtTrade;
    });

  // Project meta — pull what we can from the snapshot.
  const meta = projectMetaFor(snapshot);

  return {
    folderId: snapshot.folderId,
    folderName: snapshot.folderName,
    url: clickupFolderUrl(snapshot.folderId),
    address: meta.address,
    coord: meta.coord,
    projectId: meta.projectId,
    phase: meta.phase,
    summary: {
      trades, awarded: awardedCount, bidding: biddingCount, set: setCount,
      updatedBudget: fmtUsd(updatedTotal),
      syncIssues: snapshot.syncHealth.total,
    },
    rollup: {
      hardTrades, hardTotal: fmtUsd(hardSum),
      softTrades, softTotal: fmtUsd(softSum),
      updated: fmtUsd(updatedTotal),
      allocated: fmtUsd(allocatedTotal),
      variance: (variance > 0 ? '+' : variance < 0 ? '−' : '±') + fmtUsd(Math.abs(variance)).replace(/^-/, '') + (allocatedTotal > 0 ? ` (${(Math.abs(variance) / allocatedTotal * 100).toFixed(1)}%)` : ''),
      varianceKind,
    },
    timeline, inFlight, ptTrades,
  };
}

function stripSort<T extends TimelineRow & { sortKey: number; sumDollars: number }>(rows: T[]): TimelineRow[] {
  return rows.map(({ sortKey: _s, sumDollars: _d, ...rest }) => rest as TimelineRow);
}

function shortPickName(s: string | undefined): string {
  if (!s) return '';
  const parts = s.split(/\s+/);
  return parts.slice(0, 2).join(' ');
}

function stageLabelFor(bt: BudgetTask, bids: BiddingTask[]): string {
  if (bt.tradeType === 'Set') {
    const awBid = bids.find((b) => b.status === 'Awarded') ?? bids[0];
    const dateMs = dateMsOf(awBid?.awardDate) ?? dateMsOf(awBid?.dateUpdated);
    return `Trade Type: Set · ${fmtMonthDay(dateMs)}`;
  }
  const awarded = bids.find((b) => b.status === 'Awarded');
  if (awarded) return `Awarded · ${fmtMonthDay(dateMsOf(awarded.awardDate) ?? dateMsOf(awarded.dateUpdated))}`;
  const inFlight = bids.filter((b) => IN_FLIGHT_STATUSES.includes(b.status));
  const rollup = rollupStatusForTrade(bids);
  if (rollup === 'Leveling' || rollup === 'Leveled - Pending Review') {
    const oldestRfp = inFlight.map((b) => dateMsOf(b.dateUpdated)).filter((d): d is number => d != null).sort((a, b) => a - b)[0];
    return `Leveling · bids due ${fmtMonthDay((oldestRfp ?? Date.now()) + 14 * 86_400_000)}`;
  }
  if (rollup === 'Followed Up') return 'Followed up · stale';
  if (rollup === 'RFP Sent' || inFlight.length > 0) return 'RFP Sent · awaiting response';
  return 'Not started';
}

interface ProjectMeta {
  address: string | null;
  coord: { initials: string; name: string };
  projectId: string | null;
  phase: string;
}

function projectMetaFor(snapshot: ProjectSnapshot): ProjectMeta {
  const mock = MOCK_PROJECTS.find((p) => p.folderName === snapshot.folderName);
  const anyInFlight = snapshot.biddingTasks.some((b) => IN_FLIGHT_STATUSES.includes(b.status));
  const allAwarded = snapshot.budgetTasks.length > 0
    && snapshot.budgetTasks.every((bt) => {
      if (bt.tradeType === 'Set') return true;
      const bids = snapshot.biddingTasks.filter((b) => b.trade && tradeKey(b.trade) === tradeKey(bt.trade));
      return bids.some((b) => b.status === 'Awarded');
    });
  const phase = anyInFlight ? 'Bidding' : allAwarded ? 'Construction' : 'Pre-construction';
  // Project ID — extract from the first budget task's URL pattern if present.
  // Falls back to the folder name's short label.
  const projectId = mock?.shortLabel ? mock.shortLabel.toUpperCase() : null;
  return {
    address: mock?.address ?? null,
    coord: { initials: 'BB', name: 'Bidding Team' },
    projectId,
    phase,
  };
}

// Re-export the BIDDING_STATUSES literal so callers don't need to dive into ./clickup/types.
export { BIDDING_STATUSES };
