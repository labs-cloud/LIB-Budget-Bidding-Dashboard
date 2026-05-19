import {
  BiddingTask,
  BudgetTask,
  ProjectSnapshot,
  SyncCategory,
  SyncHealthSummary,
  SyncIssue,
  SyncSeverity,
  SyncStatus,
} from './types';

const EMPTY_SUMMARY: SyncHealthSummary = {
  total: 0,
  bySeverity: { info: 0, warning: 0, error: 0 },
  byCategory: {},
};

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tradeKey(trade: string): string {
  return trade.trim().replace(/\s+/g, ' ').toLowerCase();
}

function addIssue(
  issues: SyncIssue[],
  code: string,
  severity: SyncSeverity,
  category: SyncCategory,
  message: string
) {
  issues.push({ code, severity, category, message });
}

function syncStatusFor(issues: SyncIssue[]): SyncStatus {
  if (issues.some((issue) => issue.severity === 'error')) return 'error';
  if (issues.length > 0) return 'warn';
  return 'ok';
}

function emptyBudgetSync(): Pick<
  BudgetTask,
  'syncStatus' | 'syncIssues' | 'expectedBiddingCount' | 'actualBiddingCount'
> {
  return {
    syncStatus: 'ok',
    syncIssues: [],
    expectedBiddingCount: 0,
    actualBiddingCount: 0,
  };
}

export function budgetSyncDefaults(): Pick<
  BudgetTask,
  'syncStatus' | 'syncIssues' | 'expectedBiddingCount' | 'actualBiddingCount'
> {
  return emptyBudgetSync();
}

export function emptySyncHealthSummary(): SyncHealthSummary {
  return {
    total: EMPTY_SUMMARY.total,
    bySeverity: { ...EMPTY_SUMMARY.bySeverity },
    byCategory: {},
  };
}

export function summarizeSyncIssues(issues: SyncIssue[]): SyncHealthSummary {
  const summary = emptySyncHealthSummary();
  for (const issue of issues) {
    summary.total += 1;
    summary.bySeverity[issue.severity] += 1;
    summary.byCategory[issue.category] = (summary.byCategory[issue.category] ?? 0) + 1;
  }
  return summary;
}

export function analyzeBudgetTaskSync(
  budgetTask: BudgetTask,
  bidsForTrade: BiddingTask[]
): BudgetTask {
  const issues: SyncIssue[] = [];
  const expectedBiddingCount =
    budgetTask.tradeType === 'Biddable' ? budgetTask.subcontractors.length : 0;
  const actualBiddingCount = bidsForTrade.length;

  if (budgetTask.budgetAllocated == null) {
    addIssue(
      issues,
      'missing_budget_allocated',
      'warning',
      'budget_allocated',
      'Budget Allocated is empty, so budget rollups and fallback Updated Budget may be wrong.'
    );
  }

  if (budgetTask.tradeType == null || budgetTask.tradeType === 'Pending') {
    addIssue(
      issues,
      'trade_type_pending',
      'warning',
      'trade_type',
      'Trade Type is not finalized, so the SOP automation path cannot be confirmed.'
    );
  }

  if (budgetTask.tradeType === 'Biddable') {
    const status = budgetTask.budgetStatus.trim().toLowerCase();
    const activeBudgetStatuses = new Set(['open for bidding', 'bid list confirmed']);
    if (!activeBudgetStatuses.has(status)) {
      addIssue(
        issues,
        'biddable_budget_status_mismatch',
        'warning',
        'budget_status',
        'Biddable trade is not in Open for Bidding or Bid List Confirmed status.'
      );
    }

    if (budgetTask.subcontractors.length === 0) {
      addIssue(
        issues,
        'missing_subcontractors',
        'warning',
        'subcontractors',
        'Biddable trade has no selected subcontractors; SOP says fill this before choosing Trade Type.'
      );
    } else {
      const actualNames = new Set(bidsForTrade.map((bid) => nameKey(bid.subcontractor)));
      const missingSubs = budgetTask.subcontractors.filter((sub) => !actualNames.has(nameKey(sub)));
      if (missingSubs.length > 0) {
        addIssue(
          issues,
          'missing_bidding_tasks',
          'warning',
          'bidding_tasks',
          `${missingSubs.length} selected subcontractor${missingSubs.length === 1 ? '' : 's'} missing generated Bidding task${missingSubs.length === 1 ? '' : 's'}.`
        );
      }
    }
  }

  if (budgetTask.tradeType === 'Set' && actualBiddingCount > 0) {
    addIssue(
      issues,
      'set_trade_has_bidding_tasks',
      'warning',
      'unexpected_bidding',
      'Trade Type is Set, but Bidding tasks exist; Set trades should skip the bidding loop.'
    );
  }

  return {
    ...budgetTask,
    syncStatus: syncStatusFor(issues),
    syncIssues: issues,
    expectedBiddingCount,
    actualBiddingCount,
  };
}

export function analyzeProjectSync(snapshot: ProjectSnapshot): ProjectSnapshot {
  const bidsByTrade = new Map<string, BiddingTask[]>();
  const projectIssues: SyncIssue[] = [];

  for (const bid of snapshot.biddingTasks) {
    if (!bid.trade) {
      addIssue(
        projectIssues,
        'bid_missing_trade',
        'warning',
        'unlinked_bid',
        `Bidding task "${bid.subcontractor}" is missing a Trade value, so it cannot sync to Budget.`
      );
      continue;
    }
    const key = tradeKey(bid.trade);
    const bids = bidsByTrade.get(key) ?? [];
    bids.push(bid);
    bidsByTrade.set(key, bids);
  }

  const budgetTasks = snapshot.budgetTasks.map((budgetTask) =>
    analyzeBudgetTaskSync(budgetTask, bidsByTrade.get(tradeKey(budgetTask.trade)) ?? [])
  );

  const allIssues = [
    ...projectIssues,
    ...budgetTasks.flatMap((budgetTask) => budgetTask.syncIssues),
  ];

  return {
    ...snapshot,
    budgetTasks,
    syncHealth: summarizeSyncIssues(allIssues),
  };
}
