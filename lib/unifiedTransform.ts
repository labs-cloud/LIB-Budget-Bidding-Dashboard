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
  SyncCategory,
  SyncSeverity,
  TEAM,
  TradeTypeValue,
} from './clickup/types';
import { tradeKey } from './clickup/client';
import { computeUpdatedBudgets, resolveWinningBid } from './clickup/budgetAutomation';
import { MOCK_PROJECTS } from './clickup/mockData';
import { fmtUsd, daysSince } from './formatting';
import { finalizedLowestBid, newBudget as deriveNewBudget } from './derivations/budget';

// ClickUp workspace ID (constant — verified in AGENTS.md §3). Used to
// construct folder URLs; task URLs we always read from the API response.
const CLICKUP_WORKSPACE_ID = '9017603275';
const CLICKUP_SUBCONTRACTORS_LIST_ID = '901709498953';
const CLICKUP_ACTIVE_PROJECTS_SPACE_ID = '90173230172';
function clickupFolderUrl(folderId: string): string {
  return `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}/v/o/f/${folderId}`;
}
function clickupListUrl(listId: string): string {
  return `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}/v/li/${listId}`;
}

// Compact codes for the Budget task's own workflow status — used by the
// per-trade status dot in the matrix.
export type BudgetStatusCode = 'TB' | 'OB' | 'BS' | 'BC';
const BUDGET_STATUS_RANK: Record<BudgetStatusCode, number> = { TB: 0, OB: 1, BS: 2, BC: 3 };

function budgetStatusCodeFromString(raw: string | null | undefined): BudgetStatusCode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'to budget') return 'TB';
  if (v === 'open for bidding') return 'OB';
  if (v === 'budget set') return 'BS';
  if (v === 'bid list confirmed') return 'BC';
  return null;
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatusCode, string> = {
  TB: 'to budget',
  OB: 'Open for Bidding',
  BS: 'Budget Set',
  BC: 'Bid List Confirmed',
};

// ----------------------------------------------------------------------------
// Public shape — everything the client component needs to render.
// ----------------------------------------------------------------------------

export type StatusCode = 'NS' | 'RS' | 'FU' | 'BR' | 'LV' | 'LP' | 'NR' | 'ND' | 'AW';
export type CostType = 'hard' | 'soft';

export interface UnifiedPortfolio {
  source: 'live' | 'mock';
  /**
   * Which top-level dashboard this payload was built for. `bidding` payloads
   * have already had every non-Biddable trade filtered out at build time, so
   * downstream components never see Set / N/A / Pending trades.
   */
  view: 'budget' | 'bidding';
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
      /** Most-advanced budget status seen across all cells in this row. */
      budgetStatus: BudgetStatusCode | null;
      cells: Array<{
        code: StatusCode | null;
        name: string | null;
        syncIssues: number;
        /**
         * Trade Type for the cell's Budget task. 'Set' cells render a
         * SET → Finance pill (Gap 4) rather than the standard "—" placeholder.
         */
        tradeType: TradeTypeValue | null;
        /** Budget task URL (used by the Set pill click-through). */
        budgetUrl: string | null;
        /** Budget task workflow status code (drives the row-level dot). */
        budgetStatus: BudgetStatusCode | null;
      }>;
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
  leveling: LevelingEntry[];
  syncIssueRows: SyncIssueRow[];
  subcontractors: SubcontractorStats[];
  subcontractorsListUrl: string;
  /** Budget Outlook three-number rollup, summed across every project. */
  budgetOutlook: { estimated: string; finalized: string; newBudget: string; tradeCount: number };
  /** "PRIORITY · top of the queue" hero card content (P&P parity). */
  priority: { headline: string; items: PriorityItem[] };
  /** Per-SOP-team-member workload bars. */
  teamWorkload: TeamWorkloadRow[];
  /** Budget-task status distribution — "Active by status" panel (Budget view). */
  budgetStatusPanel: BudgetStatusPanelRow[];
  /** "Portfolio at a glance" tile grid — one tile per active project. */
  atAGlance: GlanceTile[];
  /** ClickUp source path subtitle for the header. */
  sourcePath: string;
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
    /** Budget Outlook three-number rollup, summed across the project's trades. */
    estimatedTotal: string;
    finalizedTotal: string;
    newBudgetTotal: string;
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
  /** OneDrive proposal URL from the Bidding task's Link field (Gap 11). */
  proposalUrl: string | null;
}

