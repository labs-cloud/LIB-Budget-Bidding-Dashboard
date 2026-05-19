import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { name: string };
}

export default function TradeViewPlaceholder({ params }: PageProps) {
  const tradeName = decodeURIComponent(params.name);
  return (
    <main className="unified-app">
      <div className="frame" style={{ padding: '3rem 1.75rem' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', marginBottom: 8 }}>
          <Link href="/" style={{ color: 'inherit' }}>← Back to portfolio</Link>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{tradeName}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
          Cross-portfolio trade view — coming soon.
        </p>
        <div style={{
          padding: '20px 22px',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 'var(--border-radius-lg)',
          background: 'var(--color-background-secondary)',
          color: 'var(--color-text-secondary)',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          This page will surface every project that has <strong>{tradeName}</strong> in its
          Budget list — with bid status, lowest bid amount, awarded sub, and a
          cross-project comparison gantt. Tracked in a follow-up PR.
        </div>
      </div>
    </main>
  );
}
