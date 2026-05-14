import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { KpiCard } from '@/components/KpiCard';
import { SubCell } from '@/components/SubCell';
import { AwardDeltaChip } from '@/components/AwardDeltaChip';
import { RefreshOnFocus } from '@/components/RefreshOnFocus';
import { EmbedClass } from '@/components/EmbedClass';
import { loadProjectSnapshot } from '@/lib/data';
import { computeUpdatedBudgets, projectRollup } from '@/lib/clickup/budgetAutomation';
import { fmtUsd, fmtUsdSigned, fmtPct, classifyDelta } from '@/lib/formatting';
import { BiddingTask, BudgetTask } from '@/lib/clickup/types';
import { MOCK_PROJECTS } from '@/lib/clickup/mockData';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams?: { embed?: string; trade?: string };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const embed = searchParams?.embed === '1';
  const tradeFocus = searchParams?.trade;
  const { snapshot, source, refreshedAt } = await loadProjectSnapshot(params.id);
  if (!snapshot) notFound();

  const automation = computeUpdatedBudgets(snapshot);
  const rollup = projectRollup(snapshot);
  const refreshedMin = Math.max(1, Math.floor((Date.now() - refreshedAt) / 60_000));
  const meta = MOCK_PROJECTS.find((p) => p.folderId === params.id);

  // Order: bid grid rows by budget allocated desc (Brady-style). If a trade
  // focus was passed, surface that row first.
  const rows = snapshot.budgetTasks
    .slice()
    .sort((a, b) => (b.budgetAllocated ?? 0) - (a.budgetAllocated ?? 0));
  if (tradeFocus) {
    rows.sort((a, b) => (a.trade === tradeFocus ? -1 : b.trade === tradeFocus ? 1 : 0));
  }

  // Group bids by parent budget task.
  const bidsByBudget = new Map<string, BiddingTask[]>();
  for (const b of snapshot.biddingTasks) {
    if (!b.parentBudgetTaskId) continue;
    const list = bidsByBudget.get(b.parentBudgetTaskId) ?? [];
    list.push(b);
    bidsByBudget.set(b.parentBudgetTaskId, list);
  }

  // Per-row counts for the totals footer.
  const inFlightStatuses = new Set(['RFP Sent', 'Followed Up', 'Bid Received', 'Leveling']);
  let awardedRows = 0;
  let inFlightRows = 0;
  let needingReview = 0;
  for (const bt of snapshot.budgetTasks) {
    const bids = bidsByBudget.get(bt.id) ?? [];
    if (bids.some((b) => b.status === 'Awarded')) awardedRows += 1;
    else if (bids.some((b) => inFlightStatuses.has(b.status))) inFlightRows += 1;
    if (bids.some((b) => b.status === 'Leveled - Pending Review')) needingReview += 1;
  }

  const deltaCls = classifyDelta(rollup.updated, rollup.estimated);
  const deltaColor =
    deltaCls === 'over' ? '#993c1d' : deltaCls === 'under' ? '#186221' : 'var(--text-primary)';

  const tradesOver10pct = automation.filter((a) => {
    const bt = snapshot.budgetTasks.find((b) => b.id === a.budgetTaskId);
    return classifyDelta(a.nextUpdated, bt?.budgetAllocated ?? null) === 'over';
  }).length;

  return (
    <main style={{ padding: embed ? 0 : 32 }}>
      <EmbedClass embed={embed} />
      <RefreshOnFocus />
      <div className="frame">
        {!embed ? (
          <Link href="/" className="back-link">
            ← All projects
          </Link>
        ) : null}
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="project-badge" style={{ background: meta?.badgeBg ?? '#ab4aba' }}>
            {meta?.badgeText ?? snapshot.folderName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{snapshot.folderName}</h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {meta?.address ? `${meta.address} · ` : ''}
              {snapshot.budgetTasks.length} trades · {rollup.awardedCount} awarded · {source === 'live' ? 'live' : 'mock'} · Updated Budget auto-refreshed {refreshedMin} min ago
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
          <KpiCard label="Budget Allocated (estimate)" value={fmtUsd(rollup.estimated)} sub="sum of original estimates" />
          <KpiCard
            label="Updated Budget (live)"
            value={fmtUsd(rollup.updated)}
            sub="sum of lowest non-disqualified bids"
            valueColor="#186221"
          />
          <KpiCard
            label="Award Δ"
            value={fmtUsdSigned(rollup.delta)}
            sub={`${tradesOver10pct} trade${tradesOver10pct === 1 ? '' : 's'} over 10%`}
            valueColor={deltaColor}
          />
          <KpiCard
            label="Coverage"
            value={fmtPct(rollup.coverage)}
            sub={`${rollup.awardedCount} of ${rollup.biddableCount} biddable`}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>View:</span>
          <button className="chip active" type="button">All trades · {snapshot.budgetTasks.length}</button>
          <button className="chip" type="button">Awarded only</button>
          <button className="chip" type="button">Open bids</button>
          <button className="chip" type="button">Over budget</button>
        </div>

        <div className="grid-wrap">
          <table>
            <thead>
              <tr>
                <th className="sticky">Trade</th>
                <th>Sub 1</th>
                <th>Sub 2</th>
                <th>Sub 3</th>
                <th>Sub 4</th>
                <th className="txt-num">
                  Updated Budget <i className="bolt" aria-hidden="true" />
                </th>
                <th className="txt-num">Budget Allocated</th>
                <th className="txt-num">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bt) => (
                <BidRow
                  key={bt.id}
                  bt={bt}
                  bids={bidsByBudget.get(bt.id) ?? []}
                  updatedFromAutomation={
                    automation.find((a) => a.budgetTaskId === bt.id)?.nextUpdated ?? bt.updatedBudget
                  }
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky">Project totals</td>
                <td colSpan={3} style={{ color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 400 }}>
                  {awardedRows} trades awarded · {inFlightRows} in flight · {needingReview} needing review
                </td>
                <td className="txt-num">
                  <span style={{ color: '#186221' }}>{fmtUsd(rollup.updated)}</span>
                </td>
                <td className="txt-num">
                  <span className="txt-num md muted">{fmtUsd(rollup.estimated)}</span>
                </td>
                <td className="txt-num">
                  <span style={{ color: deltaColor }}>{fmtUsdSigned(rollup.delta)}</span>
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="legend">
          <span>
            <span style={{ display: 'inline-block', width: 4, height: 14, background: '#d85a30', borderRadius: 2, verticalAlign: -3 }} /> Hard cost
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 4, height: 14, background: '#ffc53d', borderRadius: 2, verticalAlign: -3 }} /> Soft cost
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 14, height: 14, border: '1.5px solid #186221', borderRadius: 4, verticalAlign: -3 }} /> Lowest non-rejected bid (drives Updated Budget)
          </span>
          <span>
            <i className="bolt" aria-hidden="true" /> Updated Budget = automation output
          </span>
        </div>

        <div className="foot">
          Source:{' '}
          <a href="https://leadit.clickup.com/9017603275/v/dc/8cqvd6b-305837" style={{ color: 'inherit' }}>
            ClickUp B&amp;B SOP
          </a>{' '}
          · statuses verbatim from <code>02. Bidding</code>. <strong>Updated Budget</strong> is auto-computed: if any bid is{' '}
          <code>Awarded</code> that wins; otherwise the lowest non-disqualified <code>Bid/Contracted Amount</code>; falls back to
          Budget Allocated when no eligible bids.
        </div>
      </div>
    </main>
  );
}