export interface LevelingEntry {
  trade: string;
  project: string;
  projectFolderId: string;
  subCount: number;
  daysSinceFirstBid: number | null;
  /** True when at least one bid has hit "Leveled - Pending Review". */
  pendingReview: boolean;
  /** ClickUp deep-link — the Bidding list filtered to this trade. */
  url: string;
}

export interface SyncIssueRow {
  project: string;
  projectFolderId: string;
  trade: string | null;
  category: SyncCategory;
  /** Human-readable bucket label (Gap 7). */
  categoryLabel: string;
  code: string;
  message: string;
  severity: SyncSeverity;
  /** ClickUp URL to navigate the responsible task. */
  fixUrl: string;
}

export interface SubcontractorStats {
  name: string;
  trades: string[];
  totalBids: number;
  awardedCount: number;
  winRatePct: number;
  activeRfps: number;
  avgBidAmount: number | null;
  medianResponseDays: number | null;
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
  /** "Budget Outlook" three-number progression (Gap: Excel parity). */
  estimated: number | null;
  finalizedLowest: number | null;
  newBudget: number | null;
  subs: (PtSub | null)[];
  /** ClickUp URL for the budget task (the trade row). */
  url: string;
  /** Budget task workflow status (Gap 5). */
  budgetStatus: BudgetStatusCode | null;
  /** Trade Type — used by the SET → Finance chip on Set rows (Gap 4). */
  tradeType: TradeTypeValue | null;
  /** Trade-level rollup bidding status — drives the Bidding-view columns. */
  biddingStatusCode: StatusCode | null;
  biddingStatusName: string | null;
  /** Earliest RFP-sent date across the trade's bids (Bidding-view column). */
  rfpSentDate: string;
  /** Days since the most recent bid activity (Bidding-view column). */
  daysSinceUpdate: number | null;
}

// P&P-parity surfaces (PR-B) ------------------------------------------------

export interface PriorityItem {
  kind: 'stale-rfp' | 'overdue-followup' | 'awarded-no-amount';
  days: number;
  project: string;
  trade: string;
  status: string;
  url: string;
}

export interface TeamWorkloadRow {
  name: string;
  initials: string;
  segments: Array<{ code: StatusCode; n: number }>;
  total: number;
  projectCount: number;
}

export interface BudgetStatusPanelRow {
  code: BudgetStatusCode;
  label: string;
  count: number;
}

