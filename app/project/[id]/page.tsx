import { notFound } from 'next/navigation';
import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { loadPortfolio } from '@/lib/data';
import { buildUnifiedPortfolio } from '@/lib/unifiedTransform';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams?: { trade?: string; embed?: string };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const portfolio = await loadPortfolio();
  const data = buildUnifiedPortfolio({
    snapshots: portfolio.snapshots,
    source: portfolio.source,
    refreshedAt: portfolio.refreshedAt,
    warnings: portfolio.warnings,
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
