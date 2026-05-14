import {
  BiddingTask,
  BudgetTask,
  BUDGET_FIELDS,
  CUTask,
  INELIGIBLE_BID_STATUSES,
  ProjectSnapshot,
} from './types';
import {
  findField,
  postTaskComment,
  setCustomField,
  tradeKey,
} from './client';

export interface ResolvedBid {
  amount: number;
  bid: BiddingTask;
  reason: 'awarded' | 'lowest';
}

export interface AutomationResult {
  budgetTaskId: string;
  trade: string;
  previousUpdated: number | null;
  nextUpdated: number | null;
  source: 'awarded' | 'lowest' | 'budget_allocated' | 'set_type' | 'no_change';
  winningBid?: { sub: string; amount: number; status: string };
  changed: boolean;
  warning?: string;
}

/**
 * Resolve the winning bid for one Budget task per AGENTS.md §6.
 *
 * Steps:
 *  1. Filter eligible (not in INELIGIBLE_BID_STATUSES, amount > 0).
 *  2. If any Awarded → that one wins (authoritative).
 *  3. Else → MIN(amount). Tied minimums: most recently updated; tiebreak orderindex.
 *  4. No eligible bids → null (caller falls back to Budget Allocated).
 */
export function resolveWinningBid(bids: BiddingTask[]): ResolvedBid | null {
  const eligible = bids.filter(
    (b) =>
      b.bidAmount != null &&
      b.bidAmount > 0 &&
      !INELIGIBLE_BID_STATUSES.includes(b.status)
  );
  if (eligible.length === 0) return null;

  const awarded = eligible.filter((b) => b.status === 'Awarded');
  if (awarded.length > 0) {
    // If multiple Awarded (data error), pick the most recent.
    const winner = awarded.sort(byUpdatedDesc)[0];
    return { amount: winner.bidAmount!, bid: winner, reason: 'awarded' };
  }

  const min = Math.min(...eligible.map((b) => b.bidAmount!));
  const atMin = eligible.filter((b) => b.bidAmount === min);
  const winner = atMin.sort(byUpdatedDesc)[0];
  return { amount: winner.bidAmount!, bid: winner, reason: 'lowest' };
}

function byUpdatedDesc(a: BiddingTask, b: BiddingTask): number {
  const at = Number(a.dateUpdated ?? 0);
  const bt = Number(b.dateUpdated ?? 0);
  if (at !== bt) return bt - at;
  const ai = Number(a.orderindex ?? 0);
  const bi = Number(b.orderindex ?? 0);
  return ai - bi;
}

/**
 * Compute the Updated Budget that *should* be on each Budget task right now.
 * Pure function — no API calls. Used for both the rollup view and the writer.
 */
export function computeUpdatedBudgets(
  snapshot: ProjectSnapshot
): Array<AutomationResult & { newValue: number | null }> {
  // Bids join to Budget tasks by trade name (separate ClickUp lists).
  const bidsByTrade = new Map<string, BiddingTask[]>();
  for (const bid of snapshot.biddingTasks) {
    if (!bid.trade) continue;
    const key = tradeKey(bid.trade);
    const arr = bidsByTrade.get(key) ?? [];
    arr.push(bid);
    bidsByTrade.set(key, arr);
  }

  return snapshot.budgetTasks.map((bt) => {
    const children = bidsByTrade.get(tradeKey(bt.trade)) ?? [];

    // §6.6: Set Trade Types skip the bidding loop entirely.
    if (bt.tradeType === 'Set') {
      return finalize(bt, bt.budgetAllocated, 'set_type', undefined);
    }

    const winner = resolveWinningBid(children);
    if (winner) {
      const newValue = winner.amount;
      return finalize(
        bt,
        newValue,
        winner.reason,
        {
          sub: winner.bid.subcontractor,
          amount: winner.amount,
          status: winner.bid.status,
        }
      );
    }
    // No eligible bids — fall back to Budget Allocated (§6.5).
    return finalize(bt, bt.budgetAllocated, 'budget_allocated', undefined);
  });
}

function finalize(
  bt: BudgetTask,
  next: number | null,
  source: AutomationResult['source'],
  winningBid: AutomationResult['winningBid']
): AutomationResult & { newValue: number | null } {
  const changed = !approxEqual(bt.updatedBudget, next);
  return {
    budgetTaskId: bt.id,
    trade: bt.trade,
    previousUpdated: bt.updatedBudget,
    nextUpdated: next,
    newValue: next,
    source: changed ? source : 'no_change',
    winningBid,
    changed,
  };
}

function approxEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.005;
}

// ---------- Writer ----------

/**
 * Write computed Updated Budget back to ClickUp for every changed task.
 * Looks up the field ID from each task's own custom_fields list — robust against
 * field ID changes per workspace.
 */
export async function applyAutomationToProject(
  snapshot: ProjectSnapshot,
  rawBudgetTasks: CUTask[]
): Promise<{ results: AutomationResult[]; writes: number; warnings: string[] }> {
  const computed = computeUpdatedBudgets(snapshot);
  const warnings: string[] = [];
  let writes = 0;

  for (const result of computed) {
    if (!result.changed) continue;
    if (result.newValue == null) continue;
    const raw = rawBudgetTasks.find((t) => t.id === result.budgetTaskId);
    if (!raw) continue;
    const field = findField(raw, BUDGET_FIELDS.UpdatedBudget);
    if (!field) {
      warnings.push(
        `Budget task ${result.budgetTaskId} (${result.trade}) is missing the "Updated Budget" custom field`
      );
      continue;
    }
    try {
      await setCustomField(result.budgetTaskId, field.id, result.newValue);
      writes += 1;
      if (result.winningBid) {
        await postTaskComment(
          result.budgetTaskId,
          `Auto-updated to ${formatUsd(result.newValue)} based on bid from ${result.winningBid.sub} (${formatUsd(result.winningBid.amount)}, ${result.winningBid.status})`
        ).catch(() => {
          // Comments are nice-to-have; don't fail the write on comment errors.
        });
      }
    } catch (err) {
      warnings.push(
        `Write failed for ${result.trade} (${result.budgetTaskId}): ${(err as Error).message}`
      );
    }
  }

  return { results: computed, writes, warnings };
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// ---------- Project rollups (read-only, §6 project rollup) ----------

export interface ProjectRollup {
  estimated: number;
  updated: number;
  delta: number;
  coverage: number; // 0-1
  awardedCount: number;
  biddableCount: number;
}

export function projectRollup(snapshot: ProjectSnapshot): ProjectRollup {
  const computed = computeUpdatedBudgets(snapshot);
  const estimated = snapshot.budgetTasks.reduce(
    (sum, b) => sum + (b.budgetAllocated ?? 0),
    0
  );
  const updated = computed.reduce(
    (sum, r) => sum + (r.nextUpdated ?? 0),
    0
  );
  const biddable = snapshot.budgetTasks.filter((b) => b.tradeType === 'Biddable');
  const awardedTradeKeys = new Set(
    snapshot.biddingTasks
      .filter((b) => b.status === 'Awarded' && b.trade)
      .map((b) => tradeKey(b.trade as string))
  );
  const awardedCount = biddable.filter((b) => awardedTradeKeys.has(tradeKey(b.trade))).length;
  return {
    estimated,
    updated,
    delta: updated - estimated,
    coverage: biddable.length > 0 ? awardedCount / biddable.length : 0,
    awardedCount,
    biddableCount: biddable.length,
  };
}
