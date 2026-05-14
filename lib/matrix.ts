import {
  BiddingStatus,
  ProjectSnapshot,
  STATUS_CODE,
} from './clickup/types';
import { tradeKey } from './clickup/client';
import { daysSince } from './formatting';

// "Most interesting" status first — drives the matrix cell choice when a
// trade has multiple bidding tasks. Awarded wins, then leveling, then progress.
const STATUS_PRIORITY: BiddingStatus[] = [
  'Awarded',
  'Leveling',
  'Leveled - Pending Review',
  'Bid Received',
  'Followed Up',
  'Needs Rebid',
  'RFP Sent',
  'No Bid / Declined',
  'Not Started',
];

export interface MatrixCell {
  code: string | '—';
  status: BiddingStatus | null;
  count: number;
  /** Deep link to the Per-Project Bid Grid view scoped to (project, trade). */
  href: string | null;
}

const TRADE_DISPLAY_ORDER = [
  'SOE & Foundation & Superstructure',
  'Foundation Waterproofing',
  'Plumbing & Sprinkler',
  'Electrical',
  'Scaffolding / Shed',
  'Live Security',
  'Rubbish Removal',
  'HVAC',
  'Elevator',
  'Windows',
  'Roofing',
  'Stucco',
  'Fire Alarm',
  'Kitchens',
  'Appliances',
];

export interface PortfolioMatrix {
  rows: Array<{ trade: string; cells: MatrixCell[] }>;
  projects: Array<{ folderId: string; folderName: string }>;
  kpis: {
    inFlight: number;
    awaitingFollowUp: number;
    overdueFollowUp: number;
    readyToAward: number;
    tradeTypePending: number;
    tradeTypePendingProjects: number;
  };
}

const IN_FLIGHT: BiddingStatus[] = [
  'RFP Sent',
  'Followed Up',
  'Bid Received',
  'Leveling',
  'Leveled - Pending Review',
];

/**
 * Summarize the bidding state for one (project, trade) into a single cell.
 * Prefers the most-advanced bid status; falls back to the trade-group task's
 * status when no individual bids exist.
 */
function summarizeCell(
  snapshot: ProjectSnapshot,
  trade: string
): MatrixCell {
  const key = tradeKey(trade);
  const bids = snapshot.biddingTasks.filter((b) => b.trade && tradeKey(b.trade) === key);
  const group = snapshot.tradeGroups.find((g) => tradeKey(g.trade) === key);

  const statuses: BiddingStatus[] = bids.map((b) => b.status);
  if (statuses.length === 0 && group) statuses.push(group.status);

  if (statuses.length === 0) {
    return { code: '—', status: null, count: 0, href: null };
  }
  for (const s of STATUS_PRIORITY) {
    if (statuses.includes(s)) {
      return {
        code: STATUS_CODE[s],
        status: s,
        count: bids.length,
        href: `/project/${snapshot.folderId}?trade=${encodeURIComponent(trade)}`,
      };
    }
  }
  return { code: '—', status: null, count: bids.length, href: null };
}

export function buildPortfolioMatrix(snapshots: ProjectSnapshot[]): PortfolioMatrix {
  const projects = snapshots
    .slice()
    .sort((a, b) => a.folderName.localeCompare(b.folderName))
    .map((s) => ({ folderId: s.folderId, folderName: s.folderName }));
  const sortedSnapshots = projects.map(
    (p) => snapshots.find((s) => s.folderId === p.folderId) as ProjectSnapshot
  );

  // Union of trade names across budget tasks + trade groups. Canonical order
  // first, then any extras alphabetically. De-duped by normalized key.
  const tradeByKey = new Map<string, string>();
  for (const s of snapshots) {
    for (const b of s.budgetTasks) tradeByKey.set(tradeKey(b.trade), b.trade);
    for (const g of s.tradeGroups) {
      if (!tradeByKey.has(tradeKey(g.trade))) tradeByKey.set(tradeKey(g.trade), g.trade);
    }
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const t of TRADE_DISPLAY_ORDER) {
    const k = tradeKey(t);
    if (tradeByKey.has(k) && !seen.has(k)) {
      ordered.push(tradeByKey.get(k) as string);
      seen.add(k);
    }
  }
  for (const [k, name] of Array.from(tradeByKey.entries()).sort((a, b) =>
    a[1].localeCompare(b[1])
  )) {
    if (!seen.has(k)) {
      ordered.push(name);
      seen.add(k);
    }
  }

  const rows = ordered.map((trade) => ({
    trade,
    cells: sortedSnapshots.map((snap) => summarizeCell(snap, trade)),
  }));
  // Keep only rows that have at least one real status somewhere.
  const filteredRows = rows.filter((r) => r.cells.some((c) => c.code !== '—'));

  // KPIs
  let inFlight = 0;
  let awaitingFollowUp = 0;
  let overdueFollowUp = 0;
  let readyToAward = 0;
  let tradeTypePending = 0;
  const pendingProjects = new Set<string>();
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (IN_FLIGHT.includes(b.status)) inFlight += 1;
      if (b.status === 'RFP Sent') {
        awaitingFollowUp += 1;
        const days = daysSince(b.dateUpdated);
        if (days != null && days > 5) overdueFollowUp += 1;
      }
      if (b.status === 'Leveled - Pending Review') readyToAward += 1;
    }
    for (const bt of s.budgetTasks) {
      if (bt.tradeType == null) {
        tradeTypePending += 1;
        pendingProjects.add(s.folderId);
      }
    }
  }

  return {
    rows: filteredRows,
    projects,
    kpis: {
      inFlight,
      awaitingFollowUp,
      overdueFollowUp,
      readyToAward,
      tradeTypePending,
      tradeTypePendingProjects: pendingProjects.size,
    },
  };
}
