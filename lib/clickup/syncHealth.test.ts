import { describe, expect, it } from 'vitest';
import { analyzeProjectSync } from './syncHealth';
import { BiddingTask, BudgetTask, ProjectSnapshot } from './types';

function budget(partial: Partial<BudgetTask> = {}): BudgetTask {
  return {
    id: 'bt1',
    url: 'https://app.clickup.com/t/bt1',
    trade: 'HVAC',
    tradeType: 'Biddable',
    costType: 'Hard',
    budgetAllocated: 1000,
    updatedBudget: null,
    subcontractors: ['Acme Mechanical', 'Beta Air'],
    budgetStatus: 'Open for Bidding',
    projectFolder: 'P',
    projectFolderId: 'f1',
    listId: 'budget-list',
    syncStatus: 'ok',
    syncIssues: [],
    expectedBiddingCount: 0,
    actualBiddingCount: 0,
    ...partial,
  };
}

function bid(partial: Partial<BiddingTask> = {}): BiddingTask {
  return {
    id: 'b1',
    url: 'https://app.clickup.com/t/b1',
    tradeGroupId: 'tg1',
    trade: 'HVAC',
    subcontractor: 'Acme Mechanical',
    subcontractorUrl: null,
    bidAmount: null,
    status: 'RFP Sent',
    statusDerived: false,
    dateUpdated: '1700000000000',
    awardDate: null,
    followedUp: null,
    link: null,
    projectFolder: 'P',
    projectFolderId: 'f1',
    listId: 'bidding-list',
    orderindex: '1',
    ...partial,
  };
}

function snapshot(budgetTasks: BudgetTask[], biddingTasks: BiddingTask[]): ProjectSnapshot {
  return {
    folderId: 'f1',
    folderName: 'P',
    budgetTasks,
    biddingTasks,
    tradeGroups: [],
    syncHealth: {
      total: 0,
      bySeverity: { info: 0, warning: 0, error: 0 },
      byCategory: {},
    },
  };
}

describe('analyzeProjectSync', () => {
  it('passes a Biddable trade with selected subcontractors and matching generated bids', () => {
    const analyzed = analyzeProjectSync(
      snapshot(
        [budget()],
        [bid({ subcontractor: 'Acme Mechanical' }), bid({ id: 'b2', subcontractor: 'Beta Air' })]
      )
    );

    expect(analyzed.budgetTasks[0].syncStatus).toBe('ok');
    expect(analyzed.budgetTasks[0].expectedBiddingCount).toBe(2);
    expect(analyzed.budgetTasks[0].actualBiddingCount).toBe(2);
    expect(analyzed.syncHealth.total).toBe(0);
  });

  it('does not treat pre-bidding missing subcontractors as a sync issue', () => {
    const analyzed = analyzeProjectSync(snapshot([budget({ subcontractors: [] })], []));

    expect(analyzed.budgetTasks[0].syncStatus).toBe('ok');
    expect(analyzed.budgetTasks[0].syncIssues).toHaveLength(0);
    expect(analyzed.budgetTasks[0].expectedBiddingCount).toBe(0);
  });

  it('warns when selected subcontractors are missing generated Bidding tasks', () => {
    const analyzed = analyzeProjectSync(snapshot([budget()], [bid({ subcontractor: 'Acme Mechanical' })]));

    expect(analyzed.budgetTasks[0].syncStatus).toBe('warn');
    expect(analyzed.budgetTasks[0].syncIssues.map((i) => i.code)).toContain('missing_bidding_tasks');
    expect(analyzed.syncHealth.byCategory.bidding_tasks).toBe(1);
  });

  it('warns when a Set trade has Bidding tasks but does not change budget write behavior', () => {
    const analyzed = analyzeProjectSync(
      snapshot([budget({ tradeType: 'Set', subcontractors: [] })], [bid({ status: 'Awarded', bidAmount: 900 })])
    );

    expect(analyzed.budgetTasks[0].expectedBiddingCount).toBe(0);
    expect(analyzed.budgetTasks[0].actualBiddingCount).toBe(1);
    expect(analyzed.budgetTasks[0].syncIssues.map((i) => i.code)).toContain('set_trade_has_bidding_tasks');
  });

  it('does not count Pending and null Trade Type values as broken sync', () => {
    const analyzed = analyzeProjectSync(
      snapshot([
        budget({ id: 'pending', trade: 'HVAC', tradeType: 'Pending' }),
        budget({ id: 'null', trade: 'Roofing', tradeType: null }),
      ], [])
    );

    expect(analyzed.budgetTasks[0].syncIssues).toHaveLength(0);
    expect(analyzed.budgetTasks[1].syncIssues).toHaveLength(0);
    expect(analyzed.budgetTasks[0].expectedBiddingCount).toBe(0);
    expect(analyzed.budgetTasks[1].expectedBiddingCount).toBe(0);
  });

  it('warns when bidding has started but Budget Allocated is missing', () => {
    const analyzed = analyzeProjectSync(
      snapshot([budget({ budgetAllocated: null })], [
        bid({ subcontractor: 'Acme Mechanical' }),
        bid({ id: 'b2', subcontractor: 'Beta Air' }),
      ])
    );

    expect(analyzed.budgetTasks[0].syncIssues.map((i) => i.code)).toContain('missing_budget_allocated');
  });
});
