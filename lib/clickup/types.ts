// ClickUp data contract for the Budget & Bidding Dashboard.
// Status names and Trade list are verbatim from AGENTS.md / ClickUp SOP.

export const BIDDING_STATUSES = [
  'Not Started',
  'RFP Sent',
  'Followed Up',
  'Bid Received',
  'Leveling',
  'Leveled - Pending Review',
  'Needs Rebid',
  'No Bid / Declined',
  'Awarded',
] as const;
export type BiddingStatus = (typeof BIDDING_STATUSES)[number];

export const BUDGET_STATUSES = [
  'to budget',
  'Open for Bidding',
  'Budget Set',
  'Bid List Confirmed',
] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

// 2-letter pill code (used for matrix + status pill).
export const STATUS_CODE: Record<BiddingStatus, string> = {
  Awarded: 'AW',
  Leveling: 'LV',
  'Leveled - Pending Review': 'LP',
  'Bid Received': 'BR',
  'RFP Sent': 'RS',
  'Followed Up': 'FU',
  'Needs Rebid': 'NR',
  'Not Started': 'NS',
  'No Bid / Declined': 'ND',
};

// Reverse — code to status name.
export const CODE_STATUS: Record<string, BiddingStatus> = Object.fromEntries(
  Object.entries(STATUS_CODE).map(([k, v]) => [v, k as BiddingStatus])
) as Record<string, BiddingStatus>;

// Hardcoded pill colors — same in light & dark per §7.
export const STATUS_PILL: Record<
  string,
  { bg: string; fg: string; name: BiddingStatus }
> = {
  AW: { bg: '#30a46c', fg: 'white', name: 'Awarded' },
  LV: { bg: '#186221', fg: 'white', name: 'Leveling' },
  LP: { bg: '#aacdab', fg: '#173404', name: 'Leveled - Pending Review' },
  BR: { bg: '#12a594', fg: 'white', name: 'Bid Received' },
  RS: { bg: '#0091ff', fg: 'white', name: 'RFP Sent' },
  FU: { bg: '#ab4aba', fg: 'white', name: 'Followed Up' },
  NR: { bg: '#ffc53d', fg: '#633806', name: 'Needs Rebid' },
  NS: { bg: '#a18072', fg: 'white', name: 'Not Started' },
  ND: { bg: '#e5484d', fg: 'white', name: 'No Bid / Declined' },
};

// Status normalization. ClickUp returns task workflow statuses lowercased
// (e.g. "not started", "rfp sent", "awarded") and the source-of-truth
// dropdown in the Bidding list contains a couple of spellings that don't
// round-trip cleanly:
//   - "Bid Recieved" (misspelled in ClickUp; verified in workspace
//     9017603275 against the Bid task dropdown). Both the misspelling and
//     the correct spelling map to canonical "Bid Received".
//   - "Leveled — Pending Review" uses an em-dash in some folders and a
//     hyphen-space-hyphen in others; both must collapse to the canonical
//     "Leveled - Pending Review".
//
// There is a second layer: the team's SharePoint "Budget Outlook" xlsx uses
// informal status words (`sent`, `received`, `hold`, `finalized`,
// `Followed 4/21`). When that vocab is typed straight into ClickUp's Bidding
// Status field instead of the canonical 9-stage dropdown, the normalizer
// still resolves it. `Followed <any date>` is handled by a regex since the
// trailing date varies.
//
// Unknown values return null and log to console.warn so we catch drift.
const BIDDING_ALIASES: Record<string, BiddingStatus> = (() => {
  const map: Record<string, BiddingStatus> = {};
  const add = (raw: string, canonical: BiddingStatus) => {
    map[normalizeKey(raw)] = canonical;
  };
  for (const s of BIDDING_STATUSES) add(s, s);
  // Misspelling preserved verbatim in ClickUp.
  add('Bid Recieved', 'Bid Received');
  // Em-dash and en-dash variants (already normalized by normalizeKey, but
  // listing them here documents the live values we've seen).
  add('Leveled — Pending Review', 'Leveled - Pending Review');
  add('Leveled – Pending Review', 'Leveled - Pending Review');
  // Informal Excel "Budget Outlook" vocabulary.
  add('sent', 'RFP Sent');
  add('received', 'Bid Received');
  add('finalized', 'Awarded');
  add('hold', 'Needs Rebid');
  add('followed', 'Followed Up');
  add('followed up', 'Followed Up');
  return map;
})();