export interface GlanceTile {
  folderId: string;
  name: string;
  awardedPct: number;
  estimated: string;
  biddableCount: number;
  health: 'good' | 'mid' | 'low';
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

/**
 * "Pending" is the auto-created placeholder subcontractor name used when a
 * Bidding task is generated before a real sub has been assigned (SOP Part 4).
 * Empty / whitespace-only / literally "Pending" don't count as real subs.
 */
function isRealSubcontractor(name: string | null | undefined): boolean {
  if (!name) return false;
  const v = name.trim().toLowerCase();
  if (!v) return false;
  if (v === 'pending') return false;
  return true;
}

const SYNC_CATEGORY_LABEL: Record<SyncCategory, string> = {
  trade_type: 'Trade Type missing',
  budget_allocated: 'Budget Allocated empty',
  subcontractors: 'Subcontractors list issue',
  bidding_tasks: 'Bidding tasks not generated',
  budget_status: 'Budget status mismatch',
  unexpected_bidding: 'Bidding on a Set trade',
  unlinked_bid: 'Bid not linked to a Trade',
  biddable_no_subcontractors: 'Biddable trade with no Subcontractors assigned',
  biddable_no_bid_amount: 'Biddable trade with no Bid Amount',
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

/**
 * Restrict a project snapshot to its Biddable trades only — the view boundary
 * for the Bidding Dashboard. Set / N/A / Pending trades (and any Bidding tasks
 * or trade-groups joined to them by trade name) are dropped so every
 * downstream transform — matrix rows, KPIs, panels, gantt — automatically
 * operates on the bidding pipeline subset.
 */
function biddableOnly(s: ProjectSnapshot): ProjectSnapshot {
  const budgetTasks = s.budgetTasks.filter((b) => b.tradeType === 'Biddable');
  const keys = new Set(budgetTasks.map((b) => tradeKey(b.trade)));
  return {
    ...s,
    budgetTasks,
    biddingTasks: s.biddingTasks.filter((b) => b.trade != null && keys.has(tradeKey(b.trade))),
    tradeGroups: s.tradeGroups.filter((g) => keys.has(tradeKey(g.trade))),
  };
}

export function buildUnifiedPortfolio(input: {
  snapshots: ProjectSnapshot[];
  source: 'live' | 'mock';
  refreshedAt: number;
  warnings: string[];
  /** Default 'budget'. 'bidding' filters to Biddable trades before anything. */
  view?: 'budget' | 'bidding';
}): UnifiedPortfolio {
  const { source, refreshedAt, warnings } = input;
  const view: 'budget' | 'bidding' = input.view ?? 'budget';
  // Enforce the view boundary up front: in Bidding view every snapshot is
  // narrowed to its Biddable trades, so no downstream code has to know.
  const snapshots = view === 'bidding'
    ? input.snapshots.map(biddableOnly)
    : input.snapshots;

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
      if (!snap) return { code: null, name: null, syncIssues: 0, tradeType: null, budgetUrl: null, budgetStatus: null };
      const tradeBids = snap.biddingTasks.filter((b) => b.trade && tradeKey(b.trade) === k);
      const group = snap.tradeGroups.find((g) => tradeKey(g.trade) === k);
      const budgetTask = snap.budgetTasks.find((bt) => tradeKey(bt.trade) === k);
      const syncIssues = budgetTask?.syncIssues.length ?? 0;
      const tradeType = budgetTask?.tradeType ?? null;
      const budgetUrl = budgetTask?.url ?? null;
      const budgetStatus = budgetStatusCodeFromString(budgetTask?.budgetStatus);
      const statuses = tradeBids.map((b) => b.status);
      if (statuses.length === 0 && group) statuses.push(group.status);
      const winning = STATUS_PRIORITY.find((s) => statuses.includes(s));
      if (!winning) return { code: null, name: null, syncIssues, tradeType, budgetUrl, budgetStatus };
      return { code: STATUS_CODE[winning] as StatusCode, name: winning, syncIssues, tradeType, budgetUrl, budgetStatus };
    });
    // Per-row aggregate budget status — the most-advanced stage seen across
    // any project. Drives the row-level dot in the portfolio matrix.
    let topStatus: BudgetStatusCode | null = null;
    let topRank = -1;
    for (const c of cells) {
      if (!c.budgetStatus) continue;
      const r = BUDGET_STATUS_RANK[c.budgetStatus];
      if (r > topRank) { topRank = r; topStatus = c.budgetStatus; }
    }
    return { trade, cost: costOf(trade), budgetStatus: topStatus, cells };
  });
  // Drop trade rows with no real cells or sync warnings or Set cells anywhere.
  const filteredRows = rows.filter((r) =>
    r.cells.some((c) => c.code != null || c.syncIssues > 0 || c.tradeType === 'Set')
  );

  // KPIs.
  let inFlight = 0;
  let awaitingStale = 0;
  let readyToAward = 0;
  for (const r of filteredRows) {
    for (const c of r.cells) {
      if (!c.name) continue;
      if (IN_FLIGHT_STATUSES.includes(c.name as BiddingStatus)) inFlight += 1;
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
  // Trade Type pending — counts ONLY Budget tasks where Trade Type is the
  // literal "Pending" dropdown value (Gap 3). Null / unset Trade Type means
  // the field hasn't been touched yet and isn't a queue item; counting those
  // inflated the number into the thousands.
  let tradeTypePending = 0;
  const pendingProjects = new Set<string>();
  for (const s of snapshots) {
    for (const bt of s.budgetTasks) {
      if (bt.tradeType !== 'Pending') continue;
      tradeTypePending += 1;
      pendingProjects.add(s.folderId);
    }
  }
  const syncIssues = snapshots.reduce((sum, s) => sum + s.syncHealth.total, 0);
  const syncProjects = snapshots.filter((s) => s.syncHealth.total > 0).length;

  // Stale follow-up list — top 5 oldest RFP-sent / followed-up bids across
  // all projects. Gap 10: drop placeholder bids whose Subcontractor is the
  // auto-created "Pending" stub (no real sub assigned yet); a follow-up only
  // makes sense once we know who to nag. Also drop status=Not Started
  // children that slip through the in-flight filter via derived-status edge
  // cases.
  const projectNameById = new Map(snapshots.map((s) => [s.folderId, s.folderName]));
  const staleAll: UnifiedPortfolio['stale'] = [];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (b.status !== 'RFP Sent' && b.status !== 'Followed Up') continue;
      if (!isRealSubcontractor(b.subcontractor)) continue;
      const d = daysSince(b.dateUpdated);
      if (d == null || d < 7) continue;
      staleAll.push({
        sub: b.subcontractor,
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

  // Recompute the awaitingFollowUp KPI using the same Gap-10 filter so the
  // card matches the list it summarises.
  let awaitingFollowUpReal = 0;
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (b.status !== 'RFP Sent' && b.status !== 'Followed Up') continue;
      if (!isRealSubcontractor(b.subcontractor)) continue;
      awaitingFollowUpReal += 1;
    }
  }

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

  // Leveling panel (Gap 6) — any bid currently in Leveling / Leveled - Pending
  // Review, grouped by project + trade.
  const leveling = buildLevelingEntries(snapshots);

  // Sync issue rows (Gap 7) — flatten every per-task SyncIssue into a row the
  // side panel can render with a Fix-in-ClickUp link.
  const syncIssueRows = buildSyncIssueRows(snapshots);

  // Subcontractors view (Gap 8) — aggregate per-sub stats across the
  // portfolio.
  const subcontractors = buildSubcontractorStats(snapshots);

  // Budget Outlook portfolio rollup — Estimated / Finalized / New Budget
  // summed across every Budget task in every project.
  let pfEstimated = 0;
  let pfFinalized = 0;
  let pfNewBudget = 0;
  let pfTradeCount = 0;
  for (const s of snapshots) {
    for (const b of s.budgetTasks) {
      pfTradeCount += 1;
      pfEstimated += b.estimatedBudget ?? 0;
      const fin = finalizedLowestBid(b, s.biddingTasks);
      pfFinalized += fin ?? 0;
      pfNewBudget += deriveNewBudget(b, fin) ?? 0;
    }
  }

  // P&P-parity surfaces.
  const priority = buildPriority(snapshots);
  const teamWorkload = buildTeamWorkload(snapshots);
  const budgetStatusPanel = buildBudgetStatusPanel(snapshots);
  const atAGlance = buildAtAGlance(snapshots);
  const sourcePath = `ClickUp · space ${CLICKUP_ACTIVE_PROJECTS_SPACE_ID} · ${snapshots.length} active project${snapshots.length === 1 ? '' : 's'}`;

  // Hero refresh string.
  const sec = Math.max(1, Math.floor((Date.now() - refreshedAt) / 1000));
  const refreshedAgo = sec < 90 ? `${sec}s ago` : `${Math.round(sec / 60)}m ago`;

  return {
    source,
    view,
    refreshedAt,
    refreshedAgo,
    warnings,
    hero: { inFlight, activeProjects: snapshots.length },
    kpis: {
      inFlight, inFlightDelta: 'across all trades',
      awaitingFollowUp: awaitingFollowUpReal, awaitingStale,
      readyToAward, readyDelta: 'leveled · pending review',
      tradeTypePending, tradeTypePendingProjects: pendingProjects.size,
      syncIssues, syncProjects,
    },
    matrix: { projects, rows: filteredRows, distribution, totalCells },
    stale: staleAll.slice(0, 5),
    leveling,
    syncIssueRows,
    subcontractors,
    subcontractorsListUrl: clickupListUrl(CLICKUP_SUBCONTRACTORS_LIST_ID),
    budgetOutlook: {
      estimated: fmtUsd(pfEstimated),
      finalized: fmtUsd(pfFinalized),
      newBudget: fmtUsd(pfNewBudget),
      tradeCount: pfTradeCount,
    },
    priority,
    teamWorkload,
    budgetStatusPanel,
    atAGlance,
    sourcePath,
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
      // Budget Outlook three-number progression.
      const finalizedLowest = finalizedLowestBid(bt, snapshot.biddingTasks);
      const newBudgetVal = deriveNewBudget(bt, finalizedLowest);
      const stage = stageLabelFor(bt, bids);

      // Bidding-view column data: trade-level rollup status, earliest RFP
      // date, and days since the most recent bid activity.
      const rollupStatus = rollupStatusForTrade(bids);
      const biddingStatusCode = rollupStatus ? (STATUS_CODE[rollupStatus] as StatusCode) : null;
      const rfpMs = bids
        .map((b) => dateMsOf(b.dateUpdated))
        .filter((d): d is number => d != null)
        .sort((a, b) => a - b)[0];
      const daysSinceUpdate = bids
        .map((b) => daysSince(b.dateUpdated))
        .filter((d): d is number => d != null)
        .sort((a, b) => a - b)[0] ?? null;

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
          proposalUrl: b.link,
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
        estimated: bt.estimatedBudget,
        finalizedLowest,
        newBudget: newBudgetVal,
        subs,
        url: bt.url,
        budgetStatus: budgetStatusCodeFromString(bt.budgetStatus),
        tradeType: bt.tradeType,
        biddingStatusCode,
        biddingStatusName: rollupStatus,
        rfpSentDate: fmtMonthDay(rfpMs ?? null),
        daysSinceUpdate,
      } satisfies PtTrade;
    });

  // Budget Outlook project totals — summed across every trade. `null`
  // estimates contribute nothing (unknown ≠ zero).
  const estimatedTotal = snapshot.budgetTasks.reduce((sum, b) => sum + (b.estimatedBudget ?? 0), 0);
  const finalizedTotal = snapshot.budgetTasks.reduce(
    (sum, b) => sum + (finalizedLowestBid(b, snapshot.biddingTasks) ?? 0),
    0
  );
  const newBudgetTotal = snapshot.budgetTasks.reduce((sum, b) => {
    const fin = finalizedLowestBid(b, snapshot.biddingTasks);
    return sum + (deriveNewBudget(b, fin) ?? 0);
  }, 0);

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
      estimatedTotal: fmtUsd(estimatedTotal),
      finalizedTotal: fmtUsd(finalizedTotal),
      newBudgetTotal: fmtUsd(newBudgetTotal),
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

