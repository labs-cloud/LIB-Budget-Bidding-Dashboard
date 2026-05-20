import { describe, expect, it } from 'vitest';
import { finalizedLowestBid, newBudget } from './budget';
import type { BiddingTask, BudgetTask } from '../clickup/types';
import {
  BRADY_BUDGET_OUTLOOK,
  BRADY_RULE_EXCEPTIONS,
  BRADY_TOTALS,
} from './__fixtures__/brady-budget-outlook';

function bt(partial: Partial<BudgetTask> = {}): BudgetTask {
  return {
    id: 'bt1',
    url: 'https://app.clickup.com/t/bt1',
    trade: 'Foundation',
    tradeType: 'Biddable',
    costType: 'Hard',
    budgetAllocated: null,
    estimatedBudget: null,
    updatedBudget: null,
    subcontractors: [],
    budgetStatus: 'open for bidding',
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
    tradeGroupId: null,
    trade: 'Foundation',
    subcontractor: 'Acme',
    subcontractorUrl: null,
    bidAmount: null,
    status: 'Bid Received',
    statusDerived: false,
    dateUpdated: '1700000000000',
    awardDate: null,
    followedUp: null,
    link: null,
    assignees: [],
    projectFolder: 'P',
    projectFolderId: 'f1',
    listId: 'bidding-list',
    orderindex: '1',
    ...partial,
  };
}

describe('finalizedLowestBid', () => {
  it('returns null when the trade has no bidding tasks', () => {
    expect(finalizedLowestBid(bt(), [])).toBeNull();
  });

  it('returns null when bids exist but none have reached Bid Received', () => {
    const bids = [
      bid({ id: 'b1', status: 'Not Started', bidAmount: 100 }),
      bid({ id: 'b2', status: 'RFP Sent', bidAmount: 200 }),
      bid({ id: 'b3', status: 'Followed Up', bidAmount: 300 }),
    ];
    expect(finalizedLowestBid(bt(), bids)).toBeNull();
  });

  it('returns the single eligible bid amount', () => {
    expect(finalizedLowestBid(bt(), [bid({ status: 'Bid Received', bidAmount: 600000 })]))
      .toBe(600000);
  });

  it('returns the minimum across multiple eligible bids', () => {
    const bids = [
      bid({ id: 'b1', status: 'Bid Received', bidAmount: 3030000 }),
      bid({ id: 'b2', status: 'Leveling', bidAmount: 2900000 }),
      bid({ id: 'b3', status: 'Leveled - Pending Review', bidAmount: 3100000 }),
    ];
    expect(finalizedLowestBid(bt(), bids)).toBe(2900000);
  });

  it('includes an Awarded bid in the minimum calculation', () => {
    const bids = [
      bid({ id: 'b1', status: 'Bid Received', bidAmount: 3030000 }),
      bid({ id: 'b2', status: 'Awarded', bidAmount: 2800000 }),
    ];
    expect(finalizedLowestBid(bt(), bids)).toBe(2800000);
  });

  it('ignores ineligible-status bids even when they are cheaper', () => {
    const bids = [
      bid({ id: 'b1', status: 'Not Started', bidAmount: 1 }),
      bid({ id: 'b2', status: 'RFP Sent', bidAmount: 2 }),
      bid({ id: 'b3', status: 'No Bid / Declined', bidAmount: 3 }),
      bid({ id: 'b4', status: 'Needs Rebid', bidAmount: 4 }),
      bid({ id: 'b5', status: 'Bid Received', bidAmount: 600000 }),
    ];
    expect(finalizedLowestBid(bt(), bids)).toBe(600000);
  });

  it('ignores zero and null bid amounts', () => {
    const bids = [
      bid({ id: 'b1', status: 'Bid Received', bidAmount: 0 }),
      bid({ id: 'b2', status: 'Bid Received', bidAmount: null }),
      bid({ id: 'b3', status: 'Bid Received', bidAmount: 720000 }),
    ];
    expect(finalizedLowestBid(bt(), bids)).toBe(720000);
  });

  it('only counts bids for the matching trade (join by trade name)', () => {
    const bids = [
      bid({ id: 'b1', trade: 'Foundation', status: 'Bid Received', bidAmount: 600000 }),
      bid({ id: 'b2', trade: 'Roofing', status: 'Bid Received', bidAmount: 1 }),
      bid({ id: 'b3', trade: null, status: 'Bid Received', bidAmount: 2 }),
    ];
    expect(finalizedLowestBid(bt({ trade: 'Foundation' }), bids)).toBe(600000);
  });

  it('matches the trade key case-insensitively', () => {
    const bids = [bid({ trade: '  foundation ', status: 'Bid Received', bidAmount: 600000 })];
    expect(finalizedLowestBid(bt({ trade: 'Foundation' }), bids)).toBe(600000);
  });
});

