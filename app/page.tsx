import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { EmbedClass } from '@/components/EmbedClass';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: { embed?: string };
}

export default function Page({ searchParams }: PageProps) {
  const embed = searchParams?.embed === '1';
  return (
    <>
      <EmbedClass embed={embed} />
      <RefreshOnFocus />
      <UnifiedDashboard embed={embed} />
    </>
  );
}