// ----------------------------------------------------------------------------
// Aggregate panels (Gap 6, 7, 8)
// ----------------------------------------------------------------------------

const LEVELING_STATUSES: BiddingStatus[] = ['Leveling', 'Leveled - Pending Review'];

function buildLevelingEntries(snapshots: ProjectSnapshot[]): LevelingEntry[] {
  const out: LevelingEntry[] = [];
  for (const s of snapshots) {
    const byTrade = new Map<string, BiddingTask[]>();
    for (const b of s.biddingTasks) {
      if (!LEVELING_STATUSES.includes(b.status)) continue;
      if (!b.trade) continue;
      const k = tradeKey(b.trade);
      const arr = byTrade.get(k) ?? [];
      arr.push(b);
      byTrade.set(k, arr);
    }
    for (const [, bids] of byTrade) {
      const trade = bids[0].trade as string;
      // Earliest bid-received date drives the day counter — that's when the
      // leveling clock starts in the SOP. We approximate with the oldest
      // dateUpdated across the leveling bids.
      const firstBidMs = bids
        .map((b) => dateMsOf(b.dateUpdated))
        .filter((d): d is number => d != null)
        .sort((a, b) => a - b)[0];
      const days = firstBidMs != null ? Math.floor((Date.now() - firstBidMs) / 86_400_000) : null;
      const listId = bids[0].listId;
      out.push({
        trade,
        project: s.folderName,
        projectFolderId: s.folderId,
        subCount: bids.length,
        daysSinceFirstBid: days,
        pendingReview: bids.some((b) => b.status === 'Leveled - Pending Review'),
        url: listId ? clickupListUrl(listId) : clickupFolderUrl(s.folderId),
      });
    }
  }
  // Pending-review first, then by age desc.
  out.sort((a, b) => {
    if (a.pendingReview !== b.pendingReview) return a.pendingReview ? -1 : 1;
    return (b.daysSinceFirstBid ?? 0) - (a.daysSinceFirstBid ?? 0);
  });
  return out;
}

