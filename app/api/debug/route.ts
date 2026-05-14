import { NextRequest, NextResponse } from 'next/server';
import { hasClickUpToken, listSpaceFolders, getFolder, listTasks } from '@/lib/clickup/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_PROJECTS_SPACE_ID =
  process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';

/** TEMPORARY structural-inspection endpoint. Remove once the client is correct. */
export async function GET(_req: NextRequest) {
  if (!hasClickUpToken()) return NextResponse.json({ error: 'no token' });
  try {
    const folders = await listSpaceFolders(ACTIVE_PROJECTS_SPACE_ID);
    const target = folders.find((f) => {
      const names = (f.lists ?? []).map((l) => l.name.toLowerCase());
      return names.some((n) => n.startsWith('01')) && names.some((n) => n.startsWith('02'));
    });
    if (!target) return NextResponse.json({ error: 'no folder' });

    const full = await getFolder(target.id);
    const budgetList = full.lists?.find((l) => l.name.toLowerCase().startsWith('01'));
    const biddingList = full.lists?.find((l) => l.name.toLowerCase().startsWith('02'));
    const budgetTasks = budgetList ? await listTasks(budgetList.id) : [];
    const biddingTasks = biddingList ? await listTasks(biddingList.id) : [];

    const tally = (arr: any[], fn: (t: any) => string) => {
      const m: Record<string, number> = {};
      for (const t of arr) {
        const k = fn(t);
        m[k] = (m[k] ?? 0) + 1;
      }
      return m;
    };
    const cfVal = (t: any, name: string) => {
      const f = (t.custom_fields ?? []).find((c: any) => c.name === name);
      return f ? f.value : undefined;
    };
    const cfOptions = (tasks: any[], name: string) => {
      for (const t of tasks) {
        const f = (t.custom_fields ?? []).find((c: any) => c.name === name);
        if (f?.type_config?.options) {
          return f.type_config.options.map((o: any) => ({
            id: o.id,
            name: o.name ?? o.label,
            orderindex: o.orderindex,
          }));
        }
      }
      return null;
    };

    // Find a bid subtask (parent != null) with a meaningful state.
    const bidSubtasks = biddingTasks.filter((t: any) => t.parent != null);
    const tradeGroupTasks = biddingTasks.filter((t: any) => t.parent == null);

    return NextResponse.json({
      folderName: target.name,
      budget: {
        total: budgetTasks.length,
        parentNull: budgetTasks.filter((t: any) => t.parent == null).length,
        byWorkflowStatus: tally(budgetTasks, (t) => t.status?.status ?? '?'),
      },
      bidding: {
        total: biddingTasks.length,
        tradeGroups: tradeGroupTasks.length,
        bidSubtasks: bidSubtasks.length,
        byWorkflowStatus: tally(biddingTasks, (t) => t.status?.status ?? '?'),
        statusFieldOptions: cfOptions(biddingTasks, 'Status'),
        byStatusField: tally(biddingTasks, (t) => {
          const v = cfVal(t, 'Status');
          return v == null ? 'null' : String(v);
        }),
        tradeFieldOptions: cfOptions(biddingTasks, 'Trade'),
      },
      // Show 4 bid subtasks with their key fields decoded.
      bidSubtaskSamples: bidSubtasks.slice(0, 6).map((t: any) => ({
        name: t.name,
        workflowStatus: t.status?.status,
        parent: t.parent,
        statusField: cfVal(t, 'Status'),
        tradeField: cfVal(t, 'Trade'),
        bidAmount: cfVal(t, 'Bid/Contracted Amount'),
        awardDate: cfVal(t, 'Award Date'),
        subcontractor: cfVal(t, 'Subcontractor'),
      })),
      tradeGroupSamples: tradeGroupTasks.slice(0, 4).map((t: any) => ({
        id: t.id,
        name: t.name,
        workflowStatus: t.status?.status,
        tradeField: cfVal(t, 'Trade'),
        tradeListText: cfVal(t, 'Trade List'),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