function normalizeKey(s: string): string {
  return s
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// "Followed 4/21", "Followed up 04-21-2026", "followed 4/21/26" → Followed Up.
const FOLLOWED_DATE_RE = /^followed(?:\s+up)?\s+[\d/.\-]+$/;

export function normalizeBiddingStatus(s: string | undefined | null): BiddingStatus | null {
  if (!s) return null;
  const key = normalizeKey(s);
  const hit = BIDDING_ALIASES[key];
  if (hit) return hit;
  // Informal "Followed <date>" — the date suffix varies, so match by shape.
  if (FOLLOWED_DATE_RE.test(key)) return 'Followed Up';
  // Surface drift instead of silently returning null.
  console.warn(`[normalizeBiddingStatus] unknown bidding status: ${JSON.stringify(s)}`);
  return null;
}

// Bids that should NOT compete for lowest. (§6.2)
export const INELIGIBLE_BID_STATUSES: BiddingStatus[] = [
  'No Bid / Declined',
  'Needs Rebid',
  'Not Started',
];

export type TradeCostType = 'Hard' | 'Soft';
export type TradeTypeValue = 'Biddable' | 'Set' | 'N/A' | 'Pending';
export type SyncSeverity = 'info' | 'warning' | 'error';
export type SyncCategory =
  | 'trade_type'
  | 'budget_allocated'
  | 'subcontractors'
  | 'bidding_tasks'
  | 'budget_status'
  | 'unexpected_bidding'
  | 'unlinked_bid'
  | 'biddable_no_subcontractors'
  | 'biddable_no_bid_amount';

export interface SyncIssue {
  code: string;
  severity: SyncSeverity;
  category: SyncCategory;
  message: string;
}

export type SyncStatus = 'ok' | 'warn' | 'error';

export interface SyncHealthSummary {
  total: number;
  bySeverity: Record<SyncSeverity, number>;
  byCategory: Partial<Record<SyncCategory, number>>;
}

// Canonical Trades list (§11). Cost categorization preserved verbatim.
export const SOFT_TRADES = [
  'Expediter',
  'Surveyer',
  'Special Inspector',
  'Concrete Testing & Lab',
  'MEP Shop Drawings',
  'Site Safety Plans',
  'Fire Extinguishers & Safety Equipment',
  'Portable Bathrooms',
  'Vibration Monitoring',
  'DOT Meeting',
  'Superintendent',
  'Live Security',
  'Asbestos Removal',
  'Demolition',
  'Tree Removal',
  'Construction Fence',
  'Dewatering',
  'SOE & Foundation & Superstructure',
  'Soil Trucking & Hauling',
  'Foundation Waterproofing',
  'Steel',
  'Bricks / CMU',
  'Scaffolding / Shed',
  'Hoist',
  'Roofing',
  'Green Roof',
  'Roof Railings / Fencing',
  'Stucco',
  'Windows',
  'Balcony Doors',
  'Main Entrance Door',
  'Garage Door',
  'Balcony Railings',
  'Pavers / Hardscape',
  'Plumbing & Sprinkler',
  'Watermain',
  'HVAC',
  'Pipe Insulation',
  'Electrical',
  'Low Voltage',
  'Fire Alarm',
  'Fire Stopping',
] as const;

export const HARD_TRADES = [
  'Insulation',
  'Framing',
  'Elevator',
  'Garbage Chutes',
  'Interior Doors & Trim',
  'Interior Railings',
  'Tape / Paint',
  'Tile Supply',
  'Tile Installation',
  'Wood Flooring',
  'PTAC Units',
  'Lighting Fixtures',
  'Plumbing Fixtures Bathtubs',
  'Kitchens',
  'Appliances',
  'Lobby / Amenity Finishes',
  'Bike Room Tracks',
  'Mailbox',
  'Signage',
  'Parking Stops & Marking',
  'Street Restoration',
  'Rubbish Removal',
  'Post Construction Cleaning',
  'GC Fee',
] as const;

export const ALL_TRADES = [...SOFT_TRADES, ...HARD_TRADES];

export function costTypeForTrade(trade: string): TradeCostType {
  return (HARD_TRADES as readonly string[]).includes(trade) ? 'Hard' : 'Soft';
}

// Custom field NAMES — verbatim from the live ClickUp workspace (verified
// against GET /list/{id}/task). We resolve option IDs dynamically off each
// task's type_config, so this only needs the names right.
export const BUDGET_FIELDS = {
  Trade: 'Trade',
  TradeList: 'Trade List',
  TradeType: '2. Trade Type',
  CostType: 'Cost Type',
  BudgetAllocated: '💲 Budget Allocated',
  EstimatedBudget: 'Estimated Budget',
  UpdatedBudget: 'Updated Budget',
  Subcontractors: '1. Subcontractors',
  StartBiddingDate: 'Start Bidding Date',
  ProjectID: 'Project ID',
} as const;

export const BIDDING_FIELDS = {
  BiddingStatus: 'Bidding Status',
  Trade: 'Trade',
  TradeList: 'Trade List',
  BidContractedAmount: 'Bid/Contracted Amount',
  DateUpdated: 'Date Updated',
  FollowedUp: 'Followed-Up',
  AwardDate: 'Award Date',
  Link: '🔗 Link',
  Subcontractor: 'Subcontractor',
} as const;

// ClickUp API entity types ----------------------------------------------

export interface CUCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: any;
  value?: any;
}