function buildSyncIssueRows(snapshots: ProjectSnapshot[]): SyncIssueRow[] {
  const rows: SyncIssueRow[] = [];
  for (const s of snapshots) {
    for (const bt of s.budgetTasks) {
      for (const issue of bt.syncIssues) {
        rows.push({
          project: s.folderName,
          projectFolderId: s.folderId,
          trade: bt.trade,
          category: issue.category,
          categoryLabel: SYNC_CATEGORY_LABEL[issue.category] ?? issue.category,
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
          fixUrl: bt.url,
        });
      }
    }
    // Project-level issues live on the SyncHealthSummary only — surface them
    // via the unlinked-bid messages we emit at sync time. Iterate biddingTasks
    // to recover the per-task fixUrl for bids without a Trade (the only
    // current source of project-level issues).
    for (const b of s.biddingTasks) {
      if (b.trade) continue;
      rows.push({
        project: s.folderName,
        projectFolderId: s.folderId,
        trade: null,
        category: 'unlinked_bid',
        categoryLabel: SYNC_CATEGORY_LABEL.unlinked_bid,
        code: 'bid_missing_trade',
        message: `Bidding task "${b.subcontractor}" is missing a Trade value, so it cannot sync to Budget.`,
        severity: 'warning',
        fixUrl: b.url,
      });
    }
  }
  // Error-first, then warning-first, then by project name.
  rows.sort((a, b) => {
    if (a.severity !== b.severity) {
      if (a.severity === 'error') return -1;
      if (b.severity === 'error') return 1;
      if (a.severity === 'warning') return -1;
      if (b.severity === 'warning') return 1;
    }
    return a.project.localeCompare(b.project);
  });
  return rows;
}

