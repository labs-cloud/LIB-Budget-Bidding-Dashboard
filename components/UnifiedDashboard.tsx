'use client';

import { useEffect, useMemo, useState } from 'react';
import '@/styles/unified.css';
import type {
  GanttRow,
  PtSub,
  PtTrade,
  StatusCode,
  UnifiedPortfolio,
  UnifiedProject,
} from '@/lib/unifiedTransform';

type PortfolioView = 'pf-matrix' | 'pf-gantt';
type ProjectView = 'pj-timeline' | 'pj-matrix';
type View = PortfolioView | ProjectView;

const PORTFOLIO_VIEWS: PortfolioView[] = ['pf-matrix', 'pf-gantt'];
const PROJECT_VIEWS: ProjectView[] = ['pj-timeline', 'pj-matrix'];

function isProjectView(v: View): v is ProjectView {
  return (PROJECT_VIEWS as readonly View[]).includes(v);
}

const STATUS_NAMES: Record<StatusCode, string> = {
  NS: 'Not Started', RS: 'RFP Sent', FU: 'Followed Up', BR: 'Bid Received',
  LV: 'Leveling', LP: 'Leveled - Pending Review', NR: 'Needs Rebid',
  ND: 'No Bid / Declined', AW: 'Awarded',
};
const STATUS_COLORS: Record<StatusCode, string> = {
  NS: 'rgba(161,128,114,0.7)', RS: '#0091ff', FU: '#ab4aba', BR: '#12a594',
  LV: '#186221', LP: '#aacdab', NR: '#ffc53d', ND: '#e5484d', AW: '#30a46c',
};

interface Props {
  data: UnifiedPortfolio;
  embed?: boolean;
  initialProjectId?: string | null;
  initialView?: string | null;
  /** Trade name pulled from ?trade= on the per-project route. Scrolls to and flashes that row. */
  initialTrade?: string | null;
}

