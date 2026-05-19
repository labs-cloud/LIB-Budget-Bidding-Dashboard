'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import '@/styles/unified.css';
import type {
  BudgetStatusCode,
  GanttRow,
  LevelingEntry,
  PtSub,
  PtTrade,
  StatusCode,
  SubcontractorStats,
  SyncIssueRow,
  UnifiedPortfolio,
  UnifiedProject,
} from '@/lib/unifiedTransform';
import { BUDGET_STATUS_LABEL } from '@/lib/unifiedTransform';
import { BIDDING_STATUSES, type BiddingStatus, type TradeTypeValue } from '@/lib/clickup/types';

type PortfolioView = 'pf-matrix' | 'pf-gantt' | 'pf-subs';
type ProjectView = 'pj-timeline' | 'pj-matrix';
type View = PortfolioView | ProjectView;

const PORTFOLIO_VIEWS: PortfolioView[] = ['pf-matrix', 'pf-gantt', 'pf-subs'];
const PROJECT_VIEWS: ProjectView[] = ['pj-timeline', 'pj-matrix'];

// SOP Section 2 (verbatim): the seven people who own the Budget & Bidding
// workflow. The "All team members" dropdown is sourced from this list so it
// doesn't pull in arbitrary assignees from unrelated trades (e.g. the P&P
// team that shows up when we harvested from ClickUp). Gap 9.
const TEAM_MEMBERS = [
  'Isaac Adler',
  'Tuly Steinmetz',
  'Shlome Friedman',
  'Raizy Hollander',
  'Malky Teitelbaum',
  'Luis Núñez',
  'Shimon Katz',
];

const TRADE_TYPE_OPTIONS: TradeTypeValue[] = ['Biddable', 'Set', 'Pending'];

