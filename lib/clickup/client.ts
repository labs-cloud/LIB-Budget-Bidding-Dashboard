import {
  CUFolder,
  CUTask,
  CUCustomField,
  BudgetTask,
  BiddingTask,
  TradeBiddingGroup,
  ProjectSnapshot,
  BiddingStatus,
  TradeTypeValue,
  ALL_TRADES,
  BUDGET_FIELDS,
  BIDDING_FIELDS,
  costTypeForTrade,
  normalizeBiddingStatus,
} from './types';
import { analyzeProjectSync, budgetSyncDefaults, emptySyncHealthSummary } from './syncHealth';

const CU_BASE = 'https://api.clickup.com/api/v2';

export class ClickUpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `ClickUp API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export function hasClickUpToken(): boolean {
  return !!process.env.CLICKUP_API_TOKEN;
}

interface FetchOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  // Server-side fetch cache hint; default to 60s.
  revalidate?: number | false;
}

async function cuFetch<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new ClickUpError(0, '', 'CLICKUP_API_TOKEN not set');
  const url = `${CU_BASE}${path}`;
  const init: RequestInit & { next?: { revalidate: number | false } } = {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  if (opts.method === undefined || opts.method === 'GET') {
    init.next = { revalidate: opts.revalidate ?? 60 };
  } else {
    init.cache = 'no-store';
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new ClickUpError(res.status, text);
  }
  return res.json() as Promise<T>;
}

// ---------- Folder / List discovery ----------

export async function listSpaceFolders(spaceId: string): Promise<CUFolder[]> {
  const data = await cuFetch<{ folders: CUFolder[] }>(
    `/space/${spaceId}/folder?archived=false`
  );
  return data.folders ?? [];
}

export async function getFolder(folderId: string): Promise<CUFolder> {
  return cuFetch<CUFolder>(`/folder/${folderId}`);
}

// ---------- Task fetch ----------

interface TasksResponse {
  tasks: CUTask[];
  last_page?: boolean;
}

export async function listTasks(
  listId: string,
  opts: { includeClosed?: boolean; subtasks?: boolean } = {}
): Promise<CUTask[]> {
  const all: CUTask[] = [];
  let page = 0;
  while (page < 50) {
    const qs = new URLSearchParams({
      page: String(page),
      include_closed: String(opts.includeClosed ?? true),
      subtasks: String(opts.subtasks ?? true),
    });
    const data = await cuFetch<TasksResponse>(`/list/${listId}/task?${qs}`);
    all.push(...(data.tasks ?? []));
    if (data.last_page || (data.tasks?.length ?? 0) === 0) break;
    page += 1;
  }
  return all;
}

// ---------- Custom field helpers ----------

export function findField(task: CUTask, name: string): CUCustomField | undefined {
  return task.custom_fields.find((f) => f.name === name);
}

/**
 * Find a field by name, preferring a specific ClickUp field type. The live
 * `01. Budget` list has two fields literally named "Trade"; we want the
 * drop_down one, not the other.
 */
export function findFieldByType(
  task: CUTask,
  name: string,
  type: string
): CUCustomField | undefined {
  return (
    task.custom_fields.find((f) => f.name === name && f.type === type) ??
    task.custom_fields.find((f) => f.name === name)
  );
}

export function readNumberField(task: CUTask, name: string): number | null {
  const f = findField(task, name);
  if (!f || f.value == null || f.value === '') return null;
  const n = typeof f.value === 'number' ? f.value : Number(f.value);
  return Number.isFinite(n) ? n : null;
}

export function readTextField(task: CUTask, name: string): string | null {
  const f = findField(task, name);
  if (!f || f.value == null || f.value === '') return null;
  return String(f.value);
}

export function readDateField(task: CUTask, name: string): string | null {
  const f = findField(task, name);
  if (!f || f.value == null || f.value === '') return null;
  return String(f.value);
}

// Dropdown values come back as either { id } referencing the option, the
// option orderindex (most common in this workspace), or the option name.
// Normalize to the option name. Prefers a drop_down-typed field on name clash.
export function readDropdownField(task: CUTask, name: string): string | null {
  const f = findFieldByType(task, name, 'drop_down');
  if (!f || f.value == null || f.value === '') return null;
  const options: any[] = f.type_config?.options ?? [];
  let optionRef: any = f.value;
  if (typeof optionRef === 'object' && optionRef !== null) {
    optionRef = optionRef.id ?? optionRef.orderindex ?? optionRef.name;
  }
  const opt =
    options.find((o) => o.id === optionRef) ??
    options.find((o) => String(o.orderindex) === String(optionRef)) ??
    options.find((o) => o.name === optionRef);
  return opt ? String(opt.name) : typeof optionRef === 'string' ? optionRef : null;
}

// Labels custom field returns array of label IDs; resolve to names.
export function readLabelsField(task: CUTask, name: string): string[] {
  const f = findField(task, name);
  if (!f || !Array.isArray(f.value)) return [];
  const labels: any[] = f.type_config?.options ?? [];
  return f.value
    .map((v) => {
      const ref = typeof v === 'object' ? v?.id ?? v?.label : v;
      const opt = labels.find((o) => o.id === ref) ?? labels.find((o) => o.label === ref);
      return opt ? (opt.label as string) : typeof ref === 'string' ? ref : null;
    })
    .filter((s): s is string => !!s);
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// ClickUp relation/label fields vary between workspaces. This reads the common
// shapes without assuming the field type is labels-only.
function readReferenceNamesField(task: CUTask, name: string): string[] {
  const f = findField(task, name);
  if (!f || f.value == null || f.value === '') return [];
  if (Array.isArray(f.value)) {
    const options: any[] = f.type_config?.options ?? [];
    return uniqueNames(
      f.value.map((v) => {
        if (typeof v === 'string') {
          const opt = options.find((o) => o.id === v || o.label === v || o.name === v);
          return opt?.name ?? opt?.label ?? v;
        }
        if (v && typeof v === 'object') {
          return v.name ?? v.label ?? v.username ?? v.email ?? v.id ?? null;
        }
        return null;
      })
    );
  }
  if (typeof f.value === 'object') {
    return uniqueNames([f.value.name, f.value.label, f.value.username, f.value.email]);
  }
  return uniqueNames([String(f.value)]);
}

// ---------- Writes ----------

export async function setCustomField(
  taskId: string,
  fieldId: string,
  value: unknown
): Promise<void> {
  await cuFetch(`/task/${taskId}/field/${fieldId}`, {
    method: 'POST',
    body: { value },
  });
}

export async function postTaskComment(taskId: string, text: string): Promise<void> {
  await cuFetch(`/task/${taskId}/comment`, {
    method: 'POST',
    body: { comment_text: text, notify_all: false },
  });
}

// ---------- Domain shaping ----------
//
// Live ClickUp contract:
//  - `01. Budget` holds one Trade task per trade as a top-level task
//    (parent == null). It also contains unrelated subtasks we ignore.
//  - `02. Bidding` may hold either top-level subcontractor bid tasks (per the
//    SOP) or top-level trade-group tasks with subcontractor bids as children
//    (seen in earlier workspace snapshots). We support both.
//  - Bids join to Budget tasks by trade NAME — they live in different lists
//    with no shared parent.

function findListId(folder: CUFolder, namePrefix: string): string | null {
  const list = folder.lists?.find((l) => l.name.toLowerCase().startsWith(namePrefix));
  return list?.id ?? null;
}

/** Normalize a trade name for joining (trim, collapse whitespace, lowercase). */
export function tradeKey(trade: string): string {
  return trade.trim().replace(/\s+/g, ' ').toLowerCase();
}

const CANONICAL_TRADE_KEYS = new Set(ALL_TRADES.map(tradeKey));

/**
 * Resolve a task's trade name, or `null` if it isn't a real trade task. The
 * live lists contain orphan bid tasks and junk ("Send out job for pricing",
 * subcontractor names) at the top level — those have neither a `Trade`
 * dropdown nor `Trade List` text and don't match a canonical trade, so they
 * are excluded rather than shown as bogus trade rows.
 */
function resolveTrade(task: CUTask): string | null {
  const dropdown = readDropdownField(task, BUDGET_FIELDS.Trade);
  if (dropdown && dropdown.trim()) return dropdown.trim();
  const listText = readTextField(task, BUDGET_FIELDS.TradeList);
  if (listText && listText.trim()) return listText.trim();
  const name = task.name?.trim();
  if (name && CANONICAL_TRADE_KEYS.has(tradeKey(name))) return name;
  return null;
}

export async function loadProject(folderId: string): Promise<ProjectSnapshot> {
  const folder = await getFolder(folderId);
  const budgetListId = findListId(folder, '01. budget');
  const biddingListId = findListId(folder, '02. bidding');

  const [budgetRaw, biddingRaw] = await Promise.all([
    budgetListId ? listTasks(budgetListId) : Promise.resolve<CUTask[]>([]),
    biddingListId ? listTasks(biddingListId) : Promise.resolve<CUTask[]>([]),
  ]);

  // Budget tasks: top-level only (parent == null) AND a resolvable trade.
  const budgetTasks: BudgetTask[] = budgetRaw
    .filter((t) => t.parent == null)
    .map((t) => shapeBudgetTask(t, folder.name, folder.id))
    .filter((bt): bt is BudgetTask => bt !== null);

  // Bidding: support both SOP shape (one top-level task per subcontractor)
  // and grouped shape (top-level trade rows with bid subtasks).
  const tradeGroupTasks = biddingRaw.filter((t) => t.parent == null);
  const groupTradeById = new Map<string, string | null>(
    tradeGroupTasks.map((t) => [t.id, resolveTrade(t)])
  );
  const tradeGroups: TradeBiddingGroup[] = tradeGroupTasks
    .map((t): TradeBiddingGroup | null => {
      const trade = groupTradeById.get(t.id) ?? null;
      if (!trade) return null;
      return {
        id: t.id,
        trade,
        status: normalizeBiddingStatus(t.status?.status) ?? 'Not Started',
        projectFolderId: folder.id,
      };
    })
    .filter((g): g is TradeBiddingGroup => g !== null);

  const biddingTasks: BiddingTask[] = biddingRaw
    .filter((t) => isBiddingBidTask(t, groupTradeById))
    .map((t) => shapeBiddingTask(t, folder.name, folder.id, groupTradeById));

  return analyzeProjectSync({
    folderId: folder.id,
    folderName: folder.name,
    budgetTasks,
    biddingTasks,
    tradeGroups,
    syncHealth: emptySyncHealthSummary(),
  });
}

function normalizeTradeType(raw: string | null): TradeTypeValue | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'biddable') return 'Biddable';
  if (v === 'set') return 'Set';
  if (v === 'n/a' || v === 'na') return 'N/A';
  if (v === 'pending') return 'Pending';
  return null;
}

export function shapeBudgetTask(
  task: CUTask,
  folderName: string,
  folderId: string
): BudgetTask | null {
  const trade = resolveTrade(task);
  if (!trade) return null;
  const costRaw = readDropdownField(task, BUDGET_FIELDS.CostType);
  const costType: 'Hard' | 'Soft' =
    costRaw === 'Hard Costs'
      ? 'Hard'
      : costRaw === 'Soft Costs'
        ? 'Soft'
        : costTypeForTrade(trade);
  return {
    id: task.id,
    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
    trade,
    tradeType: normalizeTradeType(readDropdownField(task, BUDGET_FIELDS.TradeType)),
    costType,
    budgetAllocated: readNumberField(task, BUDGET_FIELDS.BudgetAllocated),
    // Estimated Budget is a new CU field — older lists won't have it yet, so
    // readNumberField returns null and the dashboard renders "—".
    estimatedBudget: readNumberField(task, BUDGET_FIELDS.EstimatedBudget),
    updatedBudget: readNumberField(task, BUDGET_FIELDS.UpdatedBudget),
    subcontractors: readReferenceNamesField(task, BUDGET_FIELDS.Subcontractors),
    budgetStatus: task.status?.status ?? '',
    projectFolder: folderName,
    projectFolderId: folderId,
    listId: task.list?.id ?? '',
    ...budgetSyncDefaults(),
  };
}

/**
 * Read the subcontractor name + ClickUp URL from the `Subcontractor`
 * list_relationship field, falling back to the `1. Subcontractors` labels
 * field and finally the task name.
 */
function readSubcontractor(task: CUTask): { name: string; url: string | null } {
  const rel = findField(task, BIDDING_FIELDS.Subcontractor);
  if (rel && Array.isArray(rel.value) && rel.value.length > 0) {
    const first = rel.value[0];
    if (first && typeof first === 'object' && first.name) {
      return { name: String(first.name), url: first.url ?? null };
    }
  }
  const labels = readLabelsField(task, BUDGET_FIELDS.Subcontractors);
  if (labels.length > 0) return { name: labels[0], url: null };
  return { name: task.name, url: null };
}

function hasSubcontractorSignal(task: CUTask): boolean {
  const sub = readSubcontractor(task).name.trim();
  const trade = resolveTrade(task);
  return !!sub && (!trade || sub.toLowerCase() !== trade.toLowerCase());
}

function isBiddingBidTask(
  task: CUTask,
  groupTradeById: Map<string, string | null>
): boolean {
  if (task.parent != null) {
    return groupTradeById.has(task.parent);
  }
  const trade = resolveTrade(task);
  if (!trade) return false;
  // A canonical trade-name task is a group row, not a subcontractor bid.
  if (tradeKey(task.name) === tradeKey(trade)) return false;
  return hasSubcontractorSignal(task);
}

/**
 * Derive the 9-stage bidding status for a bid subtask. The live workspace
 * does not drive the workflow status (every bid sits at "Not Started"), so we
 * fall back to explicit signals: an Award Date means Awarded, a real bid
 * amount means Bid Received. If the workflow status IS meaningful we trust it.
 */
function deriveBidStatus(
  task: CUTask,
  awardDate: string | null,
  bidAmount: number | null
): { status: BiddingStatus; derived: boolean } {
  const fieldStatus = normalizeBiddingStatus(readDropdownField(task, BIDDING_FIELDS.BiddingStatus));
  if (fieldStatus) {
    return { status: fieldStatus, derived: false };
  }
  const workflow = normalizeBiddingStatus(task.status?.status);
  if (workflow && workflow !== 'Not Started') {
    return { status: workflow, derived: false };
  }
  if (awardDate) return { status: 'Awarded', derived: true };
  if (bidAmount != null && bidAmount > 0) return { status: 'Bid Received', derived: true };
  return { status: 'Not Started', derived: true };
}

export function shapeBiddingTask(
  task: CUTask,
  folderName: string,
  folderId: string,
  groupTradeById: Map<string, string | null>
): BiddingTask {
  const groupTrade = task.parent ? groupTradeById.get(task.parent) ?? null : null;
  const trade =
    readDropdownField(task, BIDDING_FIELDS.Trade) ?? groupTrade ?? null;
  const sub = readSubcontractor(task);
  const bidAmount = readNumberField(task, BIDDING_FIELDS.BidContractedAmount);
  const awardDate = readDateField(task, BIDDING_FIELDS.AwardDate);
  const { status, derived } = deriveBidStatus(task, awardDate, bidAmount);
  return {
    id: task.id,
    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
    tradeGroupId: task.parent ?? null,
    trade,
    subcontractor: sub.name,
    subcontractorUrl: sub.url,
    bidAmount,
    status,
    statusDerived: derived,
    dateUpdated: readDateField(task, BIDDING_FIELDS.DateUpdated) ?? task.date_updated ?? null,
    awardDate,
    followedUp: readDateField(task, BIDDING_FIELDS.FollowedUp),
    link: readTextField(task, BIDDING_FIELDS.Link),
    projectFolder: folderName,
    projectFolderId: folderId,
    listId: task.list?.id ?? '',
    orderindex: String(task.orderindex ?? ''),
  };
}

// ---------- Master Projects Board cross-check (§3) ----------

export async function loadMasterProjectNames(): Promise<Set<string>> {
  const listId = process.env.CLICKUP_MASTER_PROJECTS_LIST_ID ?? '901710536629';
  try {
    const tasks = await listTasks(listId, { includeClosed: true });
    return new Set(tasks.map((t) => t.name.trim()));
  } catch {
    return new Set();
  }
}