const ACTIVE_RFP_STATUSES: BiddingStatus[] = ['RFP Sent', 'Followed Up', 'Bid Received'];

function buildSubcontractorStats(snapshots: ProjectSnapshot[]): SubcontractorStats[] {
  const bySub = new Map<string, {
    name: string;
    url: string;
    trades: Set<string>;
    bids: BiddingTask[];
  }>();
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (!isRealSubcontractor(b.subcontractor)) continue;
      const key = b.subcontractor.trim().toLowerCase();
      const entry = bySub.get(key) ?? {
        name: b.subcontractor.trim(),
        url: b.subcontractorUrl ?? clickupListUrl(CLICKUP_SUBCONTRACTORS_LIST_ID),
        trades: new Set<string>(),
        bids: [],
      };
      if (!entry.url || entry.url.includes('/v/li/')) {
        if (b.subcontractorUrl) entry.url = b.subcontractorUrl;
      }
      if (b.trade) entry.trades.add(b.trade);
      entry.bids.push(b);
      bySub.set(key, entry);
    }
  }
  const out: SubcontractorStats[] = [];
  for (const entry of bySub.values()) {
    const total = entry.bids.length;
    const awarded = entry.bids.filter((b) => b.status === 'Awarded').length;
    const active = entry.bids.filter((b) => ACTIVE_RFP_STATUSES.includes(b.status)).length;
    const amounts = entry.bids
      .map((b) => b.bidAmount)
      .filter((n): n is number => n != null && n > 0);
    const avg = amounts.length > 0 ? amounts.reduce((s, n) => s + n, 0) / amounts.length : null;
    // Median response = days from RFP-sent (dateUpdated on an RFP Sent bid)
    // to Bid Received / Awarded. We approximate with the bid task's age in
    // days at the moment a bid amount appeared. When awardDate is set we
    // prefer that; otherwise dateUpdated on a respondent bid.
    const responseDays = entry.bids
      .filter((b) => b.bidAmount != null && b.bidAmount > 0)
      .map((b) => daysSince(b.dateUpdated))
      .filter((d): d is number => d != null && d >= 0);
    out.push({
      name: entry.name,
      trades: Array.from(entry.trades).sort(),
      totalBids: total,
      awardedCount: awarded,
      winRatePct: total > 0 ? Math.round((awarded / total) * 100) : 0,
      activeRfps: active,
      avgBidAmount: avg,
      medianResponseDays: median(responseDays),
      url: entry.url,
    });
  }
  out.sort((a, b) => {
    if (a.activeRfps !== b.activeRfps) return b.activeRfps - a.activeRfps;
    return b.totalBids - a.totalBids;
  });
  return out;
}

// ----------------------------------------------------------------------------
// P&P-parity surfaces (PR-B)
// ----------------------------------------------------------------------------

// Weekday count between a date and now — for the SOP's "business days" SLAs.
function businessDaysSince(date: string | null): number | null {
  const ms = dateMsOf(date);
  if (ms == null) return null;
  const cur = new Date(ms);
  const now = Date.now();
  let days = 0;
  while (cur.getTime() < now) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days += 1;
  }
  return days;
}

