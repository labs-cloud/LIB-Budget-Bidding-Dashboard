// unifiedDemoData.ts — Static reference data for the unified Budget & Bidding
// dashboard, mirroring lib/project/variants/bb-data.js + the inline timeline /
// per-trade arrays in lib/project/variants/e-budget-unified.html from the
// design handoff. Live ClickUp data eventually replaces this via lib/data.ts.

export type StatusCode = 'NS' | 'RS' | 'FU' | 'BR' | 'LV' | 'LP' | 'NR' | 'ND' | 'AW';
export type CostType = 'hard' | 'soft';

export const STATUSES: Record<StatusCode, { code: StatusCode; name: string }> = {
  NS: { code: 'NS', name: 'Not Started' },
  RS: { code: 'RS', name: 'RFP Sent' },
  FU: { code: 'FU', name: 'Followed Up' },
  BR: { code: 'BR', name: 'Bid Received' },
  LV: { code: 'LV', name: 'Leveling' },
  LP: { code: 'LP', name: 'Leveled - Pending Review' },
  NR: { code: 'NR', name: 'Needs Rebid' },
  ND: { code: 'ND', name: 'No Bid / Declined' },
  AW: { code: 'AW', name: 'Awarded' },
};

export const STATUS_COLORS: Record<StatusCode, string> = {
  NS: 'rgba(161,128,114,0.7)',
  RS: '#0091ff',
  FU: '#ab4aba',
  BR: '#12a594',
  LV: '#186221',
  LP: '#aacdab',
  NR: '#ffc53d',
  ND: '#e5484d',
  AW: '#30a46c',
};

export interface TradeDef {
  name: string;
  cost: CostType;
  abbr: string;
}

export const TRADES: TradeDef[] = [
  { name: 'SOE & Foundation & Superstructure', cost: 'hard', abbr: 'SOE' },
  { name: 'Foundation Waterproofing', cost: 'hard', abbr: 'FW' },
  { name: 'Plumbing & Sprinkler', cost: 'hard', abbr: 'P&S' },
  { name: 'Electrical', cost: 'hard', abbr: 'ELEC' },
  { name: 'Scaffolding / Shed', cost: 'soft', abbr: 'SCF' },
  { name: 'Live Security', cost: 'soft', abbr: 'SEC' },
  { name: 'Rubbish Removal', cost: 'soft', abbr: 'RUB' },
  { name: 'HVAC', cost: 'hard', abbr: 'HVAC' },
  { name: 'Elevator', cost: 'hard', abbr: 'ELV' },
  { name: 'Windows', cost: 'hard', abbr: 'WIN' },
  { name: 'Roofing', cost: 'hard', abbr: 'ROOF' },
  { name: 'Stucco', cost: 'hard', abbr: 'STC' },
  { name: 'Fire Alarm', cost: 'hard', abbr: 'FA' },
  { name: 'Kitchens', cost: 'hard', abbr: 'KIT' },
];

export const PROJECTS: string[] = [
  'Crotona', 'Dekalb', 'Hoe', 'University', 'Atlantic',
  'Bedford', 'Brady', 'Eckford', 'White Plains', 'Woodycrest',
];

// 14 × 10 status grid (rows=trades, cols=projects). Brady is col index 6.
export const MATRIX: StatusCode[][] = [
  ['AW','AW','LV','LP','AW','AW','LV','LP','AW','AW'],
  ['AW','LP','BR','LV','AW','AW','BR','LP','LV','AW'],
  ['BR','BR','RS','FU','BR','LP','BR','FU','RS','BR'],
  ['LV','LP','BR','RS','LP','AW','BR','RS','BR','BR'],
  ['AW','AW','AW','AW','LV','AW','AW','AW','AW','AW'],
  ['RS','RS','NS','RS','RS','BR','RS','NS','NS','RS'],
  ['BR','BR','FU','BR','NR','BR','BR','FU','BR','NR'],
  ['RS','FU','RS','NS','RS','BR','BR','FU','NS','RS'],
  ['NS','NS','NS','NS','RS','NS','NS','NS','NS','NS'],
  ['RS','BR','RS','RS','FU','BR','BR','RS','RS','BR'],
  ['FU','RS','BR','FU','BR','RS','RS','FU','BR','RS'],
  ['NS','RS','NS','NS','RS','NS','RS','NS','NS','RS'],
  ['RS','FU','RS','NS','RS','FU','FU','RS','RS','NS'],
  ['NS','NS','ND','NS','NS','NS','NS','NS','ND','NS'],
];

