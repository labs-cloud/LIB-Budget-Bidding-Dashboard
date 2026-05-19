// Budget Outlook derivations.
//
// The team tracks every trade as three numbers in their SharePoint
// "Budget Outlook" xlsx — Estimated Budget, Finalized Lowest Bid, New Budget.
// `Estimated Budget` is a stored ClickUp custom field; the other two are
// derived here so the dashboard mirrors the Excel column shape.
//
// Join model: this workspace does NOT give Bidding tasks a parent pointer to
// their Budget task — the two live in separate lists (`01. Budget` /
// `02. Bidding`) and join by trade NAME. `finalizedLowestBid` therefore takes
// the project's full bidding-task list and matches on the normalized trade
// key, rather than a `parentBudgetTaskId`.

import { BiddingStatus, BiddingTask, BudgetTask } from '../clickup/types';
import { tradeKey } from '../clickup/client';

// A bid only contributes a "finalized" number once it has actually been
// received. Earlier stages (Not Started, RFP Sent, Followed Up) have no real
// amount yet; later stages (Bid Received → Awarded) do.
const FINALIZED_ELIGIBLE: ReadonlySet<BiddingStatus> = new Set<BiddingStatus>([
  'Bid Received',
  'Leveling',
  'Leveled - Pending Review',
  'Awarded',
]);

/**
 * Minimum Bid/Contracted Amount across the trade's child Bidding tasks whose
 * status is `Bid Received` or later. Returns `null` when no bid has been
 * observed yet. `$0` and negative amounts are ignored — a finalized bid is a
 * real, positive dollar figure.
 */
export function finalizedLowestBid(
  budgetTask: BudgetTask,
  biddingTasks: BiddingTask[]
): number | null {
  const key = tradeKey(budgetTask.trade);
  const bids = biddingTasks
    .filter((b) => b.trade != null && tradeKey(b.trade) === key)
    .filter((b) => FINALIZED_ELIGIBLE.has(b.status))
    .map((b) => b.bidAmount)
    .filter((n): n is number => n != null && n > 0);
  if (bids.length === 0) return null;
  return Math.min(...bids);
}

/**
 * New Budget mirrors the Excel rule: the finalized lowest bid when one is
 * known, otherwise the planning estimate, otherwise the allocated number,
 * otherwise `null`.
 */
export function newBudget(
  budgetTask: BudgetTask,
  finalizedLowest: number | null
): number | null {
  if (finalizedLowest !== null) return finalizedLowest;
  if (budgetTask.estimatedBudget !== null) return budgetTask.estimatedBudget;
  if (budgetTask.budgetAllocated !== null) return budgetTask.budgetAllocated;
  return null;
}
