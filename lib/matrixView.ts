import {
  BiddingStatus,
  BiddingTask,
  ProjectSnapshot,
  STATUS_CODE,
  STATUS_PILL,
  costTypeForTrade,
} from './clickup/types';
import { tradeKey } from './clickup/client';

/**
 * The Matrix view (route /matrix) renders three sub-designs over the same
 * data. This module shapes the portfolio into the structures each design
 * needs and keeps a single status-priority everywhere so the cell colors are
 * consistent across views.
 */

// "Most interesting" status first — drives the cell choice when a trade has
// multiple bids in a project.
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

export function worstStatus(statuses: BiddingStatus[]): BiddingStatus | null {
  if (!statuses.length) return null;
  for (const s of STATUS_PRIORITY) {
    if (statuses.includes(s)) return s;
  }
  return null;
}

export interface MatrixProject {
  folderId: string;
  folderName: string;
  url: string;
  /** Short avatar initials, 1–2 chars, derived from folder name. */
  avatar: string;
  /** Stable background color for the avatar — keyed off the folder name. */
  avatarBg: string;
  filingsCount: number;
  awardedCount: number;
  stuckCount: number;
}

const AVATAR_COLORS = [
  '#ab4aba',
  '#0091ff',
  '#30a46c',
  '#d85a30',
  '#534ab7',
  '#12a594',
  '#993c1d',
  '#a18072',
  '#3b6d11',
  '#185fa5',
];

export function projectAvatar(folderName: string): { initials: string; bg: string } {
  const cleaned = folderName.replace(/^[\d&,\/.\-]+\s*/, '').trim() || folderName;
  const words = cleaned.split(/\s+/).filter(Boolean);
  const initials = (words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '');
  let h = 0;
  for (let i = 0; i < folderName.length; i += 1) h = (h * 31 + folderName.charCodeAt(i)) | 0;
  const bg = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  return { initials: initials.toUpperCase().slice(0, 2), bg };
}

export interface MatrixCell {
  status: BiddingStatus | null;
  code: string | null;
  count: number;
  href: string | null;
}

/** Group → ordered list of trades present in the portfolio. */
export interface TradeGroup {
  id: 'soft' | 'hard';
  label: string;
  trades: string[];
}

export interface MatrixData {
  projects: MatrixProject[];
  /** key = `${projectFolderId}|${tradeKey}`, value = cell summary. */
  cellsByKey: Map<string, MatrixCell>;
  /** key = trade display name; value = ordered bids that contribute to that trade across the portfolio. */
  bidsByTradeProject: Map<string, BiddingTask[]>;
  groups: TradeGroup[];
  uniquePlanCount: number;
}

/**
 * Project rollup helpers — count Awarded / stuck trades for the project header
 * dot and per-project tfoot % bar.
 */
function summarizeProject(snap: ProjectSnapshot): {
  filingsCount: number;
  awardedCount: number;
  stuckCount: number;
} {
  const byTrade = new Map<string, BiddingTask[]>();
  for (const b of snap.biddingTasks) {
    if (!b.trade) continue;
    const k = tradeKey(b.trade);
    const arr = byTrade.get(k) ?? [];
    arr.push(b);
    byTrade.set(k, arr);
  }
  let awardedCount = 0;
  let stuckCount = 0;
  for (const [, bids] of byTrade) {
    if (bids.some((b) => b.status === 'Awarded')) awardedCount += 1;
    if (bids.some((b) => b.status === 'Needs Rebid')) stuckCount += 1;
  }
  return {
    filingsCount: snap.biddingTasks.length,
    awardedCount,
    stuckCount,
  };
}