export interface StaleBid {
  sub: string;
  trade: string;
  project: string;
  days: number;
  rfp: string;
}

export const STALE_BIDS: StaleBid[] = [
  { sub: 'SafeSite Alarm',     trade: 'Fire Alarm',  project: 'White Plains', days: 14, rfp: 'May 1' },
  { sub: 'Alert Fire Systems', trade: 'Fire Alarm',  project: 'Crotona',      days: 12, rfp: 'May 3' },
  { sub: 'CityWire NYC',       trade: 'Electrical',  project: 'University',   days: 11, rfp: 'May 4' },
  { sub: 'TopLine Roofing',    trade: 'Roofing',     project: 'Atlantic',     days: 10, rfp: 'May 5' },
  { sub: 'NY Climate Systems', trade: 'HVAC',        project: 'Bedford',      days: 9,  rfp: 'May 6' },
];

// ---- Portfolio gantt (14 trades, grouped by cost type)
export type GanttBarKind = 'in-flight' | 'in-flight stale' | 'awarded' | 'set';

export interface GanttRow {
  tagShort: 'SOFT' | 'HARD';
  name: string;
  barKind: GanttBarKind;
  /** left% / width% on the Apr 1 → Jul 15 axis. */
  left: number;
  width: number;
  /** "Apr 1 → May 5"-ish label drawn inside the bar. */
  span: string;
  /** Number of pips drawn at the start of the bar (RFP, follow-ups, etc.). */
  pips: number;
  pillKind: GanttBarKind;
  pillText: string;
  sub: string;
}

export interface GanttGroup {
  cost: CostType;
  label: 'Soft Cost' | 'Hard Cost';
  count: string;
  rows: GanttRow[];
}

export const GANTT_TODAY_PCT = 36.4;

export const GANTT_AXIS_TICKS = [
  { left: 0,    label: 'Apr 1' },
  { left: 12.4, label: 'Apr 15' },
  { left: 24.8, label: 'May 1' },
  { left: 36.4, label: 'May 15', today: true },
  { left: 50.4, label: 'Jun 1' },
  { left: 62.0, label: 'Jun 15' },
  { left: 75.2, label: 'Jul 1' },
  { left: 86.8, label: 'Jul 15' },
];

