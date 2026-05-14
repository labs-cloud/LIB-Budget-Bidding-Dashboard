import { NextRequest, NextResponse } from 'next/server';
import {
  hasClickUpToken,
  listSpaceFolders,
  getFolder,
  listTasks,
  loadProject,
} from '@/lib/clickup/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_PROJECTS_SPACE_ID =
  process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';

/** TEMPORARY structural-inspection endpoint. Remove once the client is correct. */
export async function GET(_req: NextRequest) {
  if (!hasClickUpToken()) return NextResponse.json({ error: 'no token' });
  try {
    const folders = await listSpaceFolders(ACTIVE_PROJECTS_SPACE_ID);
    const target = folders.find((f) => f.name === '1931-1935 Bedford') ?? folders[0];

    // 1. Raw folder shape — does getFolder return lists?
    const full = await getFolder(target.id);
    const rawFolderLists = (full.lists ?? []).map((l) => ({ id: l.id, name: JSON.stringify(l.name) }));

    // 2. Raw list fetch counts.
    const budgetList = full.lists?.find((l) => l.name.toLowerCase().startsWith('01. budget'));
    const biddingList = full.lists?.find((l) => l.name.toLowerCase().startsWith('02. bidding'));
    const budgetRaw = budgetList ? await listTasks(budgetList.id) : [];
    const biddingRaw = biddingList ? await listTasks(biddingList.id) : [];

    // 3. What loadProject actually shapes.
    const snapshot = await loadProject(target.id);

    return NextResponse.json({
      folderId: target.id,
      folderName: target.name,
      rawFolderLists,
      budgetListMatched: budgetList?.id ?? null,
      biddingListMatched: biddingList?.id ?? null,
      budgetRawCount: budgetRaw.length,
      budgetRawParentNull: budgetRaw.filter((t) => t.parent == null).length,
      biddingRawCount: biddingRaw.length,
      biddingRawParentNull: biddingRaw.filter((t) => t.parent == null).length,
      shaped: {
        budgetTasks: snapshot.budgetTasks.length,
        biddingTasks: snapshot.biddingTasks.length,
        tradeGroups: snapshot.tradeGroups.length,
        budgetSample: snapshot.budgetTasks.slice(0, 4),
        biddingSample: snapshot.biddingTasks.slice(0, 4),
        tradeGroupSample: snapshot.tradeGroups.slice(0, 4),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, stack: (err as Error).stack },
      { status: 500 }
    );
  }
}
