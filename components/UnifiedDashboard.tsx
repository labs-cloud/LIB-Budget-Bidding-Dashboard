'use client';

import { useEffect, useMemo, useState } from 'react';
import '@/styles/unified.css';
import {
  BRADY_IN_FLIGHT,
  BRADY_TIMELINE,
  GANTT_AXIS_TICKS,
  GANTT_GROUPS,
  GANTT_TODAY_PCT,
  MATRIX,
  MG_TODAY_PCT,
  PROJECTS,
  PT_TRADES,
  STALE_BIDS,
  STATUSES,
  STATUS_COLORS,
  STATUS_PILL_FOR_TIMELINE,
  TRADES,
  dayPct,
  fmtShort,
  type PtTrade,
  type PtSub,
  type StatusCode,
} from '@/lib/unifiedDemoData';

type PortfolioView = 'pf-matrix' | 'pf-gantt';
type ProjectView = 'pj-timeline' | 'pj-matrix';
type View = PortfolioView | ProjectView;

const PORTFOLIO_VIEWS: PortfolioView[] = ['pf-matrix', 'pf-gantt'];
const PROJECT_VIEWS: ProjectView[] = ['pj-timeline', 'pj-matrix'];

function isProjectView(v: View): v is ProjectView {
  return (PROJECT_VIEWS as readonly View[]).includes(v);
}