export const GANTT_GROUPS: GanttGroup[] = [
  {
    cost: 'soft',
    label: 'Soft Cost',
    count: '3 trades',
    rows: [
      { tagShort: 'SOFT', name: 'Scaffolding / Shed', barKind: 'awarded',         left: 0,    width: 29,   span: 'Apr 1 → May 5',   pips: 3, pillKind: 'awarded',         pillText: '10 awarded',  sub: 'complete'      },
      { tagShort: 'SOFT', name: 'Live Security',      barKind: 'in-flight stale', left: 24.8, width: 39.2, span: 'May 1 → Jun 20',  pips: 2, pillKind: 'in-flight stale', pillText: '14d · stale', sub: '8 in flight'   },
      { tagShort: 'SOFT', name: 'Rubbish Removal',    barKind: 'awarded',         left: 3.3,  width: 37.2, span: 'Apr 5 → May 20',  pips: 2, pillKind: 'awarded',         pillText: '8 awarded',   sub: '2 reviewing'   },
    ],
  },
  {
    cost: 'hard',
    label: 'Hard Cost',
    count: '11 trades',
    rows: [
      { tagShort: 'HARD', name: 'SOE & Foundation & Superstructure', barKind: 'in-flight',       left: 5.8,  width: 56.2, span: 'Apr 8 → Jun 15',   pips: 2, pillKind: 'in-flight',       pillText: '33d · in flight', sub: '4 leveling'  },
      { tagShort: 'HARD', name: 'Foundation Waterproofing',          barKind: 'in-flight',       left: 11.6, width: 47.1, span: 'Apr 15 → Jun 10',  pips: 1, pillKind: 'in-flight',       pillText: '27d · in flight', sub: '3 in flight' },
      { tagShort: 'HARD', name: 'Plumbing & Sprinkler',              barKind: 'in-flight',       left: 15.7, width: 59.5, span: 'Apr 20 → Jul 1',   pips: 2, pillKind: 'in-flight',       pillText: '25d · in flight', sub: '6 in flight' },
      { tagShort: 'HARD', name: 'Electrical',                        barKind: 'in-flight',       left: 14.0, width: 55.4, span: 'Apr 18 → Jun 25',  pips: 2, pillKind: 'in-flight',       pillText: '24d · in flight', sub: '5 in flight' },
      { tagShort: 'HARD', name: 'HVAC',                              barKind: 'in-flight',       left: 17.4, width: 52.0, span: 'Apr 22 → Jun 25',  pips: 2, pillKind: 'in-flight',       pillText: '21d · in flight', sub: '6 in flight' },
      { tagShort: 'HARD', name: 'Elevator',                          barKind: 'set',             left: 0,    width: 24.8, span: 'Apr 1 → May 1 · SET', pips: 1, pillKind: 'set',          pillText: '9 set',           sub: 'no bidding'  },
      { tagShort: 'HARD', name: 'Windows',                           barKind: 'in-flight',       left: 3.3,  width: 58.7, span: 'Apr 5 → Jun 15',   pips: 2, pillKind: 'in-flight',       pillText: '19d · in flight', sub: '5 in flight' },
      { tagShort: 'HARD', name: 'Roofing',                           barKind: 'in-flight',       left: 24.8, width: 62.0, span: 'May 1 → Jul 15',   pips: 2, pillKind: 'in-flight',       pillText: '10d · in flight', sub: '7 in flight' },
      { tagShort: 'HARD', name: 'Stucco',                            barKind: 'in-flight',       left: 0,    width: 42.1, span: 'Apr 1 → May 22',   pips: 1, pillKind: 'in-flight',       pillText: '12d · in flight', sub: '5 in flight' },
      { tagShort: 'HARD', name: 'Fire Alarm',                        barKind: 'in-flight stale', left: 19.8, width: 62.8, span: 'Apr 25 → Jul 10',  pips: 2, pillKind: 'in-flight stale', pillText: '14d · stale',     sub: '8 in flight' },
      { tagShort: 'HARD', name: 'Kitchens',                          barKind: 'set',             left: 0,    width: 24.0, span: 'Apr 1 → Apr 30 · SET', pips: 1, pillKind: 'set',         pillText: '9 set',           sub: 'no bidding'  },
    ],
  },
];

// ---- 800 Brady — Project timeline rows
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
}

export interface TimelineGroup {
  group: 'awarded' | 'bidding' | 'set';
  label: string;
  sub: string;
  rows: TimelineRow[];
}

