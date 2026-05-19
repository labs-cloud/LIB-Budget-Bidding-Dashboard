import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { EmbedClass } from '@/components/EmbedClass';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';
import { loadPortfolio } from '@/lib/data';
import { buildUnifiedPortfolio } from '@/lib/unifiedTransform';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: { embed?: string; project?: string; view?: string };
}

export default async function Page({ searchParams }: PageProps) {
  const embed = searchParams?.embed === '1';
  const portfolio = await loadPortfolio();
  const data = buildUnifiedPortfolio({
    snapshots: portfolio.snapshots,
    source: portfolio.source,
    refreshedAt: portfolio.refreshedAt,
    warnings: portfolio.warnings,
  });
  const initialProjectId = searchParams?.project ?? null;
  const initialView = searchParams?.view ?? null;

  return (
    <>
      <EmbedClass embed={embed} />
      <RefreshOnFocus />
      <UnifiedDashboard
        embed={embed}
        data={data}
        initialProjectId={initialProjectId}
        initialView={initialView}
      />
    </>
  );
}
