import { NextRequest, NextResponse } from 'next/server';
import { hasClickUpToken, listSpaceFolders, getFolder, listTasks } from '@/lib/clickup/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_PROJECTS_SPACE_ID =
  process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';

/**
 * TEMPORARY structural-inspection endpoint. Returns field NAMES, types, and
 * value shapes (not full PII values) so the client field-resolution can be
 * fixed against the real ClickUp contract. Remove once the client is correct.
 */
export async function GET(_req: NextRequest) {
  if (!hasClickUpToken()) {
    return NextResponse.json({ error: 'no token' }, { status: 200 });
  }
  try {
    const folders = await listSpaceFolders(ACTIVE_PROJECTS_SPACE_ID);
    const folderSummary = folders.map((f) => ({
      id: f.id,
      name: f.name,
      lists: (f.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    }));

    // Inspect the first folder that has both a Budget and a Bidding list.
    const target = folders.find((f) => {
      const names = (f.lists ?? []).map((l) => l.name.toLowerCase());
      return names.some((n) => n.startsWith('01')) && names.some((n) => n.startsWith('02'));
    });

    let detail: any = { note: 'no folder with 01/02 lists found' };
    if (target) {
      const full = await getFolder(target.id);
      const budgetList = full.lists?.find((l) => l.name.toLowerCase().startsWith('01'));
      const biddingList = full.lists?.find((l) => l.name.toLowerCase().startsWith('02'));
      const budgetTasks = budgetList ? await listTasks(budgetList.id) : [];
      const biddingTasks = biddingList ? await listTasks(biddingList.id) : [];

      const describeTask = (t: any) => ({
        id: t.id,
        name: t.name,
        status: t.status?.status,
        parent: t.parent,
        top_level_parent: t.top_level_parent,
        linked_tasks: (t.linked_tasks ?? []).map((lt: any) => ({ link_id: lt.link_id, task_id: lt.task_id })),
        custom_fields: (t.custom_fields ?? []).map((cf: any) => ({
          name: cf.name,
          type: cf.type,
          hasValue: cf.value !== undefined && cf.value !== null && cf.value !== '',
          valueType: Array.isArray(cf.value) ? 'array' : typeof cf.value,
          valueSample:
            cf.value == null
              ? null
              : typeof cf.value === 'object'
                ? JSON.stringify(cf.value).slice(0, 120)
                : String(cf.value).slice(0, 60),
          optionCount: cf.type_config?.options?.length,
          optionSample: cf.type_config?.options?.slice(0, 3)?.map((o: any) => ({
            id: o.id,
            name: o.name ?? o.label,
            orderindex: o.orderindex,
          })),
        })),
      });

      detail = {
        folderId: target.id,
        folderName: target.name,
        budgetListId: budgetList?.id,
        biddingListId: biddingList?.id,
        budgetTaskCount: budgetTasks.length,
        biddingTaskCount: biddingTasks.length,
        budgetSample: budgetTasks.slice(0, 3).map(describeTask),
        biddingSample: biddingTasks.slice(0, 5).map(describeTask),
      };
    }

    return NextResponse.json({
      folderCount: folders.length,
      folders: folderSummary,
      detail,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