// The Budget & Bidding team — SOP §2, exactly seven people. The workload
// section and team filters source from this list, never from arbitrary
// ClickUp assignees (which include unrelated P&P staff).
export interface TeamMember {
  name: string;
  initials: string;
}
export const TEAM: TeamMember[] = [
  { name: 'Isaac Adler', initials: 'IA' },
  { name: 'Tuly Steinmetz', initials: 'TS' },
  { name: 'Shlome Friedman', initials: 'SF' },
  { name: 'Raizy Hollander', initials: 'RH' },
  { name: 'Malky Teitelbaum', initials: 'MT' },
  { name: 'Luis Núñez', initials: 'LN' },
  { name: 'Shimon Katz', initials: 'SK' },
];

export interface CUTask {
  id: string;
  custom_id?: string | null;
  name: string;
  status: { status: string; color?: string; orderindex?: number | string };
  assignees?: Array<{ id?: number | string; username?: string; email?: string }>;
  date_updated?: string;
  date_created?: string;
  orderindex?: string;
  list?: { id: string; name?: string };
  folder?: { id: string; name?: string };
  space?: { id: string };
  parent?: string | null;
  top_level_parent?: string | null;
  url?: string;
  custom_fields: CUCustomField[];
}

export interface CUFolder {
  id: string;
  name: string;
  lists?: CUList[];
}

export interface CUList {
  id: string;
  name: string;
  folder?: { id: string; name?: string };
}

// Dashboard domain types ------------------------------------------------

export interface BudgetTask {
  id: string;
  url: string;
  trade: string;
  tradeType: TradeTypeValue | null;
  costType: TradeCostType;
  /** "💲 Budget Allocated" CU field — the original approved estimate. */
  budgetAllocated: number | null;
  /**
   * "Estimated Budget" CU field — the team's planning number, mirrors the
   * Excel "Budget Outlook" Estimated column. `null` = unknown estimate;
   * `0` = a genuine $0 line item (e.g. DOT Meeting).
   */
  estimatedBudget: number | null;
  updatedBudget: number | null;
  subcontractors: string[];
  budgetStatus: string;
  projectFolder: string;
  projectFolderId: string;
  listId: string;
  syncStatus: SyncStatus;
  syncIssues: SyncIssue[];
  expectedBiddingCount: number;
  actualBiddingCount: number;
}

/**
 * A single subcontractor bid — a subtask in `02. Bidding` whose parent is a
 * trade-group task. Joins to a BudgetTask by `trade` (different lists, no
 * shared parent).
 */
export interface BiddingTask {
  id: string;
  url: string;
  tradeGroupId: string | null;
  trade: string | null;
  subcontractor: string;
  subcontractorUrl: string | null;
  bidAmount: number | null;
  /** 9-stage status: real workflow status if meaningful, else derived from signals. */
  status: BiddingStatus;
  /** Whether `status` came from explicit workflow status vs. derived from Award Date / amount. */
  statusDerived: boolean;
  dateUpdated: string | null;
  awardDate: string | null;
  followedUp: string | null;
  link: string | null;
  /** ClickUp assignee display names — may be empty if the task is unassigned. */
  assignees: string[];
  projectFolder: string;
  projectFolderId: string;
  listId: string;
  orderindex: string;
}

/** A per-trade grouping task in `02. Bidding` (parent == null). Carries the trade-level status. */
export interface TradeBiddingGroup {
  id: string;
  trade: string;
  status: BiddingStatus;
  projectFolderId: string;
}

export interface ProjectSnapshot {
  folderId: string;
  folderName: string;
  budgetTasks: BudgetTask[];
  biddingTasks: BiddingTask[];
  tradeGroups: TradeBiddingGroup[];
  syncHealth: SyncHealthSummary;
}