export function UnifiedDashboard({ data, embed = false, initialProjectId = null, initialView = null, initialTrade = null }: Props) {
  const [view, setView] = useState<View>(() => {
    if (initialView && [...PORTFOLIO_VIEWS, ...PROJECT_VIEWS].includes(initialView as View)) return initialView as View;
    // If we landed on a per-project URL with a ?trade= focus, default to the
    // per-trade matrix view since that's where trade rows live and the
    // scroll-to-row target is rendered.
    if (initialProjectId) return initialTrade ? 'pj-matrix' : 'pj-timeline';
    return 'pf-matrix';
  });
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('bb-theme')) as 'light' | 'dark' | null;
    const initial = stored ?? 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  // Hydrate view + project from the URL hash on first mount.
  useEffect(() => {
    const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    if (!h) return;
    const [viewPart, projPart] = h.split('/');
    if (PORTFOLIO_VIEWS.includes(viewPart as PortfolioView) || PROJECT_VIEWS.includes(viewPart as ProjectView)) {
      setView(viewPart as View);
    }
    if (projPart) setProjectId(decodeURIComponent(projPart));
  }, []);

  // Push hash on state change so deep links survive.
  useEffect(() => {
    try {
      const hash = isProjectView(view) && projectId
        ? `#${view}/${encodeURIComponent(projectId)}`
        : `#${view}`;
      window.history.replaceState(null, '', hash);
    } catch { /* ignore */ }
  }, [view, projectId]);

  const inProject = isProjectView(view);
  const project = useMemo<UnifiedProject | null>(() => {
    if (!projectId) return null;
    return data.projects.find((p) => p.folderId === projectId) ?? null;
  }, [data.projects, projectId]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bb-theme', next); } catch { /* ignore */ }
  }

  return (
    <div className={`unified-app${embed ? ' embed' : ''}`}>
      <div className="frame">
        <Hero
          inProject={inProject}
          project={project}
          data={data}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {data.warnings.length > 0 && !inProject ? (
          <div
            role="alert"
            style={{
              background: 'var(--warn-bg)', color: 'var(--warn-fg)',
              border: '0.5px solid rgba(0,0,0,0.08)',
              borderRadius: 'var(--border-radius-md)',
              padding: '8px 12px', fontSize: 12,
              marginBottom: 12, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {data.warnings.map((w, i) => (<div key={i}>{w}</div>))}
          </div>
        ) : null}

        {!inProject ? (
          <div className="filter-row">
            <input type="search" placeholder="Search projects, trades, subs…" />
            <select defaultValue=""><option value="">All coordinators</option><option>Sol Klein</option><option>Malky Kahan</option><option>Faigy Fellman</option></select>
            <select defaultValue=""><option value="">All phases</option><option>Pre-construction</option><option>Bidding</option><option>Construction</option></select>
            <select defaultValue=""><option value="">All cost types</option><option>Hard cost</option><option>Soft cost</option></select>
            <div className="spacer" />
            <div className="view-tabs">
              <button type="button" className={view === 'pf-matrix' ? 'active' : ''} onClick={() => setView('pf-matrix')}>
                <Icon name="grid-dots" /> Matrix
              </button>
              <button type="button" className={view === 'pf-gantt' ? 'active' : ''} onClick={() => setView('pf-gantt')}>
                <Icon name="timeline" /> Gantt
              </button>
            </div>
          </div>
        ) : null}

        {!inProject ? (
          <PortfolioShell data={data} view={view as PortfolioView} />
        ) : project ? (
          <ProjectShell project={project} view={view as ProjectView} onChange={(v) => setView(v)} initialTrade={initialTrade} />
        ) : (
          <p style={{ color: 'var(--color-text-secondary)' }}>Project not found.</p>
        )}

        <div className="bb-footer">
          Source:{' '}
          <a href="https://leadit.clickup.com/9017603275/v/dc/8cqvd6b-305837">ClickUp B&amp;B SOP</a>
          {' · '}
          {data.source === 'live' ? `live · refreshed ${data.refreshedAgo}` : 'mock fixtures (set CLICKUP_API_TOKEN)'}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hero
// ----------------------------------------------------------------------------

function Hero({
  inProject, project, data, theme, onToggleTheme,
}: {
  inProject: boolean;
  project: UnifiedProject | null;
  data: UnifiedPortfolio;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const title = inProject && project ? project.folderName : 'Budget Dashboard';
  const activeCount = data.hero.activeProjects;
  const meta = inProject && project
    ? <><b>{project.summary.trades} trades</b> · {project.summary.awarded} awarded · {project.summary.bidding} bidding · {project.summary.set} set · Updated budget {project.summary.updatedBudget}</>
    : <><b>{activeCount} of {activeCount} active projects</b> · {data.source === 'live' ? 'live from ClickUp' : 'mock data'} · refreshed {data.refreshedAgo}</>;

  return (
    <div className="lib-hero">
      <div className="logo-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lib_logo.png" alt="Lead It Builders" className="lib-logo-svg" style={{ objectFit: 'contain' }} />
      </div>
      <div>
        <h1>{title}</h1>
        <div className="meta">{meta}</div>
      </div>
      <div className="lib-hero-right">
        <button className="dash-pill" type="button">
          <Icon name="layout-dashboard" /> Budget dashboard
        </button>
        <button className="iconbtn" type="button" title="Refresh" onClick={() => location.reload()}><Icon name="refresh" /></button>
        <button className="iconbtn" type="button" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Icon name="sun" /> : <Icon name="moon" />}
        </button>
        <span className="status-pill">{data.source === 'live' ? 'Live' : 'Mock'}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Portfolio shell
// ----------------------------------------------------------------------------

function PortfolioShell({
  data, view,
}: { data: UnifiedPortfolio; view: PortfolioView }) {
  const k = data.kpis;
  return (
    <>
      <div className="kpis">
        <div className="kpi info"><div className="l">Bids in flight</div><div className="v">{k.inFlight}</div><div className="s">{k.inFlightDelta}</div></div>
        <div className="kpi warn"><div className="l">Awaiting follow-up</div><div className="v">{k.awaitingFollowUp}</div><div className="s">{k.awaitingStale} stale &gt;7d</div></div>
        <div className="kpi good"><div className="l">Ready to award</div><div className="v">{k.readyToAward}</div><div className="s">{k.readyDelta}</div></div>
        <div className="kpi neutral"><div className="l">Trade Type pending</div><div className="v">{k.tradeTypePending}</div><div className="s">across {k.tradeTypePendingProjects} projects</div></div>
      </div>

      {view === 'pf-matrix'
        ? <PortfolioMatrix data={data} />
        : <PortfolioGantt data={data} />}
    </>
  );
}

function slugifyTrade(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function PortfolioMatrix({ data }: { data: UnifiedPortfolio }) {
  const stale = data.stale;
  return (
    <div className="body-wrap">
      <div className="panel-card">
        <div className="h">
          <Icon name="grid-dots" /> Portfolio bidding matrix
          <span className="meta">
            {data.matrix.rows.length} trades × {data.matrix.projects.length} projects · click a project header to drill in
          </span>
        </div>
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="col-trade">Trade</th>
                {data.matrix.projects.map((p) => (
                  <th key={p.folderId} className="col-proj">
                    <a
                      href={`/project/${encodeURIComponent(p.folderId)}`}
                      className="col-proj-link"
                      title={`Open ${p.name}`}
                    >
                      {p.name}
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.rows.map((r) => (
                <tr key={r.trade}>
                  <td className="trade-name" title={r.trade}>
                    <span className={`ctag ${r.cost}`}>{r.cost === 'hard' ? 'H' : 'S'}</span>
                    <a
                      href={`/trade/${encodeURIComponent(r.trade)}`}
                      className="trade-link"
                      title={`Open ${r.trade} cross-portfolio view`}
                    >
                      {r.trade}
                    </a>
                  </td>
                  {r.cells.map((cell, ci) => {
                    const proj = data.matrix.projects[ci];
                    if (!cell.code) {
                      return (
                        <td key={ci}>
                          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>—</span>
                        </td>
                      );
                    }
                    const href = `/project/${encodeURIComponent(proj.folderId)}?trade=${encodeURIComponent(r.trade)}#trade-row-${slugifyTrade(r.trade)}`;
                    return (
                      <td key={ci}>
                        <a
                          href={href}
                          className="cell-link"
                          title={`Open ${proj.name} · ${r.trade} (${cell.name ?? cell.code})`}
                        >
                          <span className={`bb-cell-pill ${cell.code.toLowerCase()}`}>{cell.code}</span>
                        </a>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          {(Object.keys(STATUS_NAMES) as StatusCode[]).map((k) => (
            <span key={k} className="sw">
              <span className={`bb-cell-pill ${k.toLowerCase()}`}>{k}</span>
              {STATUS_NAMES[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="h">
          <Icon name="clock-exclamation" /> Awaiting follow-up
          <span className="meta">{stale.length} stale · sorted by days since last update</span>
        </div>
        <div className="perm-list">
          {stale.length === 0 ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, padding: 10 }}>
              No bids stale &gt;7 days.
            </div>
          ) : stale.map((b) => {
            const crit = b.days >= 12;
            return (
              <a
                key={`${b.sub}-${b.projectFolderId}-${b.trade}`}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`row${crit ? ' critical' : ''}`}
                title={`Open ${b.sub} (${b.trade}) bid in ClickUp (new tab)`}
              >
                <div className="when">
                  <div className="d">{b.days}</div>
                  <div className="mo">days</div>
                </div>
                <div className="info">
                  <div className="trade">{b.trade}<span className="ext-icon" aria-hidden>↗</span></div>
                  <div className="name">{b.sub}</div>
                  <div className="proj">{b.project} · last update {b.rfp}</div>
                </div>
                <span className="countdown">{crit ? 'overdue' : 'stale'}</span>
              </a>
            );
          })}
        </div>
        <div style={{ height: 18 }} />
        <div className="h" style={{ marginTop: 4 }}>
          <Icon name="chart-pie" /> Status distribution
          <span className="meta">{data.matrix.totalCells} cells</span>
        </div>
        <div className="stat-bar">
          {data.matrix.distribution.map((d) => (
            <div
              key={d.code}
              className="seg"
              style={{ width: `${(d.n / Math.max(1, data.matrix.totalCells) * 100).toFixed(2)}%`, background: STATUS_COLORS[d.code] }}
              title={`${STATUS_NAMES[d.code]}: ${d.n}`}
            />
          ))}
        </div>
        <div className="stat-legend">
          {data.matrix.distribution.map((d) => (
            <div key={d.code} className="row">
              <span className="dot" style={{ background: STATUS_COLORS[d.code] }} />
              {STATUS_NAMES[d.code]}
              <span className="n">{d.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortfolioGantt({ data }: { data: UnifiedPortfolio }) {
  const todayPct = data.ganttAxis.todayPct;
  return (
    <div className="gantt-card">
      <div className="h">
        <Icon name="timeline" /> Bid lifecycle timeline
        <span className="meta">Aggregated across {data.hero.activeProjects} projects · grouped by Cost Type</span>
      </div>
      <div className="gantt">
        <div />
        <div className="ax-track">
          {data.ganttAxis.ticks.map((t, i) => (
            // The "today" tick gets its label from the .ax-tick.today::after
            // pseudo ("TODAY") — emitting t.label as text too would stack
            // "TODAY" on top of the date and produce an unreadable overlap
            // (especially obvious when today falls near a regular tick date).
            <span key={i} className={`ax-tick${t.today ? ' today' : ''}`} style={{ left: `${t.left}%` }}>
              {t.today ? '' : t.label}
            </span>
          ))}
        </div>
        <div />

        {data.gantt.map((g) => (
          <FragmentBlock key={g.label}>
            <div className="group-divider">
              <span className={`tag ${g.cost}`}>{g.label}</span>
              <span className="line" />
              <span className="count">{g.count}</span>
            </div>
            {g.rows.map((r) => <GanttRowEl key={r.name} row={r} todayPct={todayPct} />)}
          </FragmentBlock>
        ))}
      </div>
      <div className="legend">
        <span className="sw"><i style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: 'linear-gradient(90deg,#C58518,#D69128)' }} />In flight</span>
        <span className="sw"><i style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: 'linear-gradient(90deg,#963030,#B33B3B)' }} />Stale &gt; 10d</span>
        <span className="sw"><i style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: 'linear-gradient(90deg,#2C7A55,#30A46C)' }} />Awarded</span>
        <span className="sw"><i style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, background: 'linear-gradient(90deg,#4F4639,#6F6354)' }} />Set</span>
        <span className="sw"><i style={{ display: 'inline-block', background: '#000', height: 14, width: 2 }} />Today</span>
      </div>
    </div>
  );
}

function GanttRowEl({ row, todayPct }: { row: GanttRow; todayPct: number }) {
  return (
    <FragmentBlock>
      <div className="tr-label"><span className="tag">{row.tagShort}</span><span className="name">{row.name}</span></div>
      <div className="tr-track">
        <div className="today-line" style={{ left: `${todayPct}%` }} />
        <div className={`tr-bar ${row.barKind}`} style={{ left: `${row.left}%`, width: `${row.width}%` }}>
          {Array.from({ length: row.pips }).map((_, i) => <span key={i} className="pip" />)}
          {row.span}
          <span className="marker-end" />
        </div>
      </div>
      <div className="tr-chip">
        <span className={`pill ${row.pillKind}`}>{row.pillText}</span>
        <span className="sub">{row.sub}</span>
      </div>
    </FragmentBlock>
  );
}

// ----------------------------------------------------------------------------
// Project shell
// ----------------------------------------------------------------------------

function ProjectShell({
  project, view, onChange, initialTrade,
}: { project: UnifiedProject; view: ProjectView; onChange: (v: View) => void; initialTrade: string | null }) {
  return (
    <>
      <div className="crumb">
        <a href="/">← Budget &amp; Bidding</a>
        <Icon name="chevron-right" />
        <a href="/">Portfolio</a>
        <Icon name="chevron-right" />
        <span>{project.folderName}</span>
      </div>

      <header className="header-grid">
        <div>
          <h1 className="h-title">{project.folderName}</h1>
          <div className="h-meta">
            <span className="chip"><span className="avatar avatar-sol">{project.coord.initials}</span>{project.coord.name}</span>
            <span className="phase"><Icon name="gavel" size={13} />{project.phase}</span>
            {project.address ? <span><Icon name="map-pin" size={13} /> {project.address}</span> : null}
            {project.projectId ? <span><Icon name="id" size={13} /> {project.projectId}</span> : null}
          </div>
        </div>
        <div className="h-actions">
          <a
            className="btn primary ext"
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${project.folderName} folder in ClickUp (new tab)`}
          >
            <Icon name="external-link" size={14} /> Open in ClickUp
            <span className="ext-icon" aria-hidden>↗</span>
          </a>
        </div>
      </header>

      <div className="summary">
        <div className="cell"><div className="l">Trades</div><div className="v">{project.summary.trades}</div></div>
        <div className="cell good"><div className="l">Awarded</div><div className="v">{project.summary.awarded}</div></div>
        <div className="cell warn"><div className="l">In bidding</div><div className="v">{project.summary.bidding}</div></div>
        <div className="cell muted"><div className="l">Set</div><div className="v">{project.summary.set}</div></div>
        <div className="cell money"><div className="l">Updated budget</div><div className="v">{project.summary.updatedBudget}</div></div>
      </div>

      <div className="project-subtabs">
        <button type="button" className={view === 'pj-timeline' ? 'active' : ''} onClick={() => onChange('pj-timeline')}>
          <Icon name="list-check" />Timeline
        </button>
        <button type="button" className={view === 'pj-matrix' ? 'active' : ''} onClick={() => onChange('pj-matrix')}>
          <Icon name="table" />Per-trade matrix
        </button>
      </div>

      {view === 'pj-timeline' ? <ProjectTimeline project={project} /> : <ProjectMatrix project={project} initialTrade={initialTrade} />}
    </>
  );
}

function ProjectTimeline({ project }: { project: UnifiedProject }) {
  return (
    <div className="layout">
      <div className="timeline">
        {project.timeline.length === 0 ? (
          <p style={{ color: 'var(--color-text-tertiary)' }}>No bidding activity yet.</p>
        ) : project.timeline.map((g) => (
          <FragmentBlock key={g.label}>
            <div className={`group-h ${g.group}`}>
              {g.label}<span className="count">{g.sub}</span>
            </div>
            {g.rows.map((r) => {
              const [pillCls, pillCode, pillName] = STATUS_PILL_FOR_TIMELINE[r.stat];
              const amountLabel = r.stat === 'set' ? 'Amount' : r.stat === 'lv' ? 'Lowest' : 'Bid';
              const tlCardInner = (
                <div className={`tl-card ${r.stat}`}>
                  <div className="top">
                    <span className="col-tag">{r.tag}</span>
                    <span className="name">{r.name}{r.url ? <span className="ext-icon" aria-hidden>↗</span> : null}</span>
                    <span className={`bb-pill ${pillCls}`}>
                      <span className="code">{pillCode}</span>{pillName}
                    </span>
                  </div>
                  <div className="meta">
                    <span className="sub-name">{r.sub}</span>
                    {r.amt ? <span><span className="label">{amountLabel}</span> <span className="amt">{r.amt}</span></span> : null}
                    <span><span className="label">Allocated</span> {r.alloc}</span>
                    {r.rfp ? <span><span className="label">RFP</span> {r.rfp}</span> : null}
                  </div>
                </div>
              );
              return (
                <div key={`${r.name}-${r.date}`} className={`tl-row ${r.stat}`}>
                  <div className={`tl-date${r.warn ? ' warn' : ''}`}>{r.date}</div>
                  {r.url ? (
                    <a
                      className="row-link"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${r.name} in ClickUp (new tab)`}
                    >
                      {tlCardInner}
                    </a>
                  ) : tlCardInner}
                </div>
              );
            })}
          </FragmentBlock>
        ))}
      </div>

      <aside className="side">
        <div className="panel">
          <h3>Bids in flight <span className="count">{project.inFlight.length}</span></h3>
          {project.inFlight.length === 0 ? (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>No in-flight bids.</div>
          ) : project.inFlight.map((b) => (
            <a
              key={`${b.sub}-${b.trade}`}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`bif-card row-link${b.crit ? ' critical' : ''}`}
              title={`Open ${b.sub} (${b.trade}) bid in ClickUp (new tab)`}
            >
              <div className="top">
                <div>
                  <div className="trade-tag">{b.trade}<span className="ext-icon" aria-hidden>↗</span></div>
                  <div className="sub">{b.sub}</div>
                </div>
                <span className="countdown">{b.days}</span>
              </div>
              <div className="meta">{b.meta}</div>
            </a>
          ))}
        </div>
        <div className="panel">
          <h3>Cost-type rollup</h3>
          <div className="chain-row">
            <span className="role">
              <span className="bb-pill" style={{ background: 'var(--bb-hard-bg)', color: 'var(--bb-hard)', fontSize: 10, letterSpacing: '0.05em', padding: '1px 6px' }}>HARD</span>{' '}
              {project.rollup.hardTrades} trades
            </span>
            <span className="who">{project.rollup.hardTotal}</span>
          </div>
          <div className="chain-row">
            <span className="role">
              <span className="bb-pill" style={{ background: 'var(--bb-soft-bg)', color: 'var(--bb-soft)', fontSize: 10, letterSpacing: '0.05em', padding: '1px 6px' }}>SOFT</span>{' '}
              {project.rollup.softTrades} trades
            </span>
            <span className="who">{project.rollup.softTotal}</span>
          </div>
          <div className="chain-row" style={{ borderTop: '0.5px solid var(--color-border-secondary)', paddingTop: 10, marginTop: 4 }}>
            <span className="role" style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Updated budget</span>
            <span className="who" style={{ color: 'var(--good-strong)', fontSize: 14 }}>{project.rollup.updated}</span>
          </div>
          <div className="chain-row"><span className="role">Allocated</span><span className="who">{project.rollup.allocated}</span></div>
          <div className="chain-row">
            <span className="role">Variance</span>
            <span
              className="who"
              style={{ color: project.rollup.varianceKind === 'pos' ? 'var(--good-fg)' : project.rollup.varianceKind === 'neg' ? 'var(--danger-fg)' : 'var(--color-text-secondary)' }}
            >
              {project.rollup.variance}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectMatrix({ project, initialTrade }: { project: UnifiedProject; initialTrade: string | null }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlightedSlug, setHighlightedSlug] = useState<string | null>(null);

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Honour ?trade=<name> by scrolling to that trade row and flashing it.
  // Slug match means we don't depend on exact-case casing from the URL.
  useEffect(() => {
    if (!initialTrade) return;
    const slug = slugifyTrade(initialTrade);
    const el = typeof document !== 'undefined' ? document.getElementById(`trade-row-${slug}`) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedSlug(slug);
    const t = window.setTimeout(() => setHighlightedSlug(null), 1700);
    return () => window.clearTimeout(t);
  }, [initialTrade]);

  return (
    <div className="table-card">
      <div className="h">
        <Icon name="table" /> Per-trade bid matrix
        <span className="meta">{project.ptTrades.length} trades · up to 4 subs · click any row to expand the stage Gantt</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="per-trade">
          <colgroup>
            <col className="c-trade" /><col className="c-sub" /><col className="c-sub" /><col className="c-sub" /><col className="c-sub" />
            <col className="c-money" /><col className="c-money" /><col className="c-delta" /><col className="c-toggle" />
          </colgroup>
          <thead>
            <tr>
              <th>Trade</th>
              <th>Sub 1</th><th>Sub 2</th><th>Sub 3</th><th>Sub 4</th>
              <th className="r">Updated</th><th className="r">Allocated</th><th className="r">∆</th><th className="c" />
            </tr>
          </thead>
          <tbody>
            {project.ptTrades.map((t, i) => {
              const slug = slugifyTrade(t.name);
              const isHighlighted = slug === highlightedSlug;
              return (
              <FragmentBlock key={t.name}>
                <tr
                  id={`trade-row-${slug}`}
                  className={`trade-row${expanded.has(i) ? ' expanded' : ''}${isHighlighted ? ' row-highlight' : ''}`}
                  onClick={() => toggle(i)}
                >
                  <td className="td-trade">
                    <span className={`ctag ${t.cost}`}>{t.cost === 'hard' ? 'H' : 'S'}</span>
                    <a
                      className="name ext"
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${t.name} budget task in ClickUp (new tab)`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.name}<span className="ext-icon" aria-hidden>↗</span>
                    </a>
                    <div className="sub-meta">{t.tag} · {t.stage}</div>
                  </td>
                  <td className="bid-cell"><BidCard bid={t.subs[0]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[1]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[2]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[3]} /></td>
                  <td className="td-money">{fmtShort(t.updated)}<span className="sub-label">updated</span></td>
                  <td className="td-money">{fmtShort(t.allocated)}<span className="sub-label">allocated</span></td>
                  <td className="td-delta"><DeltaCell updated={t.updated} allocated={t.allocated} /></td>
                  <td className="td-toggle">
                    <button type="button" aria-label="expand" onClick={(e) => { e.stopPropagation(); toggle(i); }}>
                      <Icon name="chevron-right" />
                    </button>
                  </td>
                </tr>
                {expanded.has(i) ? (
                  <tr className="expand-row">
                    <td colSpan={9}>
                      <div className="expand-content">
                        <div className="h">
                          <Icon name="timeline" /> Bidding-stage timeline · {t.name}
                          <span className="meta">{t.subs.filter(Boolean).length} subs · stage = {t.stage}</span>
                        </div>
                        <MiniGantt trade={t} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </FragmentBlock>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BidCard({ bid }: { bid: PtSub | null | undefined }) {
  if (!bid) return <div className="bid-card empty">—</div>;
  const cls = 'bid-card' + (bid.isLow ? ' is-low' : '');
  return (
    <a
      className={cls}
      title={`Open ${bid.name} bid in ClickUp (new tab) · ${STATUS_NAMES[bid.status]}`}
      href={bid.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sub-name">{bid.name}<span className="ext-icon" aria-hidden>↗</span></div>
      <div className="row2">
        <span className={`bb-pill ${bid.status.toLowerCase()}`}><span className="code">{bid.status}</span></span>
        {bid.amount == null
          ? <span className="amt dim">awaiting</span>
          : <span className="amt">{fmtShort(bid.amount)}</span>}
      </div>
    </a>
  );
}

function DeltaCell({ updated, allocated }: { updated: number | null; allocated: number | null }) {
  if (updated == null || allocated == null || allocated === 0) return <div className="delta zero">—</div>;
  const diff = allocated - updated;
  const pct = diff / allocated * 100;
  if (Math.abs(diff) < 1) return <div className="delta zero">±0</div>;
  if (diff > 0) {
    return (
      <div className="delta pos">−{fmtShort(diff)}<br />
        <span style={{ fontSize: 9, opacity: 0.85 }}>{pct.toFixed(1)}% under</span>
      </div>
    );
  }
  return (
    <div className="delta neg">+{fmtShort(-diff)}<br />
      <span style={{ fontSize: 9, opacity: 0.85 }}>{(-pct).toFixed(1)}% over</span>
    </div>
  );
}

// Per-row mini gantt — start of bidding (oldest RFP) → today.
function MiniGantt({ trade }: { trade: PtTrade }) {
  const subs = trade.subs.filter(Boolean) as PtSub[];
  if (subs.length === 0) return <p style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>No bids yet.</p>;

  // Build a local axis from RFP dates of these subs. Fall back to a fixed
  // 80-day window when nothing parses.
  const today = Date.now();
  const dates = subs
    .map((s) => parseShortDate(s.rfp))
    .filter((d): d is number => d != null);
  const start = dates.length > 0 ? Math.min(...dates) : today - 60 * 86_400_000;
  const end = Math.max(today, ...(dates.length > 0 ? dates : [today]));
  const span = Math.max(1, end - start);
  const pctOf = (ms: number | null) => ms == null ? null : Math.max(0, Math.min(100, ((ms - start) / span) * 100));
  const todayPct = ((today - start) / span) * 100;

  return (
    <div className="mini-gantt">
      <div className="mg-row">
        <div />
        <div className="mg-axis">
          {[0, 20, 40, 60, 80].map((p) => (
            <span key={p} className="tick" style={{ left: `${p}%` }}>{fmtMonthDayMs(start + (p / 100) * span)}</span>
          ))}
          <span className="tick today" style={{ left: `${todayPct.toFixed(1)}%` }}>Today</span>
        </div>
        <div />
      </div>
      {subs.map((s) => {
        const startMs = parseShortDate(s.rfp);
        const startP = pctOf(startMs);
        const endP = todayPct;
        const startPos = startP ?? 0;
        const width = Math.max(2, endP - startPos);
        const isAwarded = s.status === 'AW';
        const isDeclined = s.status === 'ND';
        const isSet = s.rfp.startsWith('— set');
        const barClass = isAwarded ? 'awarded' : isDeclined ? 'declined' : 'in-flight';
        return (
          <div className="mg-row" key={s.name}>
            <div className="sub-label">
              {s.name}
              <span className="sub-meta">RFP {s.rfp} · last activity {s.last}</span>
            </div>
            <div className="mg-track">
              <div className="today-line" style={{ left: `${todayPct.toFixed(1)}%` }} />
              {isSet ? (
                <div className="mg-bar awarded" style={{ left: `${Math.max(0, todayPct - 2).toFixed(1)}%`, width: '4%' }}>SET</div>
              ) : (
                <div className={`mg-bar ${barClass}`} style={{ left: `${startPos.toFixed(1)}%`, width: `${width.toFixed(1)}%` }}>
                  {s.rfp} → {s.last}
                </div>
              )}
              {startP != null ? (
                <div className="mg-stage rs" style={{ left: `${startPos.toFixed(1)}%` }} title={`RFP Sent · ${s.rfp}`} />
              ) : null}
              {!isSet ? (
                <div
                  className={`mg-stage ${isAwarded ? 'aw' : isDeclined ? 'nd' : s.status.toLowerCase()}`}
                  style={{ left: `${endP.toFixed(1)}%` }}
                  title={`${STATUS_NAMES[s.status]} · ${s.last}`}
                />
              ) : null}
            </div>
            <div className="chip">
              {s.amount != null
                ? <><strong>{fmtShort(s.amount)}</strong> · {STATUS_NAMES[s.status]}</>
                : STATUS_NAMES[s.status]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function FragmentBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const STATUS_PILL_FOR_TIMELINE: Record<'aw' | 'lv' | 'rs' | 'fu' | 'br' | 'set', [string, string, string]> = {
  aw:  ['aw', 'AW', 'Awarded'],
  lv:  ['lv', 'LV', 'Leveling'],
  rs:  ['rs', 'RS', 'RFP Sent'],
  fu:  ['fu', 'FU', 'Followed Up'],
  br:  ['br', 'BR', 'Bid Received'],
  set: ['aw', 'AW', 'Awarded · Set'],
};

function fmtShort(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + n;
}

const MONTH_INDEX: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseShortDate(s: string): number | null {
  if (!s || s === '—' || s.startsWith('— set')) return null;
  const m = s.match(/^([A-Za-z]+)\s+(\d+)/);
  if (!m) return null;
  const month = MONTH_INDEX[m[1] as keyof typeof MONTH_INDEX];
  if (month == null) return null;
  const year = new Date().getFullYear();
  return new Date(year, month, parseInt(m[2], 10)).getTime();
}

function fmtMonthDayMs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

// Tabler-icon as inline SVG — avoids a CDN font dependency.
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const path = ICON_PATHS[name];
  if (!path) return <span aria-hidden style={{ display: 'inline-block', width: size, height: size }} />;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {path}
    </svg>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  'layout-dashboard': (<><rect x="4" y="4" width="6" height="8" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="14" y="12" width="6" height="8" rx="1" /></>),
  refresh: (<><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 4v4h-4" /><path d="M3 20v-4h4" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>),
  moon: (<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  'grid-dots': (<><circle cx="5" cy="5" r="1.5" /><circle cx="12" cy="5" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="19" r="1.5" /><circle cx="12" cy="19" r="1.5" /><circle cx="19" cy="19" r="1.5" /></>),
  timeline: (<><circle cx="4" cy="14" r="1.5" /><circle cx="10" cy="8" r="1.5" /><circle cx="16" cy="16" r="1.5" /><circle cx="22" cy="6" r="1.5" /><path d="M5 13l4-4M11 9l4 6M17 15l4-8" /></>),
  'clock-exclamation': (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M19 14v3M19 20v.01" /></>),
  'chart-pie': (<><path d="M12 3v9h9" /><path d="M21 12a9 9 0 1 1-9-9" /></>),
  'chevron-right': (<path d="M9 6l6 6-6 6" />),
  gavel: (<><path d="M14 4l6 6" /><path d="M9 9l6 6" /><path d="M4 14l6 6" /><path d="M2 18l4-4M6 22l4-4" /></>),
  'map-pin': (<><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>),
  id: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.5" /><path d="M14 10h5M14 14h5M14 17h3" /></>),
  folder: (<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></>),
  'external-link': (<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M20 14v6H4V4h6" /></>),
  'list-check': (<><path d="M4 6h13M4 12h13M4 18h13" /><path d="M19 5l1.5 1.5L23 4" /><path d="M19 11l1.5 1.5L23 10" /><path d="M19 17l1.5 1.5L23 16" /></>),
  table: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16M15 4v16" /></>),
};
