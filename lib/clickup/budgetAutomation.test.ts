import { describe, expect, it } from 'vitest';
import {
  computeUpdatedBudgets,
  projectRollup,
  resolveWinningBid,
} from './budgetAutomation';
import {
  BiddingTask,
  BudgetTask,
  ProjectSnapshot,
} from './types';

function bid(partial: Partial<BiddingTask>): BiddingTask {
  return {
    id: 'b1',
    url: 'https://app.clickup.com/t/b1',
    parentBudgetTaskId: 'bt1',
    trade: 'HVAC',
    subcontractor: 'Acme',
    bidAmount: 100,
    status: 'Bid Received',
    dateUpdated: '1700000000000',
    awardDate: null,
    followedUp: null,
    link: null,
    projectFolder: 'P',
    projectFolderId: 'f1',
    listId: 'l1',
    orderindex: '1',
    ...partial,
  };
}

function budget(partial: Partial<BudgetTask>): BudgetTask {
  return {
    id: 'bt1',
    url: 'https://app.clickup.com/t/bt1',
    trade: 'HVAC',
    tradeType: 'Biddable',
    costType: 'Soft',
    budgetAllocated: 1000,
    updatedBudget: null,
    budgetStatus: 'Open for Bidding',
    projectFolder: 'P',
    projectFolderId: 'f1',
    listId: 'l1',
    ...partial,
  };
}

function snapshot(budgetTasks: BudgetTask[], biddingTasks: BiddingTask[]): ProjectSnapshot {
  return {
    folderId: 'f1',
    folderName: 'P',
    budgetTasks,
    biddingTasks,
  };
}

describe('resolveWinningBid', () => {
  it('returns null when no eligible bids', () => {
    expect(
      resolveWinningBid([
        bid({ id: 'a', status: 'Not Started', bidAmount: null }),
        bid({ id: 'b', status: 'No Bid / Declined', bidAmount: 500 }),
        bid({ id: 'c', status: 'Needs Rebid', bidAmount: 400 }),
      ])
    ).toBeNull();
  });

  it('returns the Awarded bid even if a lower bid exists', () => {
    const result = resolveWinningBid([
      bid({ id: 'low', status: 'Leveling', bidAmount: 100 }),
      bid({ id: 'won', status: 'Awarded', bidAmount: 200 }),
    ]);
    expect(result?.reason).toBe('awarded');
    expect(result?.amount).toBe(200);
  });

  it('returns MIN across eligible bids', () => {
    const result = resolveWinningBid([
      bid({ id: 'a', bidAmount: 500 }),
      bid({ id: 'b', bidAmount: 300, status: 'Leveled - Pending Review' }),
      bid({ id: 'c', bidAmount: 400 }),
    ]);
    expect(result?.reason).toBe('lowest');
    expect(result?.amount).toBe(300);
  });

  it('excludes No Bid / Declined, Needs Rebid, Not Started, and zero/null amounts', () => {
    const result = resolveWinningBid([
      bid({ id: 'nd', bidAmount: 50, status: 'No Bid / Declined' }),
      bid({ id: 'nr', bidAmount: 60, status: 'Needs Rebid' }),
      bid({ id: 'ns', bidAmount: 70, status: 'Not Started' }),
      bid({ id: 'z', bidAmount: 0 }),
      bid({ id: 'null', bidAmount: null }),
      bid({ id: 'k', bidAmount: 200 }),
    ]);
    expect(result?.amount).toBe(200);
  });

  it('breaks tied minimums by most recent update', () => {
    const result = resolveWinningBid([
      bid({ id: 'old', bidAmount: 100, dateUpdated: '1000' }),
      bid({ id: 'new', bidAmount: 100, dateUpdated: '2000' }),
    ]);
    expect(result?.bid.id).toBe('new');
  });
});

describe('computeUpdatedBudgets', () => {
  it('Set trade type pins Updated Budget to Budget Allocated', () => {
    const bt = budget({ tradeType: 'Set', budgetAllocated: 1500 });
    const r = computeUpdatedBudgets(snapshot([bt], [bid({ bidAmount: 500 })]))[0];
    expect(r.newValue).toBe(1500);
    expect(r.source).not.toBe('lowest');
  });

  it('falls back to Budget Allocated when no eligible bids', () => {
    const bt = budget({ budgetAllocated: 999 });
    const r = computeUpdatedBudgets(
      snapshot([bt], [bid({ bidAmount: null, status: 'RFP Sent' })])
    )[0];
    expect(r.newValue).toBe(999);
  });

  it('award reversed → flips back to next-lowest', () => {
    const bt = budget({ updatedBudget: 200 });
    const before = computeUpdatedBudgets(
      snapshot([bt], [
        bid({ id: 'a', bidAmount: 300, status: 'Leveling' }),
        bid({ id: 'b', bidAmount: 200, status: 'Awarded' }),
      ])
    )[0];
    expect(before.newValue).toBe(200);
    expect(before.source).toBe('no_change'); // already matches

    // Now award is reversed → no Awarded; lowest = 300 (200 dropped).
    const after = computeUpdatedBudgets(
      snapshot([bt], [
        bid({ id: 'a', bidAmount: 300, status: 'Leveling' }),
        bid({ id: 'b', bidAmount: 200, status: 'No Bid / Declined' }),
      ])
    )[0];
    expect(after.newValue).toBe(300);
    expect(after.source).toBe('lowest');
    expect(after.changed).toBe(true);
  });

  it('does not write when value is unchanged', () => {
    const bt = budget({ updatedBudget: 100 });
    const r = computeUpdatedBudgets(
      snapshot([bt], [bid({ bidAmount: 100, status: 'Awarded' })])
    )[0];
    expect(r.changed).toBe(false);
    expect(r.source).toBe('no_change');
  });

  it('matches bids by parent budget task ID first, then by trade name', () => {
    const bt = budget({ id: 'BT', trade: 'HVAC', updatedBudget: null });
    const r = computeUpdatedBudgets(
      snapshot(
        [bt],
        [bid({ id: 'x', parentBudgetTaskId: null, trade: 'HVAC', bidAmount: 50, status: 'Bid Received' })]
      )
    )[0];
    expect(r.newValue).toBe(50);
  });
});

describe('projectRollup', () => {
  it('sums allocated, sums updated, counts coverage of biddable trades', () => {
    const bts = [
      budget({ id: '1', trade: 'HVAC', tradeType: 'Biddable', budgetAllocated: 1000 }),
      budget({ id: '2', trade: 'Roofing', tradeType: 'Biddable', budgetAllocated: 500 }),
      budget({ id: '3', trade: 'Windows', tradeType: 'Set', budgetAllocated: 200 }),
    ];
    const bids = [
      bid({ id: 'a', parentBudgetTaskId: '1', trade: 'HVAC', bidAmount: 900, status: 'Awarded' }),
      bid({ id: 'b', parentBudgetTaskId: '2', trade: 'Roofing', bidAmount: 480, status: 'Leveling' }),
    ];
    const rollup = projectRollup(snapshot(bts, bids));
    expect(rollup.estimated).toBe(1700);
    expect(rollup.updated).toBe(900 + 480 + 200);
    expect(rollup.biddableCount).toBe(2);
    expect(rollup.awardedCount).toBe(1);
    expect(rollup.coverage).toBe(0.5);
  });
});