function buildPriority(snapshots: ProjectSnapshot[]): { headline: string; items: PriorityItem[] } {
  const nameById = new Map(snapshots.map((s) => [s.folderId, s.folderName]));
  const items: PriorityItem[] = [];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      const project = nameById.get(s.folderId) ?? '';
      const trade = b.trade ?? 'Unknown trade';
      if (b.status === 'RFP Sent') {
        const d = businessDaysSince(b.dateUpdated);
        if (d != null && d > 5) {
          items.push({ kind: 'stale-rfp', days: d, project, trade, status: 'RFP Sent', url: b.url });
        }
      } else if (b.status === 'Followed Up') {
        const d = businessDaysSince(b.dateUpdated);
        if (d != null && d > 3) {
          items.push({ kind: 'overdue-followup', days: d, project, trade, status: 'Followed Up', url: b.url });
        }
      } else if (b.status === 'Awarded' && b.bidAmount == null) {
        const d = businessDaysSince(b.awardDate ?? b.dateUpdated) ?? 0;
        items.push({ kind: 'awarded-no-amount', days: d, project, trade, status: 'Awarded · no amount', url: b.url });
      }
    }
  }
  items.sort((a, b) => b.days - a.days);
  const top = items.slice(0, 3);
  let headline: string;
  if (items.length === 0) {
    headline = 'All clear — no stale bids or overdue follow-ups';
  } else {
    const avg = Math.round(items.reduce((sum, i) => sum + i.days, 0) / items.length);
    headline = `${items.length} bid${items.length === 1 ? '' : 's'} need attention — avg ${avg} day${avg === 1 ? '' : 's'} waiting`;
  }
  return { headline, items: top };
}

const WORKLOAD_SEGMENT_ORDER: StatusCode[] = ['AW', 'LV', 'LP', 'BR', 'FU', 'RS', 'NR', 'ND', 'NS'];

function buildTeamWorkload(snapshots: ProjectSnapshot[]): TeamWorkloadRow[] {
  return TEAM.map((member) => {
    const key = member.name.trim().toLowerCase();
    const counts = new Map<StatusCode, number>();
    const projects = new Set<string>();
    let total = 0;
    for (const s of snapshots) {
      for (const b of s.biddingTasks) {
        if (!b.assignees.some((a) => a.trim().toLowerCase() === key)) continue;
        const code = STATUS_CODE[b.status] as StatusCode;
        counts.set(code, (counts.get(code) ?? 0) + 1);
        projects.add(s.folderId);
        total += 1;
      }
    }
    const segments = WORKLOAD_SEGMENT_ORDER
      .filter((c) => (counts.get(c) ?? 0) > 0)
      .map((c) => ({ code: c, n: counts.get(c)! }));
    return {
      name: member.name,
      initials: member.initials,
      segments,
      total,
      projectCount: projects.size,
    };
  }).sort((a, b) => b.total - a.total);
}

function buildBudgetStatusPanel(snapshots: ProjectSnapshot[]): BudgetStatusPanelRow[] {
  const counts: Record<BudgetStatusCode, number> = { TB: 0, OB: 0, BS: 0, BC: 0 };
  for (const s of snapshots) {
    for (const bt of s.budgetTasks) {
      const code = budgetStatusCodeFromString(bt.budgetStatus);
      if (code) counts[code] += 1;
    }
  }
  return (Object.keys(BUDGET_STATUS_LABEL) as BudgetStatusCode[]).map((code) => ({
    code,
    label: BUDGET_STATUS_LABEL[code],
    count: counts[code],
  }));
}

function buildAtAGlance(snapshots: ProjectSnapshot[]): GlanceTile[] {
  return snapshots
    .map((s) => {
      const biddable = s.budgetTasks.filter((bt) => bt.tradeType === 'Biddable');
      const awardedTradeKeys = new Set(
        s.biddingTasks
          .filter((b) => b.status === 'Awarded' && b.trade)
          .map((b) => tradeKey(b.trade as string))
      );
      const awarded = biddable.filter((bt) => awardedTradeKeys.has(tradeKey(bt.trade))).length;
      const awardedPct = biddable.length > 0 ? Math.round((awarded / biddable.length) * 100) : 0;
      const estimated = s.budgetTasks.reduce((sum, bt) => sum + (bt.estimatedBudget ?? 0), 0);
      const health: GlanceTile['health'] = awardedPct >= 50 ? 'good' : awardedPct >= 10 ? 'mid' : 'low';
      return {
        folderId: s.folderId,
        name: s.folderName,
        awardedPct,
        estimated: fmtUsd(estimated),
        biddableCount: biddable.length,
        health,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Re-export the BIDDING_STATUSES literal so callers don't need to dive into ./clickup/types.
export { BIDDING_STATUSES };
