import { classifyDelta, fmtUsd } from '@/lib/formatting';

interface Props {
  updated: number | null;
  budget: number | null;
}

export function AwardDeltaChip({ updated, budget }: Props) {
  if (updated == null || budget == null || budget === 0) {
    return <span className="dim">—</span>;
  }
  const d = updated - budget;
  const cls = classifyDelta(updated, budget);
  const sign = d >= 0 ? '+' : '−';
  const text = `${sign}${fmtUsd(Math.abs(d))}`;
  const className = cls === 'over' ? 'delta-chip over' : cls === 'under' ? 'delta-chip under' : 'delta-chip';
  return <span className={className}>{text}</span>;
}
