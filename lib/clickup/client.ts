import {
  CUFolder,
  CUTask,
  CUCustomField,
  BudgetTask,
  BiddingTask,
  ProjectSnapshot,
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

// Dropdown values come back as either { id } referencing the option, or the
// option index, or the option name. Normalize to the option name.
export function readDropdownField(task: CUTask, name: string): string | null {
  const f = findField(task, name);
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

function findListId(folder: CUFolder, namePrefix: string): string | null {
  const list = folder.lists?.find((l) => l.name.toLowerCase().startsWith(namePrefix));
  return list?.id ?? null;
}

export async function loadProject(folderId: string): Promise<ProjectSnapshot> {
  const folder = await getFolder(folderId);
  const budgetListId = findListId(folder, '01. budget');
  const biddingListId = findListId(folder, '02. bidding');

  const [budgetRaw, biddingRaw] = await Promise.all([
    budgetListId ? listTasks(budgetListId) : Promise.resolve<CUTask[]>([]),
    biddingListId ? listTasks(biddingListId) : Promise.resolve<CUTask[]>([]),
  ]);

  const budgetTasks: BudgetTask[] = budgetRaw.map((t) =>
    shapeBudgetTask(t, folder.name, folder.id)
  );
  const biddingTasks: BiddingTask[] = biddingRaw.map((t) =>
    shapeBiddingTask(t, folder.name, folder.id, budgetTasks)
  );

  return {
    folderId: folder.id,
    folderName: folder.name,
    budgetTasks,
    biddingTasks,
  };
}

export function shapeBudgetTask(
  task: CUTask,
  folderName: string,
  folderId: string
): BudgetTask {
  const trade = readDropdownField(task, BUDGET_FIELDS.Trades) ?? task.name;
  const tradeType = readDropdownField(task, BUDGET_FIELDS.TradeType);
  return {
    id: task.id,
    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
    trade,
    tradeType: tradeType === 'Set' || tradeType === 'Biddable' ? tradeType : null,
    costType:
      (readDropdownField(task, BUDGET_FIELDS.CostType) as 'Hard Costs' | 'Soft Costs' | null) ===
      'Hard Costs'
        ? 'Hard'
        : (readDropdownField(task, BUDGET_FIELDS.CostType) as 'Hard Costs' | 'Soft Costs' | null) ===
            'Soft Costs'
          ? 'Soft'
          : costTypeForTrade(trade),
    budgetAllocated: readNumberField(task, BUDGET_FIELDS.BudgetAllocated),
    updatedBudget: readNumberField(task, BUDGET_FIELDS.UpdatedBudget),
    budgetStatus: task.status?.status ?? '',
    projectFolder: folderName,
    projectFolderId: folderId,
    listId: task.list?.id ?? '',
  };
}

export function shapeBiddingTask(
  task: CUTask,
  folderName: string,
  folderId: string,
  budgetTasks: BudgetTask[]
): BiddingTask {
  const status = normalizeBiddingStatus(task.status?.status) ?? 'Not Started';
  // Match parent Budget task by `parent`, else fall back to trade name.
  const parentId = task.parent ?? null;
  let trade: string | null = null;
  if (parentId) {
    trade = budgetTasks.find((b) => b.id === parentId)?.trade ?? null;
  }
  if (!trade) {
    // Try the bidding task's own Trades dropdown (some workspaces tag it).
    trade = readDropdownField(task, BUDGET_FIELDS.Trades);
  }
  const subLabels = readLabelsField(task, BIDDING_FIELDS.Subcontractor);
  const subcontractor = subLabels[0] ?? readTextField(task, BIDDING_FIELDS.Subcontractor) ?? task.name;
  return {
    id: task.id,
    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
    parentBudgetTaskId: parentId,
    trade,
    subcontractor,
    bidAmount: readNumberField(task, BIDDING_FIELDS.BidContractedAmount),
    status,
    dateUpdated: task.date_updated ?? readDateField(task, BIDDING_FIELDS.DateUpdated),
    awardDate: readDateField(task, BIDDING_FIELDS.AwardDate),
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
