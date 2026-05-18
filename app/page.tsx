import { Suspense } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { KpiCard } from '@/components/KpiCard';
import { StatusPill } from '@/components/StatusPill';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';
import { EmbedClass } from '@/components/EmbedClass';
import { loadPortfolio } from '@/lib/data';
import { buildPortfolioMatrix } from '@/lib/matrix';
import { shortProjectName } from '@/lib/formatting';
import { STATUS_PILL } from '@/lib/clickup/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: { embed?: string };
}

export default async function Page({ searchParams }: PageProps) {
  const embed = searchParams?.embed === '1';
  const data = await loadPortfolio();
  const matrix = buildPortfolioMatrix(data.snapshots);
  const refreshedSec = Math.floor((Date.now() - data.refreshedAt) / 1000);

  return (
    <main style={{ padding: embed ? 0 : 32 }}>
      <EmbedClass embed={embed} />
      <RefreshOnFocus />
      <div className="frame">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Budget &amp; Bidding · Portfolio</h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              {matrix.projects.length} active projects · {data.source === 'live' ? 'live from ClickUp' : 'mock data (set CLICKUP_API_TOKEN)'} · refreshed {refreshedSec}s ago
            </p>
          </div>
          <ThemeToggle />
        </div>

        {data.warnings.length > 0 ? (
          <div className="warning-banner">
            {data.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.25rem' }}>
          <KpiCard label="Bids in flight" value={String(matrix.kpis.inFlight)} sub={`${matrix.kpis.overdueFollowUp} overdue >5d`} />
          <KpiCard
            label="Awaiting follow-up"
            value={String(matrix.kpis.awaitingFollowUp)}
            sub={`${matrix.kpis.overdueFollowUp} overdue >5 days`}
            valueColor="#ab4aba"
          />
          <KpiCard label="Ready to award" value={String(matrix.kpis.readyToAward)} sub="Leveled · pending review" valueColor="#186221" />
          <KpiCard
            label="Trade Type pending"
            value={String(matrix.kpis.tradeTypePending)}
            sub={`across ${matrix.kpis.tradeTypePendingProjects} projects`}
            valueColor="#ffc53d"
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>Filter:</span>
          <button className="chip active" type="button">All projects · {matrix.projects.length}</button>
          <button className="chip" type="button">Active only</button>
          <button className="chip" type="button">Hard Costs</button>
          <button className="chip" type="button">Bids in flight</button>
          <button className="chip" type="button">Overdue</button>
        </div>

        <Suspense>
          <div className="matrix-wrap">
            <table>
              <thead>
                <tr>
                  <th className="sticky">Trade</th>
                  {matrix.projects.map((p) => (
                    <th key={p.folderId} title={p.folderName}>
                      {shortProjectName(p.folderName)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row, idx) => (
                  <tr key={row.trade} className={idx % 2 ? 'row-alt' : undefined}>
                    <td className="sticky">{row.trade}</td>
                    {row.cells.map((cell, j) => {
                      const project = matrix.projects[j];
                      if (cell.code === '—') {
                        return (
                          <td key={project.folderId}>
                            <span className="dim">—</span>
                          </td>
                        );
                      }
                      const cfg = STATUS_PILL[cell.code as keyof typeof STATUS_PILL];
                      return (
                        <td key={project.folderId} className="cell-link">
                          <Link
                            href={cell.href ?? `/project/${project.folderId}`}
                            style={{ textDecoration: 'none' }}
                          >
                            <span
                              className="pill"
                              style={{ background: cfg.bg, color: cfg.fg }}
                              title={`${cfg.name} · ${cell.count} bid${cell.count === 1 ? '' : 's'} · ${project.folderName}`}
                            >
                              {cell.code}
                            </span>
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Suspense>

        <div className="legend" aria-label="Status legend">
          {(['AW', 'LV', 'LP', 'BR', 'RS', 'FU', 'NR', 'NS', 'ND'] as const).map((code) => (
            <span key={code} className="legend-item">
              <StatusPill code={code} />
              {STATUS_PILL[code].name}
            </span>
          ))}
        </div>

        <div className="foot">
          Source:{' '}
          <a href="https://leadit.clickup.com/9017603275/v/dc/8cqvd6b-305837" style={{ color: 'inherit' }}>
            ClickUp B&amp;B SOP
          </a>{' '}
          · status vocabulary verbatim from <code>02. Bidding</code> task statuses · drilling into a cell opens the per-project bid grid.
        </div>
      </div>
    </main>
  );
}
