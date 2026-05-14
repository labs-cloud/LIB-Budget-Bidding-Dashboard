import {
  BiddingStatus,
  BiddingTask,
  BudgetTask,
  CODE_STATUS,
  ProjectSnapshot,
  costTypeForTrade,
} from './types';

/**
 * Realistic mock data so the dashboard renders before CLICKUP_API_TOKEN is wired.
 * Mirrors the bb_*_v2.html mockup fixtures. The shapes match what the live
 * ClickUp client returns so views are agnostic of source.
 */

interface MockProject {
  folderId: string;
  folderName: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  address?: string;
}

export const MOCK_PROJECTS: MockProject[] = [
  { folderId: '900001', folderName: '800 Brady Ave', shortLabel: 'Brady', badgeBg: '#ab4aba', badgeText: 'BR', address: 'Bronx, NY 10462' },
  { folderId: '900002', folderName: '1450 Dekalb Ave', shortLabel: 'Dekalb', badgeBg: '#0091ff', badgeText: 'DK', address: 'Brooklyn, NY 11237' },
  { folderId: '900003', folderName: '2100 Hoe Ave', shortLabel: 'Hoe', badgeBg: '#30a46c', badgeText: 'HO', address: 'Bronx, NY 10460' },
  { folderId: '900004', folderName: '94 White Plains Rd', shortLabel: 'White Pl', badgeBg: '#d85a30', badgeText: 'WP', address: 'Bronx, NY 10473' },
  { folderId: '900005', folderName: '1180 Crotona Ave', shortLabel: 'Crotona', badgeBg: '#534ab7', badgeText: 'CR', address: 'Bronx, NY 10456' },
  { folderId: '900006', folderName: '425 Atlantic Ave', shortLabel: 'Atlantic', badgeBg: '#12a594', badgeText: 'AT', address: 'Brooklyn, NY 11217' },
  { folderId: '900007', folderName: '2233 University Ave', shortLabel: 'Univ', badgeBg: '#993c1d', badgeText: 'UN', address: 'Bronx, NY 10468' },
  { folderId: '900008', folderName: '940-942 Woodycrest Ave', shortLabel: 'Woody', badgeBg: '#ffc53d', badgeText: 'WD', address: 'Bronx, NY 10452' },
  { folderId: '900009', folderName: '619 Bedford Ave', shortLabel: 'Bedford', badgeBg: '#a18072', badgeText: 'BD', address: 'Brooklyn, NY 11249' },
  { folderId: '900010', folderName: '88 Eckford St', shortLabel: 'Eckford', badgeBg: '#186221', badgeText: 'EK', address: 'Brooklyn, NY 11222' },
];

interface MatrixRow {
  trade: string;
  codes: string[];
}

const MATRIX_DATA: MatrixRow[] = [
  { trade: 'SOE & Foundation & Superstructure', codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'RS', 'LP', 'AW', 'AW', 'AW'] },
  { trade: 'Foundation Waterproofing',          codes: ['AW', 'AW', '—', 'AW', 'LP', '—', 'BR', 'AW', 'LP', 'LP'] },
  { trade: 'Plumbing & Sprinkler',              codes: ['AW', 'AW', 'AW', 'LP', 'BR', 'RS', 'AW', 'AW', 'LP', 'LP'] },
  { trade: 'Electrical',                        codes: ['AW', 'AW', 'AW', 'AW', 'LV', 'LP', 'AW', 'LV', 'LP', 'LP'] },
  { trade: 'Scaffolding / Shed',                codes: ['AW', 'AW', 'AW', 'LV', 'LP', 'RS', 'LV', 'ND', 'LP', 'LP'] },
  { trade: 'Live Security',                     codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'LP', 'AW', 'AW', 'AW', 'AW'] },
  { trade: 'Rubbish Removal',                   codes: ['AW', 'AW', 'AW', 'LP', 'LP', 'RS', 'AW', 'LP', 'LP', 'AW'] },
  { trade: 'HVAC',                              codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'LP', 'AW', 'LP', 'LP', 'LP'] },
  { trade: 'Elevator',                          codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'RS', 'AW', 'LP', 'LP', 'AW'] },
  { trade: 'Windows',                           codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'LP', 'AW', 'AW', 'LP', 'AW'] },
  { trade: 'Roofing',                           codes: ['AW', 'AW', 'AW', 'LP', 'LP', 'NR', 'AW', 'LV', 'NR', 'LP'] },
  { trade: 'Stucco',                            codes: ['AW', 'AW', 'AW', 'LP', 'RS', 'NR', 'AW', 'LV', 'NR', 'LP'] },
  { trade: 'Fire Alarm',                        codes: ['AW', 'AW', 'LP', 'AW', 'FU', 'NR', '—', 'AW', 'LP', 'LP'] },
  { trade: 'Kitchens',                          codes: ['AW', 'AW', 'AW', 'AW', 'LP', 'LP', 'AW', 'LV', 'BR', 'LP'] },
  { trade: 'Appliances',                        codes: ['LP', 'LP', 'BR', 'BR', 'BR', 'BR', '—', 'BR', 'BR', 'BR'] },
];