const BUDGET_STATUS_COLOR: Record<BudgetStatusCode, string> = {
  TB: '#bcb6ad',
  OB: '#0091ff',
  BS: '#7c50c8',
  BC: '#30a46c',
};

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
  // Portfolio filters (Gaps 1, 2). 'all' = no filter.
  const [filterStatus, setFilterStatus] = useState<BiddingStatus | 'all'>('all');
  const [filterTradeType, setFilterTradeType] = useState<TradeTypeValue | 'all'>('all');
  const [filterCost, setFilterCost] = useState<'hard' | 'soft' | 'all'>('all');
  // Sync issue side panel (Gap 7).
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

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
          embed={embed}
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
            <select defaultValue="">
              {/* Gap 9: hardcoded to the 7 SOP team members. */}
              <option value="">All team members</option>
              {TEAM_MEMBERS.map((m) => (<option key={m}>{m}</option>))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as BiddingStatus | 'all')}
            >
              {/* Gap 1: 9 canonical Bidding statuses from the SOP. */}
              <option value="all">All bidding statuses</option>
              {BIDDING_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select
              value={filterTradeType}
              onChange={(e) => setFilterTradeType(e.target.value as TradeTypeValue | 'all')}
            >
              {/* Gap 2: Trade Type triage. */}
              <option value="all">All trade types</option>
              {TRADE_TYPE_OPTIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select
              value={filterCost}
              onChange={(e) => setFilterCost(e.target.value as 'hard' | 'soft' | 'all')}
            >
              <option value="all">All cost types</option>
              <option value="hard">Hard cost</option>
              <option value="soft">Soft cost</option>
            </select>
            <div className="spacer" />
            <div className="view-tabs">
              <button type="button" className={view === 'pf-matrix' ? 'active' : ''} onClick={() => setView('pf-matrix')}>
                <Icon name="grid-dots" /> Matrix
              </button>
              <button type="button" className={view === 'pf-gantt' ? 'active' : ''} onClick={() => setView('pf-gantt')}>
                <Icon name="timeline" /> Gantt
              </button>
              <button type="button" className={view === 'pf-subs' ? 'active' : ''} onClick={() => setView('pf-subs')}>
                <Icon name="users" /> Subcontractors
              </button>
            </div>
          </div>
        ) : null}

        {!inProject ? (
          <PortfolioShell
            data={data}
            view={view as PortfolioView}
            filterStatus={filterStatus}
            filterTradeType={filterTradeType}
            filterCost={filterCost}
            onOpenSyncPanel={() => setSyncPanelOpen(true)}
          />
        ) : project ? (
          <ProjectShell project={project} mode={data.view} view={view as ProjectView} onChange={(v) => setView(v)} initialTrade={initialTrade} />
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
      {syncPanelOpen ? (
        <SyncIssuesPanel rows={data.syncIssueRows} onClose={() => setSyncPanelOpen(false)} />
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hero
// ----------------------------------------------------------------------------

function Hero({
  inProject, project, data, theme, embed, onToggleTheme,
}: {
  inProject: boolean;
  project: UnifiedProject | null;
  data: UnifiedPortfolio;
  theme: 'light' | 'dark';
  embed: boolean;
  onToggleTheme: () => void;
}) {
  const mode = data.view;
  const title = inProject && project ? project.folderName : `${mode === 'bidding' ? 'Bidding' : 'Budget'} Dashboard`;
  const activeCount = data.hero.activeProjects;
  const meta = inProject && project
    ? <><b>{project.summary.trades} trades</b> · {project.summary.awarded} awarded · {project.summary.bidding} bidding{mode === 'budget' ? <> · {project.summary.set} set · {project.summary.syncIssues} sync issues</> : null} · Updated budget {project.summary.updatedBudget}</>
    : <><b>{activeCount} of {activeCount} active projects</b> · {data.source === 'live' ? 'live from ClickUp' : 'mock data'} · refreshed {data.refreshedAgo}</>;

  // Budget/Bidding toggle navigates with ?view=, preserving the project route
  // and embed flag so the choice deep-links and survives refresh.
  const base = inProject && project ? `/project/${encodeURIComponent(project.folderId)}` : '/';
  const hrefFor = (m: 'budget' | 'bidding') => `${base}?view=${m}${embed ? '&embed=1' : ''}`;

  return (
    <div className="lib-hero">
      <div className="logo-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lib_logo.png" alt="Lead It Builders" className="lib-logo-svg" style={{ objectFit: 'contain' }} />
      </div>
      <div>
        <h1>
          {title}
          <span className={`mode-chip ${mode}`}>B&amp;B · {mode === 'bidding' ? 'Bidding' : 'Budget'}</span>
        </h1>
        <div className="meta">{meta}</div>
      </div>
      <div className="lib-hero-right">
        <div className="dash-toggle" role="tablist" aria-label="Dashboard view">
          <a
            className={mode === 'budget' ? 'active' : ''}
            href={hrefFor('budget')}
            role="tab"
            aria-selected={mode === 'budget'}
          >
            <Icon name="layout-dashboard" /> Budget
          </a>
          <a
            className={mode === 'bidding' ? 'active' : ''}
            href={hrefFor('bidding')}
            role="tab"
            aria-selected={mode === 'bidding'}
          >
            <Icon name="gavel" /> Bidding
          </a>
        </div>
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
  data, view, filterStatus, filterTradeType, filterCost, onOpenSyncPanel,
}: {
  data: UnifiedPortfolio;
  view: PortfolioView;
  filterStatus: BiddingStatus | 'all';
  filterTradeType: TradeTypeValue | 'all';
  filterCost: 'hard' | 'soft' | 'all';
  onOpenSyncPanel: () => void;
}) {
  const k = data.kpis;
  const bidding = data.view === 'bidding';
  // Trade-count caption adapts: "56 trades" in Budget view, "24 biddable
  // trades" in Bidding view.
  const tradeCaption = bidding
    ? `${data.budgetOutlook.tradeCount} biddable trades`
    : `${data.budgetOutlook.tradeCount} trades`;
  return (
    <>
      <div className="kpis">
        <div className="kpi info"><div className="l">Bids in flight</div><div className="v">{k.inFlight}</div><div className="s">{k.inFlightDelta}</div></div>
        <div className="kpi warn"><div className="l">Awaiting follow-up</div><div className="v">{k.awaitingFollowUp}</div><div className="s">{k.awaitingStale} stale &gt;7d</div></div>
        <div className="kpi good"><div className="l">Ready to award</div><div className="v">{k.readyToAward}</div><div className="s">{k.readyDelta}</div></div>
        {/* Operational KPIs — about getting Trade Type set in the first place.
            Budget view only; Bidding view assumes Trade Type is already
            Biddable. */}
        {!bidding ? (
          <div className="kpi neutral">
            <div className="l">Pending trade-type assignments</div>
            <div className="v">{k.tradeTypePending}</div>
            <div className="s">across {k.tradeTypePendingProjects} projects</div>
          </div>
        ) : null}
        {!bidding ? (
          <button
            type="button"
            className="kpi warn kpi-button"
            onClick={onOpenSyncPanel}
            title="Open sync issue side panel"
          >
            <div className="l">Sync issues <span className="ext-icon" aria-hidden>↗</span></div>
            <div className="v">{k.syncIssues}</div>
            <div className="s">across {k.syncProjects} projects · click to inspect</div>
          </button>
        ) : null}
      </div>

      {/* Budget Outlook portfolio rollup — Estimated → Finalized → New Budget
          summed across every project, mirroring the team's xlsx footer. */}
      <div className="budget-tiles portfolio">
        <div className="bt-tile"><div className="bt-v">{data.budgetOutlook.estimated}</div><div className="bt-l">Estimated <span className="bt-cap">· {tradeCaption}</span></div></div>
        <div className="bt-tile"><div className="bt-v">{data.budgetOutlook.finalized}</div><div className="bt-l">Finalized lowest <span className="bt-cap">· {tradeCaption}</span></div></div>
        <div className="bt-tile primary"><div className="bt-v">{data.budgetOutlook.newBudget}</div><div className="bt-l">New Budget <span className="bt-cap">· {tradeCaption}</span></div></div>
      </div>

      {view === 'pf-matrix'
        ? <PortfolioMatrix data={data} filterStatus={filterStatus} filterTradeType={filterTradeType} filterCost={filterCost} />
        : view === 'pf-gantt'
          ? <PortfolioGantt data={data} />
          : <SubcontractorsView subs={data.subcontractors} listUrl={data.subcontractorsListUrl} />}
    </>
  );
}

function slugifyTrade(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function PortfolioMatrix({
  data, filterStatus, filterTradeType, filterCost,
}: {
  data: UnifiedPortfolio;
  filterStatus: BiddingStatus | 'all';
  filterTradeType: TradeTypeValue | 'all';
  filterCost: 'hard' | 'soft' | 'all';
}) {
  const stale = data.stale;

  // Filter rows by cost + tradeType. Cells get a "dim" treatment for the
  // status filter so the matrix still shows the broader context.
  const filteredRows = useMemo(() => data.matrix.rows.filter((r) => {
    if (filterCost !== 'all' && r.cost !== filterCost) return false;
    if (filterTradeType !== 'all') {
      const hit = r.cells.some((c) => c.tradeType === filterTradeType);
      if (!hit) return false;
    }
    return true;
  }), [data.matrix.rows, filterCost, filterTradeType]);

  const setBannerVisible = filterTradeType === 'Set';

  return (
    <div className="body-wrap">
      <div className="panel-card">
        <div className="h">
          <Icon name="grid-dots" /> Portfolio bidding matrix
          <span className="meta">
            {filteredRows.length} trades × {data.matrix.projects.length} projects · click a project header to drill in
          </span>
        </div>
        {setBannerVisible ? (
          <div className="set-banner">
            <Icon name="external-link" size={13} /> These trades skip bidding — see the project&apos;s Finance list (07. Finance) for cost detail.
          </div>
        ) : null}
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
              {filteredRows.map((r) => (
                <tr key={r.trade}>
                  <td className="trade-name" title={r.trade}>
                    <BudgetStatusDot status={r.budgetStatus} />
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
                    // Gap 4: Set cells render a SET → Finance pill that opens
                    // the Budget task in ClickUp (the Finance list isn't read
                    // by the dashboard but the Budget task carries the
                    // workflow handoff context).
                    if (cell.tradeType === 'Set' && cell.budgetUrl) {
                      return (
                        <td key={ci}>
                          <a
                            href={cell.budgetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="set-cell"
                            title={`SET → Finance · ${proj.name} · ${r.trade}`}
                          >
                            SET<span className="ext-icon" aria-hidden>↗</span>
                          </a>
                        </td>
                      );
                    }
                    if (!cell.code) {
                      return (
                        <td key={ci}>
                          <span
                            className={cell.syncIssues > 0 ? 'sync-cell-warn' : ''}
                            title={cell.syncIssues > 0 ? `${cell.syncIssues} Budget→Bidding sync issue${cell.syncIssues === 1 ? '' : 's'}` : undefined}
                          >
                            —
                          </span>
                        </td>
                      );
                    }
                    const href = `/project/${encodeURIComponent(proj.folderId)}?trade=${encodeURIComponent(r.trade)}#trade-row-${slugifyTrade(r.trade)}`;
                    const dim = filterStatus !== 'all' && cell.name !== filterStatus;
                    return (
                      <td key={ci}>
                        <a
                          href={href}
                          className={`cell-link${dim ? ' dim' : ''}`}
                          title={`Open ${proj.name} · ${r.trade} (${cell.name ?? cell.code})`}
                        >
                          <span className={`bb-cell-pill ${cell.code.toLowerCase()}`}>{cell.code}</span>
                          {cell.syncIssues > 0 ? <span className="sync-dot" aria-label={`${cell.syncIssues} sync issues`} /> : null}
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
        <div className="legend" style={{ marginTop: 8 }}>
          {(Object.keys(BUDGET_STATUS_LABEL) as BudgetStatusCode[]).map((k) => (
            <span key={k} className="sw">
              <span className="bs-dot" style={{ background: BUDGET_STATUS_COLOR[k], boxShadow: k === 'BC' ? '0 0 0 1.5px #fff, 0 0 0 2.5px #30a46c' : 'none' }} />
              {BUDGET_STATUS_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <LevelingPanel entries={data.leveling} />
        <div style={{ height: 18 }} />
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
  project, mode, view, onChange, initialTrade,
}: { project: UnifiedProject; mode: 'budget' | 'bidding'; view: ProjectView; onChange: (v: View) => void; initialTrade: string | null }) {
  const bidding = mode === 'bidding';
  // Bidding view with no Biddable trades — render an empty state instead of
  // an empty matrix. (Section 6 of the view-split brief.)
  if (bidding && project.ptTrades.length === 0) {
    return (
      <>
        <div className="crumb">
          <a href="/?view=bidding">← Budget &amp; Bidding</a>
          <Icon name="chevron-right" />
          <span>{project.folderName}</span>
        </div>
        <div className="empty-state">
          <Icon name="gavel" size={26} />
          <h2>No biddable trades on this project yet</h2>
          <p>
            Set Trade Type to <strong>Biddable</strong> on the{' '}
            <a href={`/project/${encodeURIComponent(project.folderId)}?view=budget`}>Budget Dashboard</a>{' '}
            to populate this view.
          </p>
        </div>
      </>
    );
  }
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
        <div className="cell"><div className="l">{bidding ? 'Biddable trades' : 'Trades'}</div><div className="v">{project.summary.trades}</div></div>
        <div className="cell good"><div className="l">Awarded</div><div className="v">{project.summary.awarded}</div></div>
        <div className="cell warn"><div className="l">In bidding</div><div className="v">{project.summary.bidding}</div></div>
        {/* Set + Sync-issues cells are operational/Budget-only — irrelevant
            once the view is scoped to Biddable trades. */}
        {!bidding ? <div className="cell muted"><div className="l">Set</div><div className="v">{project.summary.set}</div></div> : null}
        {!bidding ? <div className="cell warn"><div className="l">Sync issues</div><div className="v">{project.summary.syncIssues}</div></div> : null}
      </div>
      {/* Budget Outlook three-number progression — mirrors the team's
          SharePoint xlsx (Estimated → Finalized lowest → New Budget). */}
      <div className="budget-tiles">
        <div className="bt-tile"><div className="bt-v">{project.summary.estimatedTotal}</div><div className="bt-l">Estimated <span className="bt-cap">· {project.summary.trades} {bidding ? 'biddable trades' : 'trades'}</span></div></div>
        <div className="bt-tile"><div className="bt-v">{project.summary.finalizedTotal}</div><div className="bt-l">Finalized lowest <span className="bt-cap">· {project.summary.trades} {bidding ? 'biddable trades' : 'trades'}</span></div></div>
        <div className="bt-tile primary"><div className="bt-v">{project.summary.newBudgetTotal}</div><div className="bt-l">New Budget <span className="bt-cap">· {project.summary.trades} {bidding ? 'biddable trades' : 'trades'}</span></div></div>
      </div>

      <div className="project-subtabs">
        <button type="button" className={view === 'pj-timeline' ? 'active' : ''} onClick={() => onChange('pj-timeline')}>
          <Icon name="list-check" />Timeline
        </button>
        <button type="button" className={view === 'pj-matrix' ? 'active' : ''} onClick={() => onChange('pj-matrix')}>
          <Icon name="table" />Per-trade matrix
        </button>
      </div>

      {view === 'pj-timeline'
        ? <ProjectTimeline project={project} mode={mode} />
        : <ProjectMatrix project={project} mode={mode} initialTrade={initialTrade} />}
    </>
  );
}

function ProjectTimeline({ project, mode }: { project: UnifiedProject; mode: 'budget' | 'bidding' }) {
  const bidding = mode === 'bidding';
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
        {/* Bids in flight — Bidding view only. */}
        {bidding ? (
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
        ) : null}
        {/* Cost-type rollup — budget composition; Budget view only. */}
        {!bidding ? (
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
        ) : null}
      </aside>
    </div>
  );
}

function ProjectMatrix({ project, mode, initialTrade }: { project: UnifiedProject; mode: 'budget' | 'bidding'; initialTrade: string | null }) {
  const bidding = mode === 'bidding';
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
            <col className="c-money" /><col className="c-money" /><col className="c-money" /><col className="c-delta" /><col className="c-toggle" />
          </colgroup>
          <thead>
            <tr>
              <th>Trade</th>
              <th>Sub 1</th><th>Sub 2</th><th>Sub 3</th><th>Sub 4</th>
              {bidding ? (
                <>
                  <th className="r">Bidding Status</th>
                  <th className="r">Bid Amount</th>
                  <th className="r">RFP Sent</th>
                  <th className="r">Days since update</th>
                </>
              ) : (
                <>
                  <th className="r">Estimated</th>
                  <th className="r">Finalized Lowest</th>
                  <th className="r">New Budget</th>
                  <th className="r">Δ vs Estimate</th>
                </>
              )}
              <th className="c" />
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
                    <BudgetStatusDot status={t.budgetStatus} />
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
                    {t.tradeType === 'Set' ? (
                      <a
                        className="set-chip ext"
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Trade Type = Set · routed to Finance (07. Finance)"
                        onClick={(e) => e.stopPropagation()}
                      >
                        SET → Finance<span className="ext-icon" aria-hidden>↗</span>
                      </a>
                    ) : null}
                    {t.syncStatus !== 'ok' ? (
                      <span className={`sync-badge ${t.syncStatus}`} title={t.syncIssues.join(' ')}>
                        {t.syncIssues.length}
                      </span>
                    ) : null}
                    <div className="sub-meta">
                      {t.tag} · {t.stage} · sync {t.actualBiddingCount}/{t.expectedBiddingCount}
                    </div>
                  </td>
                  <td className="bid-cell"><BidCard bid={t.subs[0]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[1]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[2]} /></td>
                  <td className="bid-cell"><BidCard bid={t.subs[3]} /></td>
                  {bidding ? (
                    <>
                      <td className="td-money">
                        {t.biddingStatusCode ? (
                          <span className={`bb-cell-pill ${t.biddingStatusCode.toLowerCase()}`}>{t.biddingStatusCode}</span>
                        ) : '—'}
                        <span className="sub-label">{t.biddingStatusName ?? 'not started'}</span>
                      </td>
                      <td className="td-money">{t.finalizedLowest == null ? '—' : fmtShort(t.finalizedLowest)}<span className="sub-label">lowest bid</span></td>
                      <td className="td-money">{t.rfpSentDate}<span className="sub-label">RFP sent</span></td>
                      <td className="td-money">{t.daysSinceUpdate == null ? '—' : `${t.daysSinceUpdate}d`}<span className="sub-label">since update</span></td>
                    </>
                  ) : (
                    <>
                      <td className="td-money">{t.estimated == null ? '—' : fmtShort(t.estimated)}<span className="sub-label">estimated</span></td>
                      <td className="td-money">{t.finalizedLowest == null ? '—' : fmtShort(t.finalizedLowest)}<span className="sub-label">finalized lowest</span></td>
                      <td className="td-money strong">{t.newBudget == null ? '—' : fmtShort(t.newBudget)}<span className="sub-label">new budget</span></td>
                      <td className="td-delta"><BudgetDeltaCell newBudgetVal={t.newBudget} estimated={t.estimated} /></td>
                    </>
                  )}
                  <td className="td-toggle">
                    <button type="button" aria-label="expand" onClick={(e) => { e.stopPropagation(); toggle(i); }}>
                      <Icon name="chevron-right" />
                    </button>
                  </td>
                </tr>
                {expanded.has(i) ? (
                  <tr className="expand-row">
                    <td colSpan={10}>
                      <div className="expand-content">
                        <div className="h">
                          <Icon name="timeline" /> Bidding-stage timeline · {t.name}
                          <span className="meta">{t.subs.filter(Boolean).length} subs · stage = {t.stage}</span>
                        </div>
                        <MiniGantt trade={t} />
                        {t.syncIssues.length > 0 ? (
                          <div className="sync-issues">
                            {t.syncIssues.map((issue) => <div key={issue}>{issue}</div>)}
                          </div>
                        ) : null}
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
  // Gap 11: paper-clip linking to the OneDrive proposal folder. Show the icon
  // on Bid Received / Awarded cells; faded when the Link field is empty.
  const showProposal = bid.status === 'BR' || bid.status === 'AW' || bid.status === 'LV' || bid.status === 'LP';
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
        {showProposal ? (
          bid.proposalUrl ? (
            // Rendered as a button (not an <a>) so we don't nest an anchor
            // inside the outer bid-card <a>. The click pre-empts the parent
            // and opens the proposal URL in a new tab.
            <button
              type="button"
              className="proposal-link"
              title="Open OneDrive proposal folder (new tab)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window !== 'undefined') {
                  window.open(bid.proposalUrl as string, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <Icon name="paperclip" size={12} />
            </button>
          ) : (
            <span
              className="proposal-link empty"
              title="No proposal uploaded yet"
              aria-label="No proposal uploaded yet"
            >
              <Icon name="paperclip" size={12} />
            </span>
          )
        ) : null}
      </div>
    </a>
  );
}

// Δ vs Estimate — New Budget measured against the planning Estimate.
// New < Estimate → under budget (green `−$X`); New > Estimate → over
// budget (red `+$X`); within ±5% → neutral. `—` when either side is unknown.
function BudgetDeltaCell({ newBudgetVal, estimated }: { newBudgetVal: number | null; estimated: number | null }) {
  if (newBudgetVal == null || estimated == null || estimated === 0) {
    return <div className="delta zero">—</div>;
  }
  const diff = newBudgetVal - estimated;
  const pct = diff / estimated * 100;
  if (Math.abs(pct) < 0.5) return <div className="delta zero">±0</div>;
  const within5 = Math.abs(pct) <= 5;
  const cls = within5 ? 'delta neutral' : diff < 0 ? 'delta pos' : 'delta neg';
  if (diff < 0) {
    return (
      <div className={cls}>−{fmtShort(-diff)}<br />
        <span style={{ fontSize: 9, opacity: 0.85 }}>{(-pct).toFixed(1)}% under</span>
      </div>
    );
  }
  return (
    <div className={cls}>+{fmtShort(diff)}<br />
      <span style={{ fontSize: 9, opacity: 0.85 }}>{pct.toFixed(1)}% over</span>
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
// Budget status dot (Gap 5) — small colored marker rendered to the left of
// the H/S indicator. Shows where the parent Budget task sits in its own
// workflow ("to budget" → "Open for Bidding" → "Budget Set" → "Bid List
// Confirmed"). On rollup rows (portfolio matrix) it shows the most-advanced
// status seen across that trade's project columns.
// ----------------------------------------------------------------------------

function BudgetStatusDot({ status }: { status: BudgetStatusCode | null }) {
  if (!status) {
    return (
      <span
        className="bs-dot"
        style={{ background: 'transparent', border: '1px dashed var(--color-border-secondary)' }}
        title="Budget status — not set"
      />
    );
  }
  const isConfirmed = status === 'BC';
  const style: CSSProperties = {
    background: BUDGET_STATUS_COLOR[status],
  };
  if (isConfirmed) {
    style.boxShadow = '0 0 0 1.5px var(--color-background-secondary), 0 0 0 2.5px #30a46c';
  }
  return (
    <span className="bs-dot" style={style} title={`Budget status — ${BUDGET_STATUS_LABEL[status]}`} />
  );
}

// ----------------------------------------------------------------------------
// Leveling panel (Gap 6)
// ----------------------------------------------------------------------------

function LevelingPanel({ entries }: { entries: LevelingEntry[] }) {
  return (
    <>
      <div className="h">
        <Icon name="balance" /> In leveling
        <span className="meta">{entries.length} trade{entries.length === 1 ? '' : 's'} · Luis Núñez owns the comparison sheet</span>
      </div>
      <div className="perm-list">
        {entries.length === 0 ? (
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12, padding: 10 }}>
            No trades in leveling right now.
          </div>
        ) : entries.map((e) => (
          <a
            key={`${e.projectFolderId}-${e.trade}`}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`row${e.pendingReview ? ' critical' : ''}`}
            title={`Open ${e.trade} bidding list (new tab)`}
          >
            <div className="when">
              <div className="d">{e.daysSinceFirstBid ?? '?'}</div>
              <div className="mo">days</div>
            </div>
            <div className="info">
              <div className="trade">{e.trade}<span className="ext-icon" aria-hidden>↗</span></div>
              <div className="name">{e.subCount} sub{e.subCount === 1 ? '' : 's'} leveled</div>
              <div className="proj">{e.project}</div>
            </div>
            <span className="countdown">{e.pendingReview ? 'pending review' : 'leveling'}</span>
          </a>
        ))}
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Subcontractors view (Gap 8)
// ----------------------------------------------------------------------------

function SubcontractorsView({ subs, listUrl }: { subs: SubcontractorStats[]; listUrl: string }) {
  return (
    <div className="subs-card">
      <div className="h">
        <Icon name="users" /> Subcontractors
        <span className="meta">
          {subs.length} subs · sorted by active RFPs · {' '}
          <a href={listUrl} target="_blank" rel="noopener noreferrer">Open master list ↗</a>
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="subs-table">
          <thead>
            <tr>
              <th>Subcontractor</th>
              <th>Trades</th>
              <th className="r">Active RFPs</th>
              <th className="r">Total bids</th>
              <th className="r">Awarded</th>
              <th className="r">Win rate</th>
              <th className="r">Avg bid</th>
              <th className="r">Median response</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.name}>
                <td>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="ext">
                    {s.name}<span className="ext-icon" aria-hidden>↗</span>
                  </a>
                </td>
                <td className="trades-cell" title={s.trades.join(', ')}>
                  {s.trades.length === 0 ? '—' : s.trades.slice(0, 3).join(', ') + (s.trades.length > 3 ? ` +${s.trades.length - 3}` : '')}
                </td>
                <td className="r">{s.activeRfps}</td>
                <td className="r">{s.totalBids}</td>
                <td className="r">{s.awardedCount}</td>
                <td className="r">{s.winRatePct}%</td>
                <td className="r">{s.avgBidAmount == null ? '—' : fmtShort(s.avgBidAmount)}</td>
                <td className="r">{s.medianResponseDays == null ? '—' : `${s.medianResponseDays}d`}</td>
              </tr>
            ))}
            {subs.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12 }}>No subcontractor activity yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sync issues side panel (Gap 7)
// ----------------------------------------------------------------------------

function SyncIssuesPanel({ rows, onClose }: { rows: SyncIssueRow[]; onClose: () => void }) {
  const grouped = useMemo(() => {
    const byCat = new Map<string, SyncIssueRow[]>();
    for (const r of rows) {
      const arr = byCat.get(r.categoryLabel) ?? [];
      arr.push(r);
      byCat.set(r.categoryLabel, arr);
    }
    return Array.from(byCat.entries());
  }, [rows]);
  return (
    <div className="side-panel-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="side-panel-h">
          <div>
            <h2>Sync issues</h2>
            <p>{rows.length} across {new Set(rows.map((r) => r.projectFolderId)).size} project{new Set(rows.map((r) => r.projectFolderId)).size === 1 ? '' : 's'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="side-panel-body">
          {grouped.length === 0 ? (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>No sync issues 🎉</p>
          ) : grouped.map(([label, list]) => (
            <section key={label}>
              <h3>{label} <span className="n">{list.length}</span></h3>
              <ul>
                {list.map((r, i) => (
                  <li key={`${r.code}-${r.projectFolderId}-${r.trade ?? ''}-${i}`}>
                    <div className="proj">{r.project}{r.trade ? <> · <span className="trade">{r.trade}</span></> : null}</div>
                    <div className="msg">{r.message}</div>
                    <a href={r.fixUrl} target="_blank" rel="noopener noreferrer" className="fix">Fix in ClickUp ↗</a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
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
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M21 19c0-2.5-2-4.5-4.5-4.5" /></>),
  balance: (<><path d="M12 3v18" /><path d="M5 21h14" /><path d="M6 8l-3 6h6z" /><path d="M18 8l-3 6h6z" /><path d="M3 8h18" /></>),
  paperclip: (<><path d="M21 12.79l-9.19 9.19a5 5 0 1 1-7.07-7.07L13.5 6.16a3.5 3.5 0 0 1 4.95 4.95L9.99 19.58a2 2 0 1 1-2.83-2.83l8.05-8.05" /></>),
};