export const BRADY_TIMELINE: TimelineGroup[] = [
  {
    group: 'awarded',
    label: 'Awarded · 8 trades',
    sub: '$8.94M committed',
    rows: [
      { stat: 'aw', tag: 'WIN',  name: 'Windows',                                  sub: 'Apex Glazing',           amt: '$598,500',   alloc: '$620,000',   rfp: 'Apr 8',  date: 'Awarded · Apr 30, 2026' },
      { stat: 'aw', tag: 'SCF',  name: 'Scaffolding / Shed',                       sub: 'Empire Scaffold Inc.',   amt: '$184,500',   alloc: '$190,000',   rfp: 'Apr 1',  date: 'Awarded · Apr 28, 2026' },
      { stat: 'aw', tag: 'RUB',  name: 'Rubbish Removal',                          sub: 'Action Waste',           amt: '$88,200',    alloc: '$95,000',    rfp: 'Apr 5',  date: 'Awarded · Apr 22, 2026' },
      { stat: 'aw', tag: 'STC',  name: 'Stucco',                                   sub: 'EastCoast Stucco',       amt: '$232,000',   alloc: '$240,000',   rfp: 'Apr 2',  date: 'Awarded · Apr 18, 2026' },
      { stat: 'aw', tag: 'SOE',  name: 'SOE & Foundation & Superstructure',        sub: 'Skyline Foundations LLC',amt: '$4,280,000', alloc: '$4,500,000', rfp: 'Mar 18', date: 'Awarded · Apr 14, 2026' },
      { stat: 'aw', tag: 'ELEC', name: 'Electrical',                               sub: 'Volt & Bolt Electric',   amt: '$1,440,000', alloc: '$1,500,000', rfp: 'Mar 14', date: 'Awarded · Apr 10, 2026' },
      { stat: 'aw', tag: 'HVAC', name: 'HVAC',                                     sub: 'Arctic Mechanical',      amt: '$720,000',   alloc: '$740,000',   rfp: 'Mar 8',  date: 'Awarded · Apr 4, 2026' },
      { stat: 'aw', tag: 'FW',   name: 'Foundation Waterproofing',                 sub: 'Tri-State Waterproofing',amt: '$298,400',   alloc: '$320,000',   rfp: 'Mar 5',  date: 'Awarded · Apr 1, 2026' },
    ],
  },
  {
    group: 'bidding',
    label: 'Bidding set · in progress · 4 trades',
    sub: '$3.05M projected',
    rows: [
      { stat: 'lv', tag: 'P&S',  name: 'Plumbing & Sprinkler', sub: '3 subs invited · low Brooklyn Mech', amt: '$1,198,500', alloc: '$1,280,000', rfp: 'Apr 20', date: 'Leveling · bids due May 22, 2026' },
      { stat: 'rs', tag: 'ROOF', name: 'Roofing',              sub: '2 subs invited',                     amt: null,         alloc: '$410,000',   rfp: 'May 5',  date: 'Awaiting response · RFP sent May 5' },
      { stat: 'rs', tag: 'SEC',  name: 'Live Security',        sub: '2 subs invited',                     amt: null,         alloc: '$95,000',    rfp: 'May 6',  date: 'Awaiting response · RFP sent May 6' },
      { stat: 'fu', tag: 'FA',   name: 'Fire Alarm',           sub: '2 subs invited · 0 replies',         amt: null,         alloc: '$180,000',   rfp: 'May 1',  date: '⚠ Followed up 12d ago · no response · stale', warn: true },
    ],
  },
  {
    group: 'set',
    label: 'Trade Type: Set · 2 trades',
    sub: '$2.79M direct',
    rows: [
      { stat: 'set', tag: 'ELV', name: 'Elevator', sub: 'Otis Worldwide',    amt: '$920,000',   alloc: '$920,000',   rfp: null, date: 'Set · Apr 14, 2026 · no bidding' },
      { stat: 'set', tag: 'KIT', name: 'Kitchens', sub: 'CabinetWorks NYC',  amt: '$1,870,000', alloc: '$1,870,000', rfp: null, date: 'Set · Apr 9, 2026 · no bidding' },
    ],
  },
];

export const STATUS_PILL_FOR_TIMELINE: Record<TimelineStat, [string, string, string]> = {
  aw:  ['aw', 'AW', 'Awarded'],
  lv:  ['lv', 'LV', 'Leveling'],
  rs:  ['rs', 'RS', 'RFP Sent'],
  fu:  ['fu', 'FU', 'Followed Up'],
  br:  ['br', 'BR', 'Bid Received'],
  set: ['aw', 'AW', 'Awarded · Set'],
};

export interface InFlightCard {
  trade: string;
  sub: string;
  days: string;
  meta: string;
  crit?: boolean;
}

export const BRADY_IN_FLIGHT: InFlightCard[] = [
  { trade: 'Plumbing & Sprinkler', sub: 'Brooklyn Mech & Fire',    days: '25d',         meta: 'RFP Apr 20 · BR $1,198,500' },
  { trade: 'Roofing',              sub: 'TopLine Roofing',         days: '10d',         meta: 'RFP May 5 · awaiting reply' },
  { trade: 'Live Security',        sub: 'Sentinel Site Services',  days: '9d',          meta: 'RFP May 6 · awaiting reply' },
  { trade: 'Fire Alarm',           sub: 'Alert Fire Systems',      days: '14d · stale', meta: 'RFP May 1 · followed up 12d ago', crit: true },
];

