/**
 * One-time migration — adds an `Estimated Budget` Currency custom field to
 * every `01. Budget` list under the Active Projects space.
 *
 * The Budget & Bidding dashboard mirrors the team's SharePoint "Budget
 * Outlook" xlsx, which tracks each trade as three numbers: Estimated Budget,
 * Finalized Lowest Bid, New Budget. `Estimated Budget` is the only one that
 * needs a stored field; the other two are derived. ClickUp's `01. Budget`
 * lists don't have it yet, so this script creates it.
 *
 * Run once:  npm run migrate:estimated-budget
 *
 * Idempotent — a list that already has a field named "Estimated Budget" is
 * skipped. Safe to re-run.
 *
 * Requires CLICKUP_API_TOKEN with admin scope (custom-field creation is an
 * admin operation). If the token lacks scope the ClickUp API returns 401/403
 * — the script reports the failure per-list and exits non-zero so the admin
 * can fall back to the manual procedure in docs/manual-migrations.md.
 */

const CU_BASE = 'https://api.clickup.com/api/v2';
const SPACE_ID = process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';
const FIELD_NAME = 'Estimated Budget';
const BUDGET_LIST_PREFIX = '01. budget';

interface CUList { id: string; name: string }
interface CUFolder { id: string; name: string; lists?: CUList[] }
interface CUField { id: string; name: string; type: string }

function token(): string {
  const t = process.env.CLICKUP_API_TOKEN;
  if (!t) {
    console.error('CLICKUP_API_TOKEN is not set. Aborting.');
    process.exit(1);
  }
  return t;
}

async function cu<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CU_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function listBudgetLists(): Promise<CUList[]> {
  const { folders } = await cu<{ folders: CUFolder[] }>(
    `/space/${SPACE_ID}/folder?archived=false`
  );
  const out: CUList[] = [];
  for (const folder of folders ?? []) {
    const budget = (folder.lists ?? []).find((l) =>
      l.name.toLowerCase().startsWith(BUDGET_LIST_PREFIX)
    );
    if (budget) out.push(budget);
    else console.warn(`  (no "01. Budget" list under folder "${folder.name}")`);
  }
  return out;
}

async function hasEstimatedBudgetField(listId: string): Promise<boolean> {
  const { fields } = await cu<{ fields: CUField[] }>(`/list/${listId}/field`);
  return (fields ?? []).some(
    (f) => f.name.trim().toLowerCase() === FIELD_NAME.toLowerCase()
  );
}

async function createEstimatedBudgetField(listId: string): Promise<void> {
  await cu(`/list/${listId}/field`, {
    method: 'POST',
    body: JSON.stringify({
      name: FIELD_NAME,
      type: 'currency',
      type_config: { currency_type: 'USD', precision: 2 },
    }),
  });
}

async function main(): Promise<void> {
  console.log(`Migrating "Estimated Budget" field into 01. Budget lists (space ${SPACE_ID})`);
  const lists = await listBudgetLists();
  console.log(`Found ${lists.length} budget list(s).`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const list of lists) {
    try {
      if (await hasEstimatedBudgetField(list.id)) {
        console.log(`  skip   ${list.name} (${list.id}) — field already exists`);
        skipped += 1;
        continue;
      }
      await createEstimatedBudgetField(list.id);
      console.log(`  create ${list.name} (${list.id}) — added "${FIELD_NAME}"`);
      created += 1;
    } catch (err) {
      console.error(`  FAIL   ${list.name} (${list.id}): ${(err as Error).message}`);
      failed += 1;
    }
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) {
    console.error(
      'Some lists failed. If this is a permissions error, add the field by ' +
        'hand using docs/manual-migrations.md.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Marks this file as a module so its top-level identifiers are scoped (not
// globals) — keeps `tsc` happy alongside the rest of the project.
export {};