describe('newBudget', () => {
  it('uses the finalized lowest bid when one is known', () => {
    expect(newBudget(bt({ estimatedBudget: 600000, budgetAllocated: 500000 }), 3030000))
      .toBe(3030000);
  });

  it('falls back to the estimate when no finalized bid exists', () => {
    expect(newBudget(bt({ estimatedBudget: 2500, budgetAllocated: 1000 }), null)).toBe(2500);
  });

  it('falls back to allocated when estimate is null', () => {
    expect(newBudget(bt({ estimatedBudget: null, budgetAllocated: 1000 }), null)).toBe(1000);
  });

  it('returns null when finalized, estimate and allocated are all null', () => {
    expect(newBudget(bt({ estimatedBudget: null, budgetAllocated: null }), null)).toBeNull();
  });

  it('treats a $0 estimate as a real value, not "unknown"', () => {
    // DOT Meeting-style $0 line item: estimate is genuinely zero, so New
    // Budget is 0 rather than falling through to allocated.
    expect(newBudget(bt({ estimatedBudget: 0, budgetAllocated: 999 }), null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 800 Brady Ave — real Budget Outlook fixture (54 data rows).
//
// Verifies the derivation against the actual Excel data rather than a
// synthetic dataset: per-row regressions (null vs 0 handling, currency
// precision on $X.YZ amounts, blank-cell exclusion) surface here.
// ---------------------------------------------------------------------------
describe('Brady Budget Outlook — real 54-row fixture', () => {
  const TOLERANCE = 1_000;

  it('fixture has the right shape', () => {
    expect(BRADY_BUDGET_OUTLOOK).toHaveLength(54);
    const names = new Set(BRADY_BUDGET_OUTLOOK.map((r) => r.trade));
    expect(names.size).toBe(54);
  });

  it('sum of estimatedBudget matches the Excel total within $1k', () => {
    const sum = BRADY_BUDGET_OUTLOOK
      .map((r) => r.estimatedBudget ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - BRADY_TOTALS.estimated)).toBeLessThan(TOLERANCE);
  });

  it('sum of finalizedLowestBid matches the Excel total within $1k', () => {
    const sum = BRADY_BUDGET_OUTLOOK
      .map((r) => r.finalizedLowestBid ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - BRADY_TOTALS.finalizedLowest)).toBeLessThan(TOLERANCE);
  });

  it('sum of newBudget matches the Excel total within $1k', () => {
    const sum = BRADY_BUDGET_OUTLOOK
      .map((r) => r.newBudget ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - BRADY_TOTALS.newBudget)).toBeLessThan(TOLERANCE);
  });

  it('newBudget derivation rule holds row-by-row (bar the known exceptions)', () => {
    for (const r of BRADY_BUDGET_OUTLOOK) {
      if (BRADY_RULE_EXCEPTIONS.has(r.trade)) continue;
      // The Excel finalized column uses a literal 0 as "no finalized bid";
      // the real finalizedLowestBid() only ever yields a positive number or
      // null, so normalize 0 → null before feeding the real newBudget().
      const fin = r.finalizedLowestBid != null && r.finalizedLowestBid > 0
        ? r.finalizedLowestBid
        : null;
      const expected = newBudget(bt({ trade: r.trade, estimatedBudget: r.estimatedBudget }), fin);
      expect(r.newBudget).toBe(expected);
    }
  });
});
