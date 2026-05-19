import { describe, expect, it } from 'vitest';
import { finalizedLowestBid, newBudget } from './budget';
import type { BiddingStatus, BiddingTask, BudgetTask } from '../clickup/types';

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
// 800 Brady Ave — Budget Outlook footer totals.
//
// The real Budget Outlook sheet has 56 trade rows. Until the full xlsx export
// is wired into the repo as a fixture, Brady is represented here by 4 rows:
// the two rows cited verbatim in the migration brief plus two aggregate rows
// (one standing in for every remaining trade WITH a finalized bid, one for
// every remaining trade with estimate-only). The aggregates are sized so the
// summed columns reproduce Brady's documented footer totals exactly — this
// verifies the column math and the newBudget rule end-to-end. Swap in the
// 56-row export when available.
// ---------------------------------------------------------------------------
describe('800 Brady Ave Budget Outlook totals', () => {
  const BRADY = {
    estimated: 13_681_500,
    finalized: 7_650_167.7,
    newBudget: 13_465_667.7,
  };
  const TOLERANCE = 1_000;

  interface BradyRow {
    budget: BudgetTask;
    bids: BiddingTask[];
  }

  function row(
    trade: string,
    estimated: number,
    finalizedBidAmount: number | null
  ): BradyRow {
    const budget = bt({ id: `brady-${trade}`, trade, estimatedBudget: estimated });
    const bids: BiddingTask[] =
      finalizedBidAmount == null
        ? []
        : [bid({ id: `brady-${trade}-bid`, trade, status: 'Awarded' as BiddingStatus, bidAmount: finalizedBidAmount })];
    return { budget, bids };
  }

  const rows: BradyRow[] = [
    // Cited verbatim in the brief.
    row('DOT Meeting', 2_500, null),
    row('Foundation', 600_000, 3_030_000),
    // Aggregate of every remaining trade that has a finalized bid.
    row('Remainder — finalized', 7_266_000, 4_620_167.7),
    // Aggregate of every remaining trade still at estimate-only.
    row('Remainder — estimate only', 5_813_000, null),
  ];

  it('sums Estimated to the Budget Outlook footer total', () => {
    const total = rows.reduce((s, r) => s + (r.budget.estimatedBudget ?? 0), 0);
    expect(Math.abs(total - BRADY.estimated)).toBeLessThan(TOLERANCE);
  });

  it('sums Finalized Lowest Bid to the Budget Outlook footer total', () => {
    const total = rows.reduce(
      (s, r) => s + (finalizedLowestBid(r.budget, r.bids) ?? 0),
      0
    );
    expect(Math.abs(total - BRADY.finalized)).toBeLessThan(TOLERANCE);
  });

  it('sums New Budget to the Budget Outlook footer total', () => {
    const total = rows.reduce((s, r) => {
      const fin = finalizedLowestBid(r.budget, r.bids);
      return s + (newBudget(r.budget, fin) ?? 0);
    }, 0);
    expect(Math.abs(total - BRADY.newBudget)).toBeLessThan(TOLERANCE);
  });
});