// Project-column order in MATRIX_DATA — keeps the visual order consistent with the mockup.
const MATRIX_PROJECT_ORDER = [
  '1450 Dekalb Ave',
  '2100 Hoe Ave',
  '94 White Plains Rd',
  '800 Brady Ave',
  '1180 Crotona Ave',
  '425 Atlantic Ave',
  '2233 University Ave',
  '940-942 Woodycrest Ave',
  '619 Bedford Ave',
  '88 Eckford St',
];

// Per-project Bid Grid mock (mirrors bb_per_project_grid_v2.html for Brady).
interface MockBidRow {
  trade: string;
  budget: number;
  subs: Array<[string | null, number | null, string, boolean] | [null]>;
}

const BRADY_GRID: MockBidRow[] = [
  { trade: 'SOE & Foundation & Superstructure', budget: 600000,
    subs: [['Prime', 3030000, 'AW', true], ['Elite Concrete', null, 'RS', false], ['Edge', null, 'RS', false], ['Greystone', null, 'RS', false]] },
  { trade: 'Live Security', budget: 17000,
    subs: [['City Wide', 8800, 'AW', true], ['Monitex', 14050, 'ND', false], [null], [null]] },
  { trade: 'Construction Fence', budget: 28000,
    subs: [['AFS Fencing', null, 'ND', false], ['QSF Fencing', 15950, 'AW', true], [null], [null]] },
  { trade: 'Windows', budget: 275000,
    subs: [['Silhouette', null, 'BR', false], ['Windows NYC', null, 'BR', false], ['Slate', 325000, 'AW', true], [null]] },
  { trade: 'Roofing', budget: 195000,
    subs: [['Pinnacle', 257609, 'AW', true], ['Master Roofing', null, 'ND', false], [null], [null]] },
  { trade: 'Stucco', budget: 570000,
    subs: [['Pinnacle', 600212, 'AW', true], ['Master Roofing', null, 'ND', false], ['AC Drywall', null, 'ND', false], [null]] },
  { trade: 'HVAC', budget: 225000,
    subs: [['Reliable Air', 238800, 'LP', false], ['Breezco', null, 'LP', false], ['Chill Master', 204000, 'AW', true], ['VS Cooling', null, 'ND', false]] },
  { trade: 'PTAC Units', budget: 350000,
    subs: [['Signature', null, 'LP', false], ['Home Trade', null, 'LP', false], ['Reliable Air', 302991, 'AW', true], [null]] },
  { trade: 'Electrical', budget: 990000,
    subs: [['Brooklyn Power', 920000, 'AW', true], ['Power Direct', null, 'ND', false], ['MR Electrical', null, 'ND', false], [null]] },
  { trade: 'Fire Alarm', budget: 42000,
    subs: [['MR Fire Alarm', 96300, 'LP', false], ['Be Secure', 93450, 'AW', true], ['Blue Sky', null, 'ND', false], [null]] },
  { trade: 'Tile Installation', budget: 385000,
    subs: [['City Tiles', 428289, 'AW', true], ['ABF Tile', null, 'ND', false], ['Greater Tiles', 429665, 'ND', false], [null]] },
  { trade: 'Plumbing Fixtures Bathtubs', budget: 144000,
    subs: [['Bluetub', 136932, 'ND', false], ['Bathana', 125659, 'AW', true], [null], [null]] },
  { trade: 'Elevator', budget: 590000,
    subs: [['Millennium Elev', 578000, 'AW', true], ['Skyline Elev', 641598, 'ND', false], ['Liftrex', 600000, 'ND', false], [null]] },
  { trade: 'Rubbish Removal', budget: 255000,
    subs: [['Rush Rubbish', 261176, 'AW', true], ['Best Super', 262000, 'ND', false], ['Touch Up', 345000, 'ND', false], [null]] },
];

