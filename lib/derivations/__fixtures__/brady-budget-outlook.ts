// Real Brady 800 Brady Ave Budget Outlook fixture
// Source: "800 Brady Ave - Bidding Status xlsx.xlsx" (Budget Outlook sheet, rows 7-60)
// Uploaded by user 2026-05-19; reflects state of the Brady budget as of that date.
// Format: every Excel "Included"/"NA"/empty cell is `null` (NOT 0). Excel's SUM
// formula skips those, and so does our derivation. A literal 0 means the team
// has confirmed $0 (e.g. Garage Door's estimate before its bid landed).
//
// Note on the `finalizedLowestBid` column: the Excel sheet uses a literal 0 in
// this column as a placeholder for "no finalized bid yet" on ~10 trades
// (Superintendent, Survey, Plumbing- sprinkler, …). The real
// `finalizedLowestBid()` derivation in lib/derivations/budget.ts never returns
// 0 — it filters to positive amounts and returns `null` when none exist — so
// the row-rule test normalizes 0 → null before feeding `newBudget()`.

export interface BradyBudgetRow {
  trade: string;
  estimatedBudget: number | null;
  /** Already known from the Excel — not derived in this fixture. */
  finalizedLowestBid: number | null;
  newBudget: number | null;
}

export const BRADY_BUDGET_OUTLOOK: BradyBudgetRow[] = [
  { trade: 'DOT meeting', estimatedBudget: 2500, finalizedLowestBid: null, newBudget: 2500 },
  { trade: 'Fence', estimatedBudget: 28000, finalizedLowestBid: 15950, newBudget: 15950 },
  { trade: 'Superintendent', estimatedBudget: 96000, finalizedLowestBid: 0, newBudget: 96000 },
  { trade: 'Site safety coordination', estimatedBudget: 128000, finalizedLowestBid: null, newBudget: null },
  { trade: 'Special inspector', estimatedBudget: 99000, finalizedLowestBid: 74500, newBudget: 74500 },
  { trade: 'Survey', estimatedBudget: 25000, finalizedLowestBid: 0, newBudget: 25000 },
  { trade: 'Live Security', estimatedBudget: 17000, finalizedLowestBid: 8800, newBudget: 8800 },
  { trade: 'Site Safety Plan', estimatedBudget: 5000, finalizedLowestBid: 2500, newBudget: 2500 },
  { trade: 'fire extignitures', estimatedBudget: 5000, finalizedLowestBid: null, newBudget: 5000 },
  { trade: 'Bathrooms', estimatedBudget: 14000, finalizedLowestBid: null, newBudget: 14000 },
  { trade: 'Monitoring - vibration', estimatedBudget: 27000, finalizedLowestBid: null, newBudget: 27000 },
  { trade: 'Foundation', estimatedBudget: 600000, finalizedLowestBid: 3030000, newBudget: 3030000 },
  { trade: 'Structure', estimatedBudget: 2420000, finalizedLowestBid: null, newBudget: null },
  { trade: 'Soil - Trucking', estimatedBudget: 150000, finalizedLowestBid: null, newBudget: 150000 },
  { trade: 'Concrete LAB inspector', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Plumbing- sprinkler', estimatedBudget: 1287000, finalizedLowestBid: 0, newBudget: 1287000 },
  { trade: 'Pipe insualtion', estimatedBudget: null, finalizedLowestBid: 0, newBudget: null },
  { trade: 'Elevator', estimatedBudget: 590000, finalizedLowestBid: 578000, newBudget: 578000 },
  { trade: 'Windows', estimatedBudget: 275000, finalizedLowestBid: 325000, newBudget: 325000 },
  { trade: 'Main doors', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Framing Exterior Interior', estimatedBudget: 1900000, finalizedLowestBid: 0, newBudget: 1900000 },
  { trade: 'Sheetrock', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Tape / paint', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Trimming - Doors', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Fire Stopping', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Insulation Exterior walls / interior partition', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Watermain', estimatedBudget: 85000, finalizedLowestBid: 0, newBudget: 85000 },
  { trade: 'Hoist', estimatedBudget: 190000, finalizedLowestBid: 0, newBudget: 190000 },
  { trade: 'Scaffold/Shed', estimatedBudget: 570000, finalizedLowestBid: 0, newBudget: 570000 },
  { trade: 'Chutes / Compactors', estimatedBudget: 38000, finalizedLowestBid: 35600, newBudget: 35600 },
  { trade: 'Electric', estimatedBudget: 990000, finalizedLowestBid: 920000, newBudget: 920000 },
  { trade: 'Lighting Material', estimatedBudget: 60000, finalizedLowestBid: null, newBudget: null },
  { trade: 'Fire Alarm', estimatedBudget: 42000, finalizedLowestBid: 93450, newBudget: 93450 },
  { trade: 'Low Voltage', estimatedBudget: 125000, finalizedLowestBid: 148925, newBudget: 148925 },
  { trade: 'Roofing', estimatedBudget: 195000, finalizedLowestBid: 257609, newBudget: 257609 },
  { trade: 'HVAC', estimatedBudget: 225000, finalizedLowestBid: 204000, newBudget: 204000 },
  { trade: 'Ptac units', estimatedBudget: 350000, finalizedLowestBid: 302991, newBudget: 302991 },
  { trade: 'Steel', estimatedBudget: 80000, finalizedLowestBid: 0, newBudget: 80000 },
  { trade: 'Stucco', estimatedBudget: 570000, finalizedLowestBid: 600212, newBudget: 600212 },
  { trade: 'Tiles', estimatedBudget: 180000, finalizedLowestBid: 126549.23, newBudget: 126549.23 },
  { trade: 'Tiles Installation', estimatedBudget: 385000, finalizedLowestBid: 428289, newBudget: 428289 },
  { trade: 'Plumbing Fixtures', estimatedBudget: 144000, finalizedLowestBid: 125659.1, newBudget: 125659.1 },
  { trade: 'Bathtubs', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'Kitchens', estimatedBudget: 215000, finalizedLowestBid: 0, newBudget: 215000 },
  { trade: 'Apt appliances', estimatedBudget: 145000, finalizedLowestBid: null, newBudget: 145000 },
  { trade: 'Garage Door', estimatedBudget: 0, finalizedLowestBid: 13500, newBudget: 13500 },
  { trade: 'BPP', estimatedBudget: 125000, finalizedLowestBid: 83957, newBudget: 83957 },
  { trade: 'Signs', estimatedBudget: 14000, finalizedLowestBid: 0, newBudget: 14000 },
  { trade: 'Mailbox', estimatedBudget: 20000, finalizedLowestBid: 13500, newBudget: 13500 },
  { trade: 'Garbage Removal', estimatedBudget: 255000, finalizedLowestBid: 261176.37, newBudget: 261176.37 },
  { trade: 'Parking stops and marking', estimatedBudget: 8000, finalizedLowestBid: null, newBudget: 8000 },
  { trade: 'Bike room', estimatedBudget: 2000, finalizedLowestBid: null, newBudget: 2000 },
  { trade: 'Green roof', estimatedBudget: null, finalizedLowestBid: null, newBudget: null },
  { trade: 'GC Fee', estimatedBudget: 1000000, finalizedLowestBid: null, newBudget: 1000000 },
];

export const BRADY_TOTALS = {
  estimated: 13_681_500,
  finalizedLowest: 7_650_167.7,
  newBudget: 13_465_667.7,
} as const;

// Rows whose Excel `New Budget` cell breaks the standard derivation rule
// (New Budget = finalized-if-known, else estimated). All three are the same
// human data-entry omission: an estimate is present but the New Budget cell
// was left blank instead of carrying the estimate forward.
//
//   - "Site safety coordination" — Estimated $128k, New Budget blank
//   - "Structure"                — Estimated $2.42M, New Budget blank
//   - "Lighting Material"        — Estimated $60k, "Included" in Electric
//
// The brief documented only the first and third; "Structure" was found while
// verifying the real fixture row-by-row and is the same class of omission.
export const BRADY_RULE_EXCEPTIONS: ReadonlySet<string> = new Set([
  'Site safety coordination',
  'Structure',
  'Lighting Material',
]);