export function UnifiedDashboard({ embed = false }: { embed?: boolean }) {
  const [view, setView] = useState<View>('pf-matrix');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Sync theme from <html data-theme> + persist.
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('bb-theme')) as
      | 'light' | 'dark' | null;
    const initial = stored ?? 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  // Read initial view from URL hash.
  useEffect(() => {
    const h = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    if (PORTFOLIO_VIEWS.includes(h as PortfolioView) || PROJECT_VIEWS.includes(h as ProjectView)) {
      setView(h as View);
    }
  }, []);

  // Push hash on view change.
  useEffect(() => {
    try { window.history.replaceState(null, '', '#' + view); } catch { /* ignore */ }
  }, [view]);

  const inProject = isProjectView(view);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bb-theme', next); } catch { /* ignore */ }
  }

  return (
    <div className={`unified-app${embed ? ' embed' : ''}`}>
      <div className="frame">
        <Hero inProject={inProject} theme={theme} onToggleTheme={toggleTheme} />

        {!inProject ? (
          <div className="filter-row">
            <input type="search" placeholder="Search projects, trades, subs…" />
            <select defaultValue="">
              <option value="">All coordinators</option>
              <option>Sol Klein</option>
              <option>Malky Kahan</option>
              <option>Faigy Fellman</option>
            </select>
            <select defaultValue="">
              <option value="">All phases</option>
              <option>Pre-construction</option>
              <option>Bidding</option>
              <option>Construction</option>
            </select>
            <select defaultValue="">
              <option value="">All cost types</option>
              <option>Hard cost</option>
              <option>Soft cost</option>
            </select>
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
          <PortfolioShell view={view as PortfolioView} onOpenBrady={() => setView('pj-timeline')} />
        ) : (
          <ProjectShell view={view as ProjectView} onChange={setView} onBack={() => setView('pf-matrix')} />
        )}

        <div className="bb-footer">Source: ClickUp B&amp;B SOP</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hero
// ----------------------------------------------------------------------------

function Hero({
  inProject,
  theme,
  onToggleTheme,
}: { inProject: boolean; theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const title = inProject ? '800 Brady Ave' : 'Budget Dashboard';
  const meta = inProject
    ? <><b>14 trades</b> · 8 awarded · 4 bidding · 2 set · Updated budget $13.86M</>
    : <><b>87 bids in flight</b> across 10 active projects · live from ClickUp · Stale · 42m ago</>;

  return (
    <div className="lib-hero">
      <div className="logo-box">
        <LibLogo />
      </div>
      <div>
        <h1>{title}</h1>
        <div className="meta">{meta}</div>
      </div>
      <div className="lib-hero-right">
        <button className="dash-pill" type="button">
          <Icon name="layout-dashboard" /> Budget dashboard
        </button>
        <button className="iconbtn" type="button" title="Refresh"><Icon name="refresh" /></button>
        <button className="iconbtn" type="button" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Icon name="sun" /> : <Icon name="moon" />}
        </button>
        <span className="status-pill">Stale</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Portfolio shell — KPI strip + Matrix or Gantt view
// ----------------------------------------------------------------------------

function PortfolioShell({ view, onOpenBrady }: { view: PortfolioView; onOpenBrady: () => void }) {
  return (
    <>
      <div className="kpis">
        <div className="kpi info"><div className="l">Bids in flight</div><div className="v">87</div><div className="s">+6 w/w</div></div>
        <div className="kpi warn"><div className="l">Awaiting follow-up</div><div className="v">12</div><div className="s">3 stale</div></div>
        <div className="kpi good"><div className="l">Ready to award</div><div className="v">8</div><div className="s">+2 this wk</div></div>
        <div className="kpi neutral"><div className="l">Trade Type pending</div><div className="v">23</div><div className="s">across 6 projects</div></div>
      </div>

      {view === 'pf-matrix' ? <PortfolioMatrix onOpenBrady={onOpenBrady} /> : <PortfolioGantt />}
    </>
  );
}

function PortfolioMatrix({ onOpenBrady }: { onOpenBrady: () => void }) {
  const distribution = useMemo(() => {
    const counts: Partial<Record<StatusCode, number>> = {};
    for (const row of MATRIX) for (const c of row) counts[c] = (counts[c] ?? 0) + 1;
    return { counts, total: MATRIX.length * (MATRIX[0]?.length ?? 0) };
  }, []);
  const ORDER: StatusCode[] = ['AW','LP','LV','BR','FU','RS','NS','NR','ND'];

  return (
    <div className="body-wrap">
      <div className="panel-card">
        <div className="h">
          <Icon name="grid-dots" /> Portfolio bidding matrix
          <span className="meta">
            14 trades × 10 projects · click{' '}
            <a onClick={onOpenBrady} href="#pj-timeline">Brady</a> column to drill in
          </span>
        </div>
        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th className="col-trade">Trade</th>
                {PROJECTS.map((p) => (
                  <th
                    key={p}
                    className={`col-proj${p === 'Brady' ? ' is-brady' : ''}`}
                    onClick={p === 'Brady' ? onOpenBrady : undefined}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRADES.map((t, ti) => (
                <tr key={t.name}>
                  <td className="trade-name" title={t.name}>
                    <span className={`ctag ${t.cost}`}>{t.cost === 'hard' ? 'H' : 'S'}</span>
                    {t.name}
                  </td>
                  {MATRIX[ti].map((code, ci) => (
                    <td key={ci}>
                      <span className={`bb-cell-pill ${code.toLowerCase()}`} title={STATUSES[code].name}>{code}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          {(Object.keys(STATUSES) as StatusCode[]).map((k) => (
            <span key={k} className="sw">
              <span className={`bb-cell-pill ${k.toLowerCase()}`}>{k}</span>
              {STATUSES[k].name}
            </span>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="h">
          <Icon name="clock-exclamation" /> Awaiting follow-up
          <span className="meta">5 stale · sorted by days since RFP</span>
        </div>
        <div className="perm-list">
          {STALE_BIDS.map((b) => {
            const crit = b.days >= 12;
            return (
              <a key={b.sub} href="#" className={`row${crit ? ' critical' : ''}`}>
                <div className="when">
                  <div className="d">{b.days}</div>
                  <div className="mo">days</div>
                </div>
                <div className="info">
                  <div className="trade">{b.trade}</div>
                  <div className="name">{b.sub}</div>
                  <div className="proj">{b.project} · RFP {b.rfp}</div>
                </div>
                <span className="countdown">{crit ? 'overdue' : 'stale'}</span>
              </a>
            );
          })}
        </div>
        <div style={{ height: 18 }} />
        <div className="h" style={{ marginTop: 4 }}>
          <Icon name="chart-pie" /> Status distribution
          <span className="meta">{distribution.total} cells</span>
        </div>
        <div className="stat-bar">
          {ORDER.map((k) => {
            const n = distribution.counts[k] ?? 0;
            if (!n) return null;
            return (
              <div
                key={k}
                className="seg"
                style={{ width: `${(n / distribution.total * 100).toFixed(2)}%`, background: STATUS_COLORS[k] }}
                title={`${STATUSES[k].name}: ${n}`}
              />
            );
          })}
        </div>
        <div className="stat-legend">
          {ORDER.map((k) => {
            const n = distribution.counts[k] ?? 0;
            if (!n) return null;
            return (
              <div key={k} className="row">
                <span className="dot" style={{ background: STATUS_COLORS[k] }} />
                {STATUSES[k].name}
                <span className="n">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PortfolioGantt() {
  return (
    <div className="gantt-card">
      <div className="h">
        <Icon name="timeline" /> Bid lifecycle timeline
        <span className="meta">RFP sent → awarded · 14 trades · grouped by Cost Type</span>
      </div>
      <div className="gantt">
        <div />
        <div className="ax-track">
          {GANTT_AXIS_TICKS.map((t) => (
            <span key={t.label} className={`ax-tick${t.today ? ' today' : ''}`} style={{ left: `${t.left}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <div />

        {GANTT_GROUPS.map((g) => (
          <FragmentBlock key={g.label}>
            <div className="group-divider">
              <span className={`tag ${g.cost}`}>{g.label}</span>
              <span className="line" />
              <span className="count">{g.count}</span>
            </div>
            {g.rows.map((r) => (
              <FragmentBlock key={r.name}>
                <div className="tr-label">
                  <span className="tag">{r.tagShort}</span>
                  <span className="name">{r.name}</span>
                </div>
                <div className="tr-track">
                  <div className="today-line" style={{ left: `${GANTT_TODAY_PCT}%` }} />
                  <div className={`tr-bar ${r.barKind}`} style={{ left: `${r.left}%`, width: `${r.width}%` }}>
                    {Array.from({ length: r.pips }).map((_, i) => <span key={i} className="pip" />)}
                    {r.span}
                    <span className="marker-end" />
                  </div>
                </div>
                <div className="tr-chip">
                  <span className={`pill ${r.pillKind}`}>{r.pillText}</span>
                  <span className="sub">{r.sub}</span>
                </div>
              </FragmentBlock>
            ))}
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

// ----------------------------------------------------------------------------
// Project shell — Brady drill-in (Timeline + Per-trade matrix)
// ----------------------------------------------------------------------------

function ProjectShell({
  view, onChange, onBack,
}: { view: ProjectView; onChange: (v: View) => void; onBack: () => void }) {
  return (
    <>
      <div className="crumb">
        <a onClick={onBack} href="#pf-matrix">← Budget &amp; Bidding</a>
        <Icon name="chevron-right" />
        <a onClick={onBack} href="#pf-matrix">Portfolio</a>
        <Icon name="chevron-right" />
        <span>800 Brady Ave</span>
      </div>

      <header className="header-grid">
        <div>
          <h1 className="h-title">800 Brady Ave</h1>
          <div className="h-meta">
            <span className="chip"><span className="avatar avatar-sol">SK</span>Sol Klein</span>
            <span className="phase"><Icon name="gavel" size={13} />Bidding</span>
            <span><Icon name="map-pin" size={13} /> Bronx, NY</span>
            <span><Icon name="id" size={13} /> 800-BRDY-2025</span>
          </div>
        </div>
        <div className="h-actions">
          <button className="btn" type="button"><Icon name="folder" size={14} /> ClickUp folder</button>
          <button className="btn primary" type="button"><Icon name="external-link" size={14} /> Open in ClickUp</button>
        </div>
      </header>

      <div className="summary">
        <div className="cell"><div className="l">Trades</div><div className="v">14</div></div>
        <div className="cell good"><div className="l">Awarded</div><div className="v">8</div></div>
        <div className="cell warn"><div className="l">In bidding</div><div className="v">4</div></div>
        <div className="cell muted"><div className="l">Set</div><div className="v">2</div></div>
        <div className="cell money"><div className="l">Updated budget</div><div className="v">$13.86<span className="unit">M</span></div></div>
      </div>

      <div className="project-subtabs">
        <button type="button" className={view === 'pj-timeline' ? 'active' : ''} onClick={() => onChange('pj-timeline')}>
          <Icon name="list-check" />Timeline
        </button>
        <button type="button" className={view === 'pj-matrix' ? 'active' : ''} onClick={() => onChange('pj-matrix')}>
          <Icon name="table" />Per-trade matrix
        </button>
      </div>

      {view === 'pj-timeline' ? <ProjectTimeline /> : <ProjectMatrix />}
    </>
  );
}

function ProjectTimeline() {
  return (
    <div className="layout">
      <div className="timeline">
        {BRADY_TIMELINE.map((g) => (
          <FragmentBlock key={g.label}>
            <div className={`group-h ${g.group}`}>
              {g.label}<span className="count">{g.sub}</span>
            </div>
            {g.rows.map((r) => {
              const [pillCls, pillCode, pillName] = STATUS_PILL_FOR_TIMELINE[r.stat];
              const amountLabel =
                r.stat === 'set' ? 'Amount' : r.stat === 'lv' ? 'Lowest' : 'Bid';
              return (
                <div key={r.name} className={`tl-row ${r.stat}`}>
                  <div className={`tl-date${r.warn ? ' warn' : ''}`}>{r.date}</div>
                  <div className={`tl-card ${r.stat}`}>
                    <div className="top">
                      <span className="col-tag">{r.tag}</span>
                      <span className="name">{r.name}</span>
                      <span className={`bb-pill ${pillCls}`}>
                        <span className="code">{pillCode}</span>{pillName}
                      </span>
                    </div>
                    <div className="meta">
                      <span className="sub-name">{r.sub}</span>
                      {r.amt ? (
                        <span><span className="label">{amountLabel}</span> <span className="amt">{r.amt}</span></span>
                      ) : null}
                      <span><span className="label">Allocated</span> {r.alloc}</span>
                      {r.rfp ? <span><span className="label">RFP</span> {r.rfp}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </FragmentBlock>
        ))}
      </div>

      <aside className="side">
        <div className="panel">
          <h3>Bids in flight <span className="count">{BRADY_IN_FLIGHT.length}</span></h3>
          {BRADY_IN_FLIGHT.map((b) => (
            <div key={b.sub} className={`bif-card${b.crit ? ' critical' : ''}`}>
              <div className="top">
                <div>
                  <div className="trade-tag">{b.trade}</div>
                  <div className="sub">{b.sub}</div>
                </div>
                <span className="countdown">{b.days}</span>
              </div>
              <div className="meta">{b.meta}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Cost-type rollup</h3>
          <div className="chain-row">
            <span className="role">
              <span className="bb-pill" style={{ background: 'var(--bb-hard-bg)', color: 'var(--bb-hard)', fontSize: 10, letterSpacing: '0.05em', padding: '1px 6px' }}>HARD</span>{' '}
              11 trades
            </span>
            <span className="who">$13.32M</span>
          </div>
          <div className="chain-row">
            <span className="role">
              <span className="bb-pill" style={{ background: 'var(--bb-soft-bg)', color: 'var(--bb-soft)', fontSize: 10, letterSpacing: '0.05em', padding: '1px 6px' }}>SOFT</span>{' '}
              3 trades
            </span>
            <span className="who">$0.54M</span>
          </div>
          <div className="chain-row" style={{ borderTop: '0.5px solid var(--color-border-secondary)', paddingTop: 10, marginTop: 4 }}>
            <span className="role" style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>Updated budget</span>
            <span className="who" style={{ color: 'var(--good-strong)', fontSize: 14 }}>$13.86M</span>
          </div>
          <div className="chain-row"><span className="role">Allocated</span><span className="who">$14.18M</span></div>
          <div className="chain-row">
            <span className="role">Variance</span>
            <span className="who" style={{ color: 'var(--good-fg)' }}>−$320k (2.3%)</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectMatrix() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="table-card">
      <div className="h">
        <Icon name="table" /> Per-trade bid matrix
        <span className="meta">14 trades × up to 4 subs · LOW = lowest non-rejected bid · click any row to expand the stage Gantt</span>
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
            {PT_TRADES.map((t, i) => (
              <FragmentBlock key={t.name}>
                <tr className={`trade-row${expanded.has(i) ? ' expanded' : ''}`} onClick={() => toggle(i)}>
                  <td className="td-trade">
                    <span className={`ctag ${t.cost}`}>{t.cost === 'hard' ? 'H' : 'S'}</span>
                    <span className="name">{t.name}</span>
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
            ))}
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
    <div className={cls} title={`${bid.name} · ${STATUSES[bid.status].name}`}>
      <div className="sub-name">{bid.name}</div>
      <div className="row2">
        <span className={`bb-pill ${bid.status.toLowerCase()}`}>
          <span className="code">{bid.status}</span>
        </span>
        {bid.amount == null
          ? <span className="amt dim">awaiting</span>
          : <span className="amt">{fmtShort(bid.amount)}</span>}
      </div>
    </div>
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

function MiniGantt({ trade }: { trade: PtTrade }) {
  const subs = trade.subs.filter(Boolean) as PtSub[];
  return (
    <div className="mini-gantt">
      <div className="mg-row">
        <div />
        <div className="mg-axis">
          <span className="tick" style={{ left: '0%' }}>Mar 1</span>
          <span className="tick" style={{ left: '18.75%' }}>Mar 15</span>
          <span className="tick" style={{ left: '38.75%' }}>Apr 1</span>
          <span className="tick" style={{ left: '56.25%' }}>Apr 15</span>
          <span className="tick" style={{ left: '76.25%' }}>May 1</span>
          <span className="tick today" style={{ left: `${MG_TODAY_PCT.toFixed(1)}%` }}>Today</span>
        </div>
        <div />
      </div>
      {subs.map((s) => {
        const start = dayPct(s.rfp);
        const end = dayPct(s.last);
        const endP = end ?? MG_TODAY_PCT;
        const startP = start ?? 0;
        const span = Math.max(2, endP - startP);
        const isAwarded = s.status === 'AW';
        const isDeclined = s.status === 'ND';
        const isSet = !!s.rfp && s.rfp.startsWith('— set');
        const barClass = isAwarded ? 'awarded' : isDeclined ? 'declined' : 'in-flight';
        return (
          <div className="mg-row" key={s.name}>
            <div className="sub-label">
              {s.name}
              <span className="sub-meta">RFP {s.rfp} · last activity {s.last}</span>
            </div>
            <div className="mg-track">
              <div className="today-line" style={{ left: `${MG_TODAY_PCT.toFixed(1)}%` }} />
              {isSet ? (
                <div className="mg-bar awarded" style={{ left: `${(MG_TODAY_PCT - 2).toFixed(1)}%`, width: '4%' }}>SET</div>
              ) : (
                <div className={`mg-bar ${barClass}`} style={{ left: `${startP.toFixed(1)}%`, width: `${span.toFixed(1)}%` }}>
                  {s.rfp} → {s.last}
                </div>
              )}
              {start != null ? (
                <div className="mg-stage rs" style={{ left: `${startP.toFixed(1)}%` }} title={`RFP Sent · ${s.rfp}`} />
              ) : null}
              {end != null && end !== start && !isSet ? (
                <div
                  className={`mg-stage ${isAwarded ? 'aw' : isDeclined ? 'nd' : s.status.toLowerCase()}`}
                  style={{ left: `${endP.toFixed(1)}%` }}
                  title={`${STATUSES[s.status].name} · ${s.last}`}
                />
              ) : null}
            </div>
            <div className="chip">
              {s.amount != null
                ? <><strong>{fmtShort(s.amount)}</strong> · {STATUSES[s.status].name}</>
                : STATUSES[s.status].name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tiny helpers
// ----------------------------------------------------------------------------

function FragmentBlock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function LibLogo() {
  // Inline mark — the design's PNG isn't shipped with the dashboard.
  return (
    <svg className="lib-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Lead It Builders">
      <rect x="6" y="6" width="88" height="88" rx="14" fill="var(--lib-orange)" />
      <text
        x="50" y="62" textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro', Inter, sans-serif"
        fontSize="34" fontWeight={700} fill="#fff" letterSpacing="-0.02em"
      >LIB</text>
    </svg>
  );
}

// Tabler-icon as a tiny inline SVG renderer (avoids the CDN font dependency).
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
