import { describe, expect, it } from 'vitest';
import { buildUnifiedPortfolio } from './unifiedTransform';
import type {
  BiddingTask,
  BudgetTask,
  ProjectSnapshot,
  TradeTypeValue,
} from './clickup/types';

function budget(
  trade: string,
  tradeType: TradeTypeValue | null,
  estimatedBudget: number | null,
  folderId = 'f1'
): BudgetTask {
  return {
    id: `${folderId}-${trade}`,
    url: `https://app.clickup.com/t/${folderId}-${trade}`,
    trade,
    tradeType,
    costType: 'Hard',
    budgetAllocated: estimatedBudget,
    estimatedBudget,
    updatedBudget: null,
    subcontractors: [],
    budgetStatus: 'open for bidding',
    projectFolder: folderId,
    projectFolderId: folderId,
    listId: `${folderId}-budget`,
    syncStatus: 'ok',
    syncIssues: [],
    expectedBiddingCount: 0,
    actualBiddingCount: 0,
  };
}

function bid(trade: string, folderId = 'f1'): BiddingTask {
  return {
    id: `${folderId}-${trade}-bid`,
    url: `https://app.clickup.com/t/${folderId}-${trade}-bid`,
    tradeGroupId: null,
    trade,
    subcontractor: 'Acme',
    subcontractorUrl: null,
    bidAmount: null,
    status: 'RFP Sent',
    statusDerived: false,
    dateUpdated: String(Date.now()),
    awardDate: null,
    followedUp: null,
    link: null,
    projectFolder: folderId,
    projectFolderId: folderId,
    listId: `${folderId}-bidding`,
    orderindex: '0',
  };
}

function snapshot(
  folderId: string,
  folderName: string,
  budgetTasks: BudgetTask[],
  biddingTasks: BiddingTask[] = []
): ProjectSnapshot {
  return {
    folderId,
    folderName,
    budgetTasks,
    biddingTasks,
    tradeGroups: [],
    syncHealth: { total: 0, bySeverity: { info: 0, warning: 0, error: 0 }, byCategory: {} },
  };
}

function build(snapshots: ProjectSnapshot[], view: 'budget' | 'bidding') {
  return buildUnifiedPortfolio({
    snapshots,
    source: 'mock',
    refreshedAt: Date.now(),
    warnings: [],
    view,
  });
}

// A project mixing all four Trade Types — Brady-shaped in miniature. The two
// Biddable trades carry a bid so they survive the matrix's activity filter.
const mixed = snapshot(
  'f1',
  '800 Brady Ave',
  [
    budget('HVAC', 'Biddable', 225_000),
    budget('Electric', 'Biddable', 990_000),
    budget('Live Security', 'Set', 17_000),
    budget('DOT Meeting', 'N/A', 2_500),
    budget('Roofing', 'Pending', 195_000),
  ],
  [bid('HVAC'), bid('Electric')]
);

describe('buildUnifiedPortfolio — Bidding view filters to Biddable trades', () => {
  it('excludes every non-Biddable trade from the portfolio matrix', () => {
    const bidding = build([mixed], 'bidding');
    const rowTrades = bidding.matrix.rows.map((r) => r.trade);
    expect(rowTrades).toContain('HVAC');
    expect(rowTrades).toContain('Electric');
    // Set / N/A / Pending trades must be gone entirely.
    expect(rowTrades).not.toContain('Live Security');
    expect(rowTrades).not.toContain('DOT Meeting');
    expect(rowTrades).not.toContain('Roofing');
  });

  it('excludes every non-Biddable trade from the per-project matrix', () => {
    const bidding = build([mixed], 'bidding');
    const ptTrades = bidding.projects[0].ptTrades.map((t) => t.name);
    expect(ptTrades.sort()).toEqual(['Electric', 'HVAC']);
  });

  it('Budget view keeps all trades', () => {
    const budgetView = build([mixed], 'budget');
    const ptTrades = budgetView.projects[0].ptTrades.map((t) => t.name).sort();
    expect(ptTrades).toEqual(['DOT Meeting', 'Electric', 'HVAC', 'Live Security', 'Roofing']);
    expect(budgetView.budgetOutlook.tradeCount).toBe(5);
  });

  it('reports the view it was built for', () => {
    expect(build([mixed], 'budget').view).toBe('budget');
    expect(build([mixed], 'bidding').view).toBe('bidding');
  });
});

describe('buildUnifiedPortfolio — Estimated rollup shrinks in Bidding view', () => {
  it('Bidding-view Estimated total is strictly less than Budget-view (Set/N/A/Pending excluded)', () => {
    const sumEstimated = (p: ReturnType<typeof build>) =>
      p.projects[0].ptTrades.reduce((s, t) => s + (t.estimated ?? 0), 0);

    const budgetTotal = sumEstimated(build([mixed], 'budget'));
    const biddingTotal = sumEstimated(build([mixed], 'bidding'));

    // Budget view: all five trades. Bidding view: HVAC + Electric only.
    expect(budgetTotal).toBe(225_000 + 990_000 + 17_000 + 2_500 + 195_000);
    expect(biddingTotal).toBe(225_000 + 990_000);
    expect(biddingTotal).toBeLessThan(budgetTotal);
  });

  it('Bidding-view biddable trade count is lower than Budget-view trade count', () => {
    expect(build([mixed], 'bidding').budgetOutlook.tradeCount).toBe(2);
    expect(build([mixed], 'budget').budgetOutlook.tradeCount).toBe(5);
  });
});

describe('buildUnifiedPortfolio — project with zero Biddable trades', () => {
  const noBiddable = snapshot('f2', '12 Early Stage Ave', [
    budget('DOT Meeting', 'N/A', 2_500, 'f2'),
    budget('Live Security', 'Set', 17_000, 'f2'),
    budget('Roofing', 'Pending', 195_000, 'f2'),
  ]);

  it('renders no trade rows in Bidding view (empty-state trigger)', () => {
    const bidding = build([noBiddable], 'bidding');
    expect(bidding.projects[0].ptTrades).toHaveLength(0);
    expect(bidding.matrix.rows).toHaveLength(0);
  });

  it('still shows all trades in Budget view', () => {
    const budgetView = build([noBiddable], 'budget');
    expect(budgetView.projects[0].ptTrades).toHaveLength(3);
  });
});
