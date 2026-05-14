import { BiddingStatus, ProjectSnapshot, STATUS_CODE } from './clickup/types';
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

export function summarizeCell(
  projectFolderId: string,
  trade: string,
  bids: Array<{ trade: string | null; status: BiddingStatus }>
): MatrixCell {
  const tradeBids = bids.filter((b) => b.trade === trade);
  if (tradeBids.length === 0) {
    return { code: '—', status: null, count: 0, href: null };
  }
  for (const s of STATUS_PRIORITY) {
    const hit = tradeBids.find((b) => b.status === s);
    if (hit) {
      return {
        code: STATUS_CODE[s],
        status: s,
        count: tradeBids.length,
        href: `/project/${projectFolderId}?trade=${encodeURIComponent(trade)}`,
      };
    }
  }
  return { code: '—', status: null, count: tradeBids.length, href: null };
}

export interface PortfolioMatrix {
  /** Trade rows that have at least one cell with a status. */
  rows: Array<{ trade: string; cells: MatrixCell[] }>;
  /** Project columns in stable order. */
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

export function buildPortfolioMatrix(snapshots: ProjectSnapshot[]): PortfolioMatrix {
  const projects = snapshots
    .slice()
    .sort((a, b) => a.folderName.localeCompare(b.folderName))
    .map((s) => ({ folderId: s.folderId, folderName: s.folderName }));

  // Union of trades present in any project, ordered by TRADE_DISPLAY_ORDER first,
  // then any extras alphabetically.
  const tradeSet = new Set<string>();
  for (const s of snapshots) {
    for (const b of s.budgetTasks) tradeSet.add(b.trade);
    for (const b of s.biddingTasks) if (b.trade) tradeSet.add(b.trade);
  }
  const ordered: string[] = [];
  for (const t of TRADE_DISPLAY_ORDER) if (tradeSet.has(t)) ordered.push(t);
  for (const t of Array.from(tradeSet).sort()) {
    if (!ordered.includes(t)) ordered.push(t);
  }

  const rows = ordered.map((trade) => {
    const cells = projects.map((p) => {
      const snap = snapshots.find((s) => s.folderId === p.folderId);
      if (!snap) return { code: '—', status: null, count: 0, href: null } as MatrixCell;
      return summarizeCell(snap.folderId, trade, snap.biddingTasks);
    });
    return { trade, cells };
  });

  // Trim rows that are all '—' to keep the landing dense.
  const filteredRows = rows.filter((r) => r.cells.some((c) => c.code !== '—'));

  // KPIs
  let inFlight = 0;
  let awaitingFollowUp = 0;
  let overdueFollowUp = 0;
  let readyToAward = 0;
  let tradeTypePending = 0;
  const tradeTypePendingProjectSet = new Set<string>();
  const inflightStatuses: BiddingStatus[] = [
    'RFP Sent',
    'Followed Up',
    'Bid Received',
    'Leveling',
    'Leveled - Pending Review',
  ];
  for (const s of snapshots) {
    for (const b of s.biddingTasks) {
      if (inflightStatuses.includes(b.status)) inFlight += 1;
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
        tradeTypePendingProjectSet.add(s.folderId);
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
      tradeTypePendingProjects: tradeTypePendingProjectSet.size,
    },
  };
}