// ---- Per-trade matrix (800 Brady)
export interface PtSub {
  name: string;
  status: StatusCode;
  amount: number | null;
  isLow?: boolean;
  rfp: string;
  last: string;
}

export interface PtTrade {
  name: string;
  cost: CostType;
  tag: string;
  stage: string;
  updated: number;
  allocated: number;
  subs: (PtSub | null)[];
}

export const PT_TRADES: PtTrade[] = [
  { name: 'SOE & Foundation & Superstructure', cost: 'hard', tag: 'SOE', stage: 'Awarded · Apr 14', updated: 4280000, allocated: 4500000, subs: [
    { name: 'Skyline Foundations LLC', status: 'AW', amount: 4280000, isLow: true, rfp: 'Mar 18', last: 'Apr 14' },
    { name: 'Bronx Concrete Group',    status: 'BR', amount: 4412500,             rfp: 'Mar 18', last: 'Apr 5'  },
    { name: 'Atlas Subsurface',        status: 'BR', amount: 4198000,             rfp: 'Mar 18', last: 'Apr 10' },
    { name: 'Hudson Geostructures',    status: 'NR', amount: null,                rfp: 'Mar 18', last: 'Apr 1'  },
  ]},
  { name: 'Foundation Waterproofing', cost: 'hard', tag: 'FW', stage: 'Awarded · Apr 1', updated: 298400, allocated: 320000, subs: [
    { name: 'Tri-State Waterproofing', status: 'AW', amount: 298400, isLow: true, rfp: 'Mar 5', last: 'Apr 1'  },
    { name: 'HydroGuard Systems',      status: 'BR', amount: 312000,             rfp: 'Mar 5', last: 'Mar 25' },
    null, null,
  ]},
  { name: 'Plumbing & Sprinkler', cost: 'hard', tag: 'P&S', stage: 'Leveling · bids due May 22', updated: 1198500, allocated: 1280000, subs: [
    { name: 'Brooklyn Mech & Fire',    status: 'LV', amount: 1198500, isLow: true, rfp: 'Apr 20', last: 'May 12' },
    { name: 'Northway Plumbing',       status: 'BR', amount: 1265000,             rfp: 'Apr 20', last: 'May 11' },
    { name: 'Liberty Sprinkler Co.',   status: 'FU', amount: null,                rfp: 'Apr 20', last: 'May 7'  },
    null,
  ]},
  { name: 'Electrical', cost: 'hard', tag: 'ELEC', stage: 'Awarded · Apr 10', updated: 1440000, allocated: 1500000, subs: [
    { name: 'Volt & Bolt Electric',    status: 'AW', amount: 1440000, isLow: true, rfp: 'Mar 14', last: 'Apr 10' },
    { name: 'CityWire NYC',            status: 'ND', amount: null,                rfp: 'Mar 14', last: 'Mar 28' },
    null, null,
  ]},
  { name: 'Scaffolding / Shed', cost: 'soft', tag: 'SCF', stage: 'Awarded · Apr 28', updated: 184500, allocated: 190000, subs: [
    { name: 'Empire Scaffold Inc.',    status: 'AW', amount: 184500, isLow: true, rfp: 'Apr 1', last: 'Apr 28' },
    { name: 'NYC ScaffoldWorks',       status: 'BR', amount: 198000,             rfp: 'Apr 1', last: 'Apr 18' },
    null, null,
  ]},
  { name: 'Live Security', cost: 'soft', tag: 'SEC', stage: 'RFP Sent · awaiting response', updated: 95000, allocated: 95000, subs: [
    { name: 'Sentinel Site Services',  status: 'RS', amount: null, rfp: 'May 6', last: 'May 6' },
    { name: 'Watchpost Security',      status: 'NS', amount: null, rfp: '—',     last: '—'     },
    null, null,
  ]},
  { name: 'Rubbish Removal', cost: 'soft', tag: 'RUB', stage: 'Awarded · Apr 22', updated: 88200, allocated: 95000, subs: [
    { name: 'Action Waste',            status: 'AW', amount: 88200, isLow: true, rfp: 'Apr 5', last: 'Apr 22' },
    { name: 'Five Boro Carting',       status: 'BR', amount: 92400,             rfp: 'Apr 5', last: 'Apr 20' },
    null, null,
  ]},
  { name: 'HVAC', cost: 'hard', tag: 'HVAC', stage: 'Awarded · Apr 4', updated: 720000, allocated: 740000, subs: [
    { name: 'Arctic Mechanical',       status: 'AW', amount: 720000, isLow: true, rfp: 'Mar 8', last: 'Apr 4'  },
    { name: 'NY Climate Systems',      status: 'FU', amount: null,                rfp: 'Mar 8', last: 'Mar 25' },
    null, null,
  ]},
  { name: 'Elevator', cost: 'hard', tag: 'ELV', stage: 'Trade Type: Set · Apr 14', updated: 920000, allocated: 920000, subs: [
    { name: 'Otis Worldwide',          status: 'AW', amount: 920000, isLow: true, rfp: '— set', last: 'Apr 14' },
    null, null, null,
  ]},
  { name: 'Windows', cost: 'hard', tag: 'WIN', stage: 'Awarded · Apr 30', updated: 598500, allocated: 620000, subs: [
    { name: 'Apex Glazing',            status: 'AW', amount: 598500, isLow: true, rfp: 'Apr 8', last: 'Apr 30' },
    { name: 'Pella Commercial NY',     status: 'BR', amount: 612000,             rfp: 'Apr 8', last: 'Apr 25' },
    null, null,
  ]},
  { name: 'Roofing', cost: 'hard', tag: 'ROOF', stage: 'RFP Sent · awaiting response', updated: 410000, allocated: 410000, subs: [
    { name: 'TopLine Roofing',         status: 'RS', amount: null, rfp: 'May 5', last: 'May 5' },
    { name: 'Skyhook Roofing',         status: 'RS', amount: null, rfp: 'May 5', last: 'May 5' },
    null, null,
  ]},
  { name: 'Stucco', cost: 'hard', tag: 'STC', stage: 'Awarded · Apr 18', updated: 232000, allocated: 240000, subs: [
    { name: 'EastCoast Stucco',        status: 'AW', amount: 232000, isLow: true, rfp: 'Apr 2', last: 'Apr 18' },
    null, null, null,
  ]},
  { name: 'Fire Alarm', cost: 'hard', tag: 'FA', stage: 'Followed up · stale', updated: 180000, allocated: 180000, subs: [
    { name: 'Alert Fire Systems',      status: 'FU', amount: null, rfp: 'May 1', last: 'May 3' },
    { name: 'SafeSite Alarm',          status: 'FU', amount: null, rfp: 'May 1', last: 'May 1' },
    null, null,
  ]},
  { name: 'Kitchens', cost: 'hard', tag: 'KIT', stage: 'Trade Type: Set · Apr 9', updated: 1870000, allocated: 1870000, subs: [
    { name: 'CabinetWorks NYC',        status: 'AW', amount: 1870000, isLow: true, rfp: '— set', last: 'Apr 9' },
    null, null, null,
  ]},
];

export const fmtShort = (n: number | null): string => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) {
    return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  }
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + n;
};

// Mini-gantt axis — Mar 1 → May 20 (80 days), today = May 15.
export const MG_AXIS_START = new Date('2026-03-01').getTime();
export const MG_AXIS_TODAY = new Date('2026-05-15').getTime();
export const MG_AXIS_END_DAYS = 80;
export const MG_TODAY_PCT = ((MG_AXIS_TODAY - MG_AXIS_START) / 86_400_000) / MG_AXIS_END_DAYS * 100;

export function dayPct(s: string | null | undefined): number | null {
  if (!s || s === '—' || (typeof s === 'string' && s.startsWith('— set'))) return null;
  const m = s.match(/^([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  const month = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6 }[m[1] as 'Jan'];
  if (month == null) return null;
  const d = new Date(2026, month, parseInt(m[2], 10)).getTime();
  return Math.max(0, Math.min(100, ((d - MG_AXIS_START) / 86_400_000) / MG_AXIS_END_DAYS * 100));
}
