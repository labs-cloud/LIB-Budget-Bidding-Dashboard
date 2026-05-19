import { notFound } from 'next/navigation';
import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { loadPortfolio } from '@/lib/data';
import { buildUnifiedPortfolio } from '@/lib/unifiedTransform';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams?: { trade?: string; embed?: string; view?: string };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const view = searchParams?.view === 'bidding' ? 'bidding' : 'budget';
  const portfolio = await loadPortfolio();
  const data = buildUnifiedPortfolio({
    snapshots: portfolio.snapshots,
    source: portfolio.source,
    refreshedAt: portfolio.refreshedAt,
    warnings: portfolio.warnings,
    view,
  });

  const project = data.projects.find((p) => p.folderId === params.id);
  if (!project) notFound();

  return (
    <UnifiedDashboard
      data={data}
      initialProjectId={params.id}
      initialTrade={searchParams?.trade ?? null}
      embed={searchParams?.embed === '1'}
    />
  );
}
