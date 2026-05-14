import { hasClickUpToken, listSpaceFolders, loadProject, loadMasterProjectNames } from './clickup/client';
import { mockProjectSnapshot, mockProjectSnapshots, MOCK_PROJECTS } from './clickup/mockData';
import type { ProjectSnapshot } from './clickup/types';

const ACTIVE_PROJECTS_SPACE_ID =
  process.env.CLICKUP_ACTIVE_PROJECTS_SPACE_ID ?? '90173230172';

export interface PortfolioData {
  snapshots: ProjectSnapshot[];
  source: 'live' | 'mock';
  warnings: string[];
  refreshedAt: number;
}

export async function loadPortfolio(): Promise<PortfolioData> {
  const warnings: string[] = [];
  if (!hasClickUpToken()) {
    return {
      snapshots: mockProjectSnapshots(),
      source: 'mock',
      warnings: ['CLICKUP_API_TOKEN not set — rendering mock fixtures'],
      refreshedAt: Date.now(),
    };
  }
  try {
    const folders = await listSpaceFolders(ACTIVE_PROJECTS_SPACE_ID);
    const master = await loadMasterProjectNames();
    const snapshots = await Promise.all(folders.map((f) => loadProject(f.id)));
    if (master.size > 0) {
      for (const s of snapshots) {
        if (!master.has(s.folderName.trim())) {
          warnings.push(
            `Folder "${s.folderName}" has no matching record in Master Projects Board (code 4607672)`
          );
        }
      }
    }
    return {
      snapshots,
      source: 'live',
      warnings,
      refreshedAt: Date.now(),
    };
  } catch (err) {
    warnings.push(`ClickUp fetch failed (${(err as Error).message}); falling back to mock fixtures`);
    return {
      snapshots: mockProjectSnapshots(),
      source: 'mock',
      warnings,
      refreshedAt: Date.now(),
    };
  }
}

export async function loadProjectSnapshot(folderId: string): Promise<{
  snapshot: ProjectSnapshot | null;
  source: 'live' | 'mock';
  refreshedAt: number;
}> {
  if (!hasClickUpToken()) {
    return {
      snapshot: mockProjectSnapshot(folderId),
      source: 'mock',
      refreshedAt: Date.now(),
    };
  }
  try {
    const snapshot = await loadProject(folderId);
    return { snapshot, source: 'live', refreshedAt: Date.now() };
  } catch {
    return { snapshot: mockProjectSnapshot(folderId), source: 'mock', refreshedAt: Date.now() };
  }
}

export { MOCK_PROJECTS };