function makeMockSnapshot(project: MockProject, grid: MockBidRow[]): ProjectSnapshot {
  const budgetTasks: BudgetTask[] = grid.map((row, idx) => ({
    id: `${project.folderId}-bt-${idx}`,
    url: `https://app.clickup.com/t/${project.folderId}-bt-${idx}`,
    trade: row.trade,
    tradeType: 'Biddable',
    costType: costTypeForTrade(row.trade),
    budgetAllocated: row.budget,
    updatedBudget: null,
    budgetStatus: 'Open for Bidding',
    projectFolder: project.folderName,
    projectFolderId: project.folderId,
    listId: `${project.folderId}-budget`,
  }));

  const biddingTasks: BiddingTask[] = [];
  let bidIdx = 0;
  for (let i = 0; i < grid.length; i += 1) {
    const row = grid[i];
    const parent = budgetTasks[i];
    for (const sub of row.subs) {
      if (!sub || !sub[0]) continue;
      const [name, amount, code, isLowest] = sub as [string, number | null, string, boolean];
      const status: BiddingStatus = CODE_STATUS[code] ?? 'Not Started';
      biddingTasks.push({
        id: `${project.folderId}-b-${bidIdx}`,
        url: `https://app.clickup.com/t/${project.folderId}-b-${bidIdx}`,
        parentBudgetTaskId: parent.id,
        trade: row.trade,
        subcontractor: name,
        bidAmount: amount,
        status,
        dateUpdated: String(Date.now() - (bidIdx % 30) * 86_400_000),
        awardDate: status === 'Awarded' ? String(Date.now() - 86_400_000 * 5) : null,
        followedUp: null,
        link: null,
        projectFolder: project.folderName,
        projectFolderId: project.folderId,
        listId: `${project.folderId}-bidding`,
        orderindex: String(bidIdx),
      });
      bidIdx += 1;
      void isLowest; // computed dynamically from automation
    }
  }
  return {
    folderId: project.folderId,
    folderName: project.folderName,
    budgetTasks,
    biddingTasks,
  };
}

// Build a mock snapshot for every project from MATRIX_DATA so the Portfolio
// Matrix is fully populated. Brady gets the rich BRADY_GRID; others get
// synthesized rows from the matrix cells.
export function mockProjectSnapshots(): ProjectSnapshot[] {
  return MOCK_PROJECTS.map((p) => {
    if (p.folderName === '800 Brady Ave') {
      return makeMockSnapshot(p, BRADY_GRID);
    }
    return makeMockSnapshot(p, synthesizeGrid(p.folderName));
  });
}

export function mockProjectSnapshot(folderId: string): ProjectSnapshot | null {
  const p = MOCK_PROJECTS.find((mp) => mp.folderId === folderId);
  if (!p) return null;
  if (p.folderName === '800 Brady Ave') return makeMockSnapshot(p, BRADY_GRID);
  return makeMockSnapshot(p, synthesizeGrid(p.folderName));
}

function synthesizeGrid(projectName: string): MockBidRow[] {
  const col = MATRIX_PROJECT_ORDER.indexOf(projectName);
  if (col < 0) return BRADY_GRID;
  // Synthesize one bid row per matrix row, with status from the matrix cell
  // and a fake amount based on a trade base price.
  const TRADE_BASE: Record<string, number> = {
    'SOE & Foundation & Superstructure': 2_800_000,
    'Foundation Waterproofing': 180_000,
    'Plumbing & Sprinkler': 720_000,
    Electrical: 920_000,
    'Scaffolding / Shed': 165_000,
    'Live Security': 11_000,
    'Rubbish Removal': 240_000,
    HVAC: 215_000,
    Elevator: 540_000,
    Windows: 295_000,
    Roofing: 220_000,
    Stucco: 580_000,
    'Fire Alarm': 88_000,
    Kitchens: 410_000,
    Appliances: 138_000,
  };
  return MATRIX_DATA.map((row, idx) => {
    const code = row.codes[col];
    const base = TRADE_BASE[row.trade] ?? 100_000;
    const subs: MockBidRow['subs'] = [];
    if (code === '—') {
      subs.push([null]);
      return { trade: row.trade, budget: base, subs };
    }
    const status: BiddingStatus = CODE_STATUS[code] ?? 'Not Started';
    const amount = status === 'Awarded' || status === 'Leveling' || status === 'Bid Received'
      ? Math.round(base * (0.9 + ((idx * 17) % 30) / 100))
      : null;
    subs.push([
      `${projectName.split(/\s+/)[1] ?? 'Local'} ${row.trade.split(/\s+/)[0]}`,
      amount,
      code,
      status === 'Awarded',
    ]);
    // A second filler bid
    if (status !== 'Awarded') {
      subs.push([`Alt ${row.trade.split(/\s+/)[0]}`, null, 'RS', false]);
    }
    return { trade: row.trade, budget: base, subs };
  });
}

export function mockProjectByName(name: string): MockProject | undefined {
  return MOCK_PROJECTS.find((p) => p.folderName === name);
}
