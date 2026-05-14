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

// Status normalization — ClickUp sometimes returns lowercased names.
export function normalizeBiddingStatus(s: string | undefined | null): BiddingStatus | null {
  if (!s) return null;
  const lower = s.trim().toLowerCase();
  for (const status of BIDDING_STATUSES) {
    if (status.toLowerCase() === lower) return status;
  }
  return null;
}

// Bids that should NOT compete for lowest. (§6.2)
export const INELIGIBLE_BID_STATUSES: BiddingStatus[] = [
  'No Bid / Declined',
  'Needs Rebid',
  'Not Started',
];

export type TradeCostType = 'Hard' | 'Soft';
export type TradeTypeValue = 'Biddable' | 'Set' | 'N/A';

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
  UpdatedBudget: 'Updated Budget',
  Subcontractors: '1. Subcontractors',
  StartBiddingDate: 'Start Bidding Date',
  ProjectID: 'Project ID',
} as const;

export const BIDDING_FIELDS = {
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

export interface CUTask {
  id: string;
  custom_id?: string | null;
  name: string;
  status: { status: string; color?: string; orderindex?: number | string };
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
  budgetAllocated: number | null;
  updatedBudget: number | null;
  budgetStatus: string;
  projectFolder: string;
  projectFolderId: string;
  listId: string;
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
}
