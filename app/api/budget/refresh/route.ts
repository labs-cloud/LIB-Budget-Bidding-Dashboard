import { NextRequest, NextResponse } from 'next/server';
import {
  hasClickUpToken,
  listSpaceFolders,
  listTasks,
  loadProject,
} from '@/lib/clickup/client';
import { applyAutomationToProject } from '@/lib/clickup/budgetAutomation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACTIVE_PROJECTS_SPACE_ID =
  process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';

/**
 * Cron endpoint — runs the lowest-bid → Updated Budget automation across every
 * folder in the Active Projects space. Vercel hits this every 5 minutes
 * (see vercel.json). The dashboard pages also write opportunistically on view
 * refresh, but this is the durable fallback.
 *
 * Auth: optional CRON_SECRET header. If unset, calls are still allowed (Vercel
 * cron always sets `User-Agent: vercel-cron/1.0`).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.nextUrl.searchParams.get('secret');
    if (provided !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasClickUpToken()) {
    return NextResponse.json({ ok: false, skipped: 'CLICKUP_API_TOKEN not set' }, { status: 200 });
  }

  const folderIdParam = req.nextUrl.searchParams.get('folder');
  const startedAt = Date.now();
  const summary: Array<{
    folderId: string;
    folderName: string;
    writes: number;
    syncIssues: number;
    warnings: string[];
    error?: string;
  }> = [];

  try {
    const folders = folderIdParam
      ? [{ id: folderIdParam, name: folderIdParam }]
      : await listSpaceFolders(ACTIVE_PROJECTS_SPACE_ID);

    for (const folder of folders) {
      try {
        const snapshot = await loadProject(folder.id);
        // Re-fetch raw budget tasks so the writer can locate the Updated Budget field ID.
        const budgetListId = snapshot.budgetTasks[0]?.listId;
        const rawBudget = budgetListId
          ? await listTasks(budgetListId, { includeClosed: true }).catch(() => [])
          : [];
        const { writes, warnings } = await applyAutomationToProject(snapshot, rawBudget);
        summary.push({
          folderId: folder.id,
          folderName: snapshot.folderName,
          writes,
          syncIssues: snapshot.syncHealth.total,
          warnings,
        });
      } catch (err) {
        summary.push({
          folderId: folder.id,
          folderName: folder.name,
          writes: 0,
          syncIssues: 0,
          warnings: [],
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, summary, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  const totalWrites = summary.reduce((s, r) => s + r.writes, 0);
  const totalSyncIssues = summary.reduce((s, r) => s + r.syncIssues, 0);
  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    projectsScanned: summary.length,
    totalWrites,
    totalSyncIssues,
    summary,
  });
}