export function buildMatrixData(snapshots: ProjectSnapshot[]): MatrixData {
  const projects: MatrixProject[] = snapshots
    .slice()
    .sort((a, b) => a.folderName.localeCompare(b.folderName))
    .map((s) => {
      const avatar = projectAvatar(s.folderName);
      const rollup = summarizeProject(s);
      return {
        folderId: s.folderId,
        folderName: s.folderName,
        url: `/project/${s.folderId}`,
        avatar: avatar.initials,
        avatarBg: avatar.bg,
        ...rollup,
      };
    });

  // Collect all real trades across the portfolio.
  const tradesByKey = new Map<string, string>();
  for (const s of snapshots) {
    for (const bt of s.budgetTasks) tradesByKey.set(tradeKey(bt.trade), bt.trade);
    for (const g of s.tradeGroups) {
      if (!tradesByKey.has(tradeKey(g.trade))) tradesByKey.set(tradeKey(g.trade), g.trade);
    }
  }

  // Split into Hard / Soft per §11. Show Hard first per the chat ("Plans now
  // sits on top of Surveys and Reports"), since Hard maps to Plans.
  const softTrades: string[] = [];
  const hardTrades: string[] = [];
  for (const trade of tradesByKey.values()) {
    if (costTypeForTrade(trade) === 'Hard') hardTrades.push(trade);
    else softTrades.push(trade);
  }
  hardTrades.sort();
  softTrades.sort();
  const groups: TradeGroup[] = [
    { id: 'hard', label: 'Hard Costs', trades: hardTrades },
    { id: 'soft', label: 'Soft Costs', trades: softTrades },
  ];

  // Build (project, trade) cells from bids + trade-group fallback.
  const cellsByKey = new Map<string, MatrixCell>();
  const bidsByTradeProject = new Map<string, BiddingTask[]>();
  const snapById = new Map(snapshots.map((s) => [s.folderId, s]));

  for (const p of projects) {
    const snap = snapById.get(p.folderId);
    if (!snap) continue;
    const projectBidsByTrade = new Map<string, BiddingTask[]>();
    for (const b of snap.biddingTasks) {
      if (!b.trade) continue;
      const k = tradeKey(b.trade);
      const arr = projectBidsByTrade.get(k) ?? [];
      arr.push(b);
      projectBidsByTrade.set(k, arr);
    }
    for (const [tKey, tradeName] of tradesByKey) {
      const bids = projectBidsByTrade.get(tKey) ?? [];
      const group = snap.tradeGroups.find((g) => tradeKey(g.trade) === tKey);
      const statuses: BiddingStatus[] = bids.map((b) => b.status);
      if (!statuses.length && group) statuses.push(group.status);
      const best = worstStatus(statuses);
      const cellKey = `${p.folderId}|${tKey}`;
      cellsByKey.set(cellKey, {
        status: best,
        code: best ? STATUS_CODE[best] : null,
        count: bids.length,
        href: best
          ? `/project/${p.folderId}?trade=${encodeURIComponent(tradeName)}`
          : null,
      });
      if (bids.length) {
        bidsByTradeProject.set(`${p.folderId}|${tKey}`, bids);
      }
    }
  }

  return {
    projects,
    cellsByKey,
    bidsByTradeProject,
    groups,
    uniquePlanCount: tradesByKey.size,
  };
}

/**
 * Rollup of statuses across a group of (project, trade) cells — used for the
 * group-row mini-stacked-bar in the Classic table.
 */
export function groupRollup(
  projectFolderId: string,
  trades: string[],
  cellsByKey: Map<string, MatrixCell>
): { total: number; counts: Partial<Record<BiddingStatus, number>> } {
  const counts: Partial<Record<BiddingStatus, number>> = {};
  let total = 0;
  for (const trade of trades) {
    const cell = cellsByKey.get(`${projectFolderId}|${tradeKey(trade)}`);
    if (!cell || !cell.status) continue;
    counts[cell.status] = (counts[cell.status] ?? 0) + 1;
    total += 1;
  }
  return { total, counts };
}

export interface BoardColumnDef {
  id: string;
  label: string;
  statuses: BiddingStatus[];
  cls?: 'urgent' | 'danger' | '';
}

/**
 * Status-board column groupings — collapses the 9-stage list into 6 columns
 * matching the design's "Waiting / Revision / Submitted / To file / To submit
 * / Approved" shape.
 */
export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: 'rebid', label: 'Needs rebid', statuses: ['Needs Rebid'], cls: 'danger' },
  {
    id: 'ready',
    label: 'Ready to award',
    statuses: ['Leveled - Pending Review'],
    cls: 'urgent',
  },
  {
    id: 'inflight',
    label: 'Bid received · leveling',
    statuses: ['Bid Received', 'Leveling'],
    cls: '',
  },
  {
    id: 'awaiting',
    label: 'RFP sent · followed up',
    statuses: ['RFP Sent', 'Followed Up'],
    cls: '',
  },
  { id: 'queued', label: 'Not started', statuses: ['Not Started'], cls: '' },
  { id: 'awarded', label: 'Awarded', statuses: ['Awarded'], cls: '' },
];

export interface BoardCell {
  projectFolderId: string;
  projectName: string;
  projectAvatar: string;
  projectAvatarBg: string;
  trades: { trade: string; href: string }[];
}

export function buildBoard(data: MatrixData): Record<string, BoardCell[]> {
  const byColumn: Record<string, Map<string, BoardCell>> = {};
  for (const col of BOARD_COLUMNS) byColumn[col.id] = new Map();

  for (const project of data.projects) {
    for (const group of data.groups) {
      for (const trade of group.trades) {
        const cell = data.cellsByKey.get(`${project.folderId}|${tradeKey(trade)}`);
        if (!cell || !cell.status) continue;
        const colDef = BOARD_COLUMNS.find((c) => c.statuses.includes(cell.status as BiddingStatus));
        if (!colDef) continue;
        const map = byColumn[colDef.id];
        let entry = map.get(project.folderId);
        if (!entry) {
          entry = {
            projectFolderId: project.folderId,
            projectName: project.folderName,
            projectAvatar: project.avatar,
            projectAvatarBg: project.avatarBg,
            trades: [],
          };
          map.set(project.folderId, entry);
        }
        entry.trades.push({
          trade,
          href: `/project/${project.folderId}?trade=${encodeURIComponent(trade)}`,
        });
      }
    }
  }

  const out: Record<string, BoardCell[]> = {};
  for (const col of BOARD_COLUMNS) {
    out[col.id] = Array.from(byColumn[col.id].values());
  }
  return out;
}

export { STATUS_PILL };