function BidRow({
  bt,
  bids,
  updatedFromAutomation,
}: {
  bt: BudgetTask;
  bids: BiddingTask[];
  updatedFromAutomation: number | null;
}) {
  // Sort bids: lowest-eligible first, then by orderindex.
  const sorted = bids
    .slice()
    .sort((a, b) => {
      const aw = a.status === 'Awarded' ? -2 : 0;
      const bw = b.status === 'Awarded' ? -2 : 0;
      if (aw !== bw) return aw - bw;
      return Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0);
    });
  const four: (BiddingTask | null)[] = [sorted[0] ?? null, sorted[1] ?? null, sorted[2] ?? null, sorted[3] ?? null];

  // Determine which bid drives Updated Budget — that one gets the green ring.
  const eligibleAmounts = bids.filter(
    (b) => b.bidAmount != null && b.bidAmount > 0 && b.status !== 'No Bid / Declined' && b.status !== 'Needs Rebid' && b.status !== 'Not Started'
  );
  const awarded = eligibleAmounts.find((b) => b.status === 'Awarded');
  const minBid =
    awarded ??
    (eligibleAmounts.length > 0
      ? eligibleAmounts.reduce((min, b) => (b.bidAmount! < min.bidAmount! ? b : min))
      : null);

  return (
    <tr>
      <td className={`sticky cost-${bt.costType === 'Hard' ? 'hard' : 'soft'}`}>
        <div className="trade-name">{bt.trade}</div>
        <div className="trade-cost">{bt.costType === 'Hard' ? 'Hard cost' : 'Soft cost'}</div>
      </td>
      {four.map((bid, i) => (
        <SubCell key={i} bid={bid} isLowest={!!bid && minBid?.id === bid.id} />
      ))}
      <td className="txt-num">
        <div className="txt-num lg">{fmtUsd(updatedFromAutomation)}</div>
        <div className="auto-flag">
          <i className="bolt" aria-hidden="true" />
          auto
        </div>
      </td>
      <td className="txt-num">
        <span className="txt-num md muted">{fmtUsd(bt.budgetAllocated)}</span>
      </td>
      <td className="txt-num">
        <AwardDeltaChip updated={updatedFromAutomation} budget={bt.budgetAllocated} />
      </td>
    </tr>
  );
}
