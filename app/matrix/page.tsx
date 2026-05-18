import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';
import { EmbedClass } from '@/components/EmbedClass';
import { MatrixDesignPicker } from '@/components/MatrixDesignPicker';
import { loadPortfolio } from '@/lib/data';
import { buildPortfolioMatrix } from '@/lib/matrix';
import {
  BOARD_COLUMNS,
  buildBoard,
  buildMatrixData,
  groupRollup,
  STATUS_PILL,
  type MatrixCell,
  type MatrixData,
  type MatrixProject,
  type TradeGroup,
} from '@/lib/matrixView';
import { tradeKey } from '@/lib/clickup/client';
import type { BiddingStatus } from '@/lib/clickup/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: { embed?: string };
}

export default async function MatrixPage({ searchParams }: PageProps) {
  const embed = searchParams?.embed === '1';
  const data = await loadPortfolio();
  const matrixData = buildMatrixData(data.snapshots);
  const portfolio = buildPortfolioMatrix(data.snapshots);
  const refreshedSec = Math.floor((Date.now() - data.refreshedAt) / 1000);
  const board = buildBoard(matrixData);

  return (
    <main style={{ padding: embed ? 0 : 32 }}>
      <EmbedClass embed={embed} />
      <RefreshOnFocus />
      <div className="frame matrix-frame">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
              Budget &amp; Bidding · Matrix
            </h2>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              {matrixData.projects.length} active projects ·{' '}
              {data.source === 'live' ? 'live from ClickUp' : 'mock data'} · refreshed {refreshedSec}s ago
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="matrix-toptabs">
              <Link href="/" className="">
                Portfolio
              </Link>
              <button type="button" className="active" aria-current="page">
                Matrix
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {data.warnings.length > 0 ? (
          <div className="warning-banner">
            {data.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        ) : null}

        <div className="variation-bar">
          <span className="vbar-tag">Design type</span>
          <span className="vbar-lede">
            <strong>Three approaches</strong> to seeing the whole portfolio at once · pick one
          </span>
          <MatrixDesignPicker />
        </div>

        <div className="kpi-strip">
          <KpiTile label="Bids in flight" value={portfolio.kpis.inFlight} cls="info" />
          <KpiTile label="Ready to award" value={portfolio.kpis.readyToAward} cls="good" />
          <KpiTile
            label="Awaiting follow-up"
            value={portfolio.kpis.awaitingFollowUp}
            cls="amber"
          />
          <KpiTile
            label="Overdue · >5d"
            value={portfolio.kpis.overdueFollowUp}
            cls="warn"
          />
          <KpiTile
            label="Trade Type pending"
            value={portfolio.kpis.tradeTypePending}
            cls="danger"
          />
        </div>

        <Classic matrixData={matrixData} />
        <Board board={board} />
        <Heatmap matrixData={matrixData} />

        <div
          style={{
            textAlign: 'center',
            marginTop: '1rem',
            fontSize: 11,
            color: 'var(--text-tertiary)',
          }}
        >
          Click a cell or chip to drill into that trade in the per-project view
        </div>
      </div>
    </main>
  );
}

function KpiTile({
  label,
  value,
  cls,
}: {
  label: string;
  value: number;
  cls: 'info' | 'good' | 'amber' | 'warn' | 'danger';
}) {
  return (
    <div className={`kpi-card ${cls}`}>
      <div className="label">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

// ---------- A · Classic ----------

function Classic({ matrixData }: { matrixData: MatrixData }) {
  const { projects, groups, cellsByKey, uniquePlanCount } = matrixData;

  return (
    <div className="design active" data-d="classic">
      <div className="legend-strip">
        <span className="lbl">Axis:</span>
        <span style={{ fontSize: 11 }}>Trades ↓ · Projects →</span>
        <div className="right">
          {(['AW', 'LV', 'LP', 'BR', 'RS', 'FU', 'NR', 'NS', 'ND'] as const).map((code) => {
            const cfg = STATUS_PILL[code];
            return (
              <span className="sw" key={code}>
                <span className="blk" style={{ background: cfg.bg }} />
                {cfg.name}
              </span>
            );
          })}
        </div>
      </div>
      <div className="cm-wrap">
        <table className="classic">
          <thead>
            <tr>
              <th className="row-h" style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Trade</div>
                <div className="sub">
                  {uniquePlanCount} trades · {projects.length} projects
                </div>
              </th>
              {projects.map((p) => (
                <ProjectHeader key={p.folderId} project={p} />
              ))}
              <th className="row-summary">
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Awarded
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  of projects
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups
              .filter((g) => g.trades.length > 0)
              .map((group) => (
                <ClassicGroup
                  key={group.id}
                  group={group}
                  projects={projects}
                  cellsByKey={cellsByKey}
                />
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="row-h">Awarded · per project</td>
              {projects.map((p) => {
                const total = p.filingsCount;
                const approved = p.awardedCount;
                const pct = total ? Math.round((approved / Math.max(total, 1)) * 100) : 0;
                const warn = p.stuckCount > 0 ? 'warn' : '';
                return (
                  <td key={p.folderId}>
                    <div className={`pct ${warn}`}>
                      <b>{pct}%</b>
                      <div className="bar">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                );
              })}
              <td className="row-summary"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProjectHeader({ project }: { project: MatrixProject }) {
  return (
    <th className="proj-col" title={project.folderName}>
      <Link href={project.url} className="ph" style={{ color: 'inherit', textDecoration: 'none' }}>
        <span className="pav" style={{ background: project.avatarBg }}>
          {project.avatar}
        </span>
        <span className="pname">{project.folderName}</span>
        <span className="pmeta">
          {project.filingsCount}b · {project.awardedCount}aw
        </span>
        <span className={project.stuckCount > 0 ? 'pflag' : 'pflag clear'} />
      </Link>
    </th>
  );
}

function ClassicGroup({
  group,
  projects,
  cellsByKey,
}: {
  group: TradeGroup;
  projects: MatrixProject[];
  cellsByKey: Map<string, MatrixCell>;
}) {
  let gTotal = 0;
  let gAwarded = 0;
  for (const trade of group.trades) {
    for (const p of projects) {
      const cell = cellsByKey.get(`${p.folderId}|${tradeKey(trade)}`);
      if (!cell || !cell.status) continue;
      gTotal += 1;
      if (cell.status === 'Awarded') gAwarded += 1;
    }
  }
  const groupPct = gTotal ? Math.round((gAwarded / gTotal) * 100) : 0;

  return (
    <>
      <tr className="group-row" data-group={group.id}>
        <td className="row-h">
          <div className="group-handle">
            <span>{group.label}</span>
            <span className="count">· {group.trades.length}</span>
          </div>
        </td>
        {projects.map((p) => {
          const roll = groupRollup(p.folderId, group.trades, cellsByKey);
          if (!roll.total) return <td key={p.folderId}><div className="group-strip" /></td>;
          const pct = (s: BiddingStatus) => ((roll.counts[s] ?? 0) / roll.total) * 100;
          return (
            <td key={p.folderId}>
              <div className="group-strip">
                <div className="ministack">
                  <div className="mini">
                    <i style={{ width: `${pct('Awarded')}%`, background: STATUS_PILL.AW.bg }} />
                    <i style={{ width: `${pct('Leveled - Pending Review')}%`, background: STATUS_PILL.LP.bg }} />
                    <i style={{ width: `${pct('Bid Received')}%`, background: STATUS_PILL.BR.bg }} />
                    <i style={{ width: `${pct('Leveling')}%`, background: STATUS_PILL.LV.bg }} />
                  </div>
                  <div className="mini">
                    <i style={{ width: `${pct('Followed Up')}%`, background: STATUS_PILL.FU.bg }} />
                    <i style={{ width: `${pct('RFP Sent')}%`, background: STATUS_PILL.RS.bg }} />
                    <i style={{ width: `${pct('Needs Rebid')}%`, background: STATUS_PILL.NR.bg }} />
                    <i style={{ width: `${pct('Not Started')}%`, background: STATUS_PILL.NS.bg, opacity: 0.5 }} />
                  </div>
                </div>
              </div>
            </td>
          );
        })}
        <td className="row-summary"><b>{groupPct}%</b></td>
      </tr>
      {group.trades.map((trade) => {
        let rowTotal = 0;
        let rowAwarded = 0;
        const cells = projects.map((p) => {
          const cell = cellsByKey.get(`${p.folderId}|${tradeKey(trade)}`);
          if (cell && cell.status) {
            rowTotal += 1;
            if (cell.status === 'Awarded') rowAwarded += 1;
          }
          return { project: p, cell };
        });
        return (
          <tr key={`${group.id}-${trade}`} className="data-row" data-parent={group.id}>
            <td className="row-h">
              {trade}
              {rowTotal < projects.length ? (
                <div className="sub">
                  {rowTotal} of {projects.length}
                </div>
              ) : null}
            </td>
            {cells.map(({ project, cell }) => (
              <td key={project.folderId}>
                <ClassicCell cell={cell} />
              </td>
            ))}
            <td className="row-summary">
              <b>{rowAwarded}</b>/{rowTotal}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function ClassicCell({ cell }: { cell: MatrixCell | undefined }) {
  if (!cell || !cell.status) {
    return (
      <div className="cell empty">
        <span>—</span>
      </div>
    );
  }
  const cfg = STATUS_PILL[cell.code as keyof typeof STATUS_PILL];
  const style = { background: cfg.bg, color: cfg.fg };
  const content = (
    <>
      <span>{cell.code}</span>
      {cell.count > 1 ? <span className="cnt">×{cell.count}</span> : null}
    </>
  );
  return cell.href ? (
    <Link href={cell.href} className="cell" style={style} title={cfg.name}>
      {content}
    </Link>
  ) : (
    <div className="cell" style={style} title={cfg.name}>
      {content}
    </div>
  );
}

// ---------- B · Status board ----------

function Board({ board }: { board: Record<string, import('@/lib/matrixView').BoardCell[]> }) {
  const totalChips = Object.values(board).reduce(
    (sum, list) => sum + list.reduce((s, p) => s + p.trades.length, 0),
    0
  );
  return (
    <div className="design" data-d="board">
      <div className="legend-strip">
        <span className="lbl">Group by:</span>
        <span style={{ fontSize: 11 }}>Each trade × project becomes a chip in the column matching its current status.</span>
        <div className="right">
          <span className="sw">
            <span className="blk" style={{ background: 'var(--warn-bg)', boxShadow: 'inset 3px 0 0 var(--warn-strong)' }} />
            Urgent column
          </span>
          <span className="sw">
            <span className="blk" style={{ background: 'var(--danger-bg)', boxShadow: 'inset 3px 0 0 var(--danger-strong)' }} />
            Stuck column
          </span>
        </div>
      </div>
      <div className="board">
        {BOARD_COLUMNS.map((col) => {
          const entries = board[col.id] ?? [];
          const count = entries.reduce((s, p) => s + p.trades.length, 0);
          const projCount = entries.length;
          const pctOfTotal = totalChips ? Math.round((count / totalChips) * 100) : 0;
          const swatch = STATUS_PILL[
            (col.statuses[0] === 'Awarded'
              ? 'AW'
              : col.statuses[0] === 'Needs Rebid'
                ? 'NR'
                : col.statuses[0] === 'Leveled - Pending Review'
                  ? 'LP'
                  : col.statuses[0] === 'Bid Received'
                    ? 'BR'
                    : col.statuses[0] === 'RFP Sent'
                      ? 'RS'
                      : 'NS') as keyof typeof STATUS_PILL
          ].bg;
          return (
            <div className={`col ${col.cls ?? ''}`} key={col.id}>
              <div className="col-h">
                <div className="label">
                  <span className="swatch" style={{ background: swatch }} />
                  {col.label}
                  <span className="count">{count}</span>
                </div>
                <div className="meta">
                  {projCount} projects · {pctOfTotal}% of all
                </div>
              </div>
              <div className="col-body">
                {entries.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      textAlign: 'center',
                      padding: '24px 8px',
                    }}
                  >
                    —
                  </div>
                ) : (
                  entries.map((p) => (
                    <div className="pgroup" key={p.projectFolderId}>
                      <div className="pgroup-h">
                        <span className="pav" style={{ background: p.projectAvatarBg }}>
                          {p.projectAvatar}
                        </span>
                        <span className="pname">{p.projectName}</span>
                        <span className="pcount">{p.trades.length}</span>
                      </div>
                      <div className="pchips">
                        {p.trades.map((t) => (
                          <Link className="pchip" key={t.trade} href={t.href}>
                            {t.trade}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- C · Heatmap ----------

function Heatmap({ matrixData }: { matrixData: MatrixData }) {
  const { projects, groups, cellsByKey } = matrixData;
  const cellSize = 22;
  const cols: string[] = ['220px'];
  groups.forEach((g, i) => {
    if (i > 0) cols.push('8px');
    for (let n = 0; n < g.trades.length; n += 1) cols.push(`${cellSize}px`);
  });
  const gridTemplate = cols.join(' ');

  return (
    <div className="design" data-d="heatmap">
      <div className="heat-wrap">
        <div className="legend-strip" style={{ marginBottom: 12 }}>
          <span className="lbl">Heatmap:</span>
          <span style={{ fontSize: 11 }}>
            Projects = rows · Trades = columns · Hover a cell for details
          </span>
          <div className="right">
            {(['AW', 'LP', 'BR', 'FU', 'RS', 'NR', 'NS', 'ND'] as const).map((code) => {
              const cfg = STATUS_PILL[code];
              return (
                <span className="sw" key={code}>
                  <span className="blk" style={{ background: cfg.bg }} />
                  {cfg.name}
                </span>
              );
            })}
          </div>
        </div>
        {/* Section band */}
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '0 1px', alignItems: 'end', marginBottom: 4 }}>
          <div />
          {groups.map((g, i) => {
            let total = 0;
            let awarded = 0;
            for (const p of projects) {
              for (const trade of g.trades) {
                const cell = cellsByKey.get(`${p.folderId}|${tradeKey(trade)}`);
                if (cell && cell.status) {
                  total += 1;
                  if (cell.status === 'Awarded') awarded += 1;
                }
              }
            }
            const pct = total ? Math.round((awarded / total) * 100) : 0;
            return (
              <div key={g.id} style={{ display: 'contents' }}>
                {i > 0 ? <div /> : null}
                <div className="heat-section-band" style={{ gridColumn: `span ${g.trades.length}` }}>
                  <div className="lab">{g.label}</div>
                  <div className="pct-line">
                    <b>{pct}%</b> awarded · {g.trades.length} trade{g.trades.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Body rows */}
        <div className="heatmap" style={{ gridTemplateColumns: 'unset' }}>
          {projects.map((p) => (
            <div
              key={p.folderId}
              className="heat-row"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="pname">
                <span className="pav" style={{ background: p.avatarBg }}>
                  {p.avatar}
                </span>
                <Link href={p.url} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {p.folderName}
                </Link>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: p.stuckCount > 0 ? 'var(--warn-strong)' : 'var(--text-tertiary)',
                    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  }}
                >
                  {p.stuckCount > 0 ? `${p.stuckCount} stuck` : ''}
                </span>
              </div>
              {groups.map((g, gi) => (
                <div key={g.id} style={{ display: 'contents' }}>
                  {gi > 0 ? <div /> : null}
                  {g.trades.map((trade) => {
                    const cell = cellsByKey.get(`${p.folderId}|${tradeKey(trade)}`);
                    const cfg = cell?.code
                      ? STATUS_PILL[cell.code as keyof typeof STATUS_PILL]
                      : null;
                    const cls = cfg ? 'hcell' : 'hcell empty';
                    const style: React.CSSProperties = {
                      height: cellSize,
                      background: cfg ? cfg.bg : undefined,
                    };
                    const title = cfg
                      ? `${trade} · ${p.folderName} · ${cfg.name}${
                          cell && cell.count > 1 ? ` ×${cell.count}` : ''
                        }`
                      : `${trade} · ${p.folderName} · not started`;
                    return cell?.href ? (
                      <Link
                        key={trade}
                        href={cell.href}
                        className={cls}
                        style={style}
                        title={title}
                      />
                    ) : (
                      <div key={trade} className={cls} style={style} title={title} />
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
