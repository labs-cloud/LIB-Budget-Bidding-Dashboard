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
  BUDGET_FIELDS,
  BIDDING_FIELDS,
  costTypeForTrade,
  normalizeBiddingStatus,
} from './types';

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
// Live ClickUp contract (verified against the workspace):
//  - `01. Budget` holds one Trade task per trade as a top-level task
//    (parent == null). It also contains unrelated subtasks we ignore.
//  - `02. Bidding` holds one trade-group task per trade (parent == null) and
//    one bid subtask per subcontractor (parent == <trade-group id>).
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

function resolveTrade(task: CUTask): string {
  return (
    readDropdownField(task, BUDGET_FIELDS.Trade) ??
    readTextField(task, BUDGET_FIELDS.TradeList) ??
    task.name
  ).trim();
}

export async function loadProject(folderId: string): Promise<ProjectSnapshot> {
  const folder = await getFolder(folderId);
  const budgetListId = findListId(folder, '01. budget');
  const biddingListId = findListId(folder, '02. bidding');

  const [budgetRaw, biddingRaw] = await Promise.all([
    budgetListId ? listTasks(budgetListId) : Promise.resolve<CUTask[]>([]),
    biddingListId ? listTasks(biddingListId) : Promise.resolve<CUTask[]>([]),
  ]);

  // Budget tasks: top-level only (parent == null).
  const budgetTasks: BudgetTask[] = budgetRaw
    .filter((t) => t.parent == null)
    .map((t) => shapeBudgetTask(t, folder.name, folder.id));

  // Bidding: split trade-group tasks (parent == null) from bid subtasks.
  const tradeGroupTasks = biddingRaw.filter((t) => t.parent == null);
  const tradeGroups: TradeBiddingGroup[] = tradeGroupTasks.map((t) => ({
    id: t.id,
    trade: resolveTrade(t),
    status: normalizeBiddingStatus(t.status?.status) ?? 'Not Started',
    projectFolderId: folder.id,
  }));
  const groupById = new Map(tradeGroups.map((g) => [g.id, g]));

  const biddingTasks: BiddingTask[] = biddingRaw
    // A bid is a direct child of a trade-group task. Deeper sub-subtasks
    // (change orders etc.) are skipped.
    .filter((t) => t.parent != null && groupById.has(t.parent))
    .map((t) => shapeBiddingTask(t, folder.name, folder.id, groupById));

  return {
    folderId: folder.id,
    folderName: folder.name,
    budgetTasks,
    biddingTasks,
    tradeGroups,
  };
}

function normalizeTradeType(raw: string | null): TradeTypeValue | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'biddable') return 'Biddable';
  if (v === 'set') return 'Set';
  if (v === 'n/a' || v === 'na') return 'N/A';
  return null;
}

export function shapeBudgetTask(
  task: CUTask,
  folderName: string,
  folderId: string
): BudgetTask {
  const trade = resolveTrade(task);
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
    updatedBudget: readNumberField(task, BUDGET_FIELDS.UpdatedBudget),
    budgetStatus: task.status?.status ?? '',
    projectFolder: folderName,
    projectFolderId: folderId,
    listId: task.list?.id ?? '',
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
  groupById: Map<string, TradeBiddingGroup>
): BiddingTask {
  const group = task.parent ? groupById.get(task.parent) : undefined;
  const trade =
    readDropdownField(task, BIDDING_FIELDS.Trade) ?? group?.trade ?? null;
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
