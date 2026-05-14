/** Money formatting used throughout the dashboard. */
export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${n < 0 ? '-' : ''}$${Math.round(abs / 1_000)}k`;
  }
  return `${n < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export function fmtUsdSigned(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return sign + fmtUsd(Math.abs(n));
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

const SUB_COLORS = [
  '#ab4aba',
  '#0091ff',
  '#30a46c',
  '#d85a30',
  '#534ab7',
  '#12a594',
  '#993c1d',
  '#ffc53d',
  '#a18072',
  '#3b6d11',
];

export function subAvatarColor(name: string): string {
  if (!name) return SUB_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h += name.charCodeAt(i);
  return SUB_COLORS[h % SUB_COLORS.length];
}

export function subInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Short project label for matrix column headers. Drops a leading run of
 * street-number tokens, keeps the meaningful remainder, caps length. The full
 * folder name should always be kept in a `title`/tooltip.
 *   "1931-1935 Bedford"     → "Bedford"
 *   "1925 Grand Concourse"  → "Grand Concourse"
 *   "1035 & 1039 42nd St"   → "42nd St"
 *   "1 OLD 3930 Carp"       → "OLD 3930 Carp"
 */
export function shortProjectName(name: string): string {
  const tokens = name.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length - 1 && /^[\d&,\/.\-]+$/.test(tokens[i])) i += 1;
  const rest = tokens.slice(i).join(' ') || name;
  return rest.length > 18 ? `${rest.slice(0, 17)}…` : rest;
}

/**
 * Delta classification matching §7 thresholds.
 * - >10% over → 'over'
 * - >5% under → 'under'
 * - else → 'neutral'
 */
export type DeltaClass = 'over' | 'under' | 'neutral';

export function classifyDelta(
  updated: number | null,
  budget: number | null
): DeltaClass {
  if (updated == null || budget == null || budget === 0) return 'neutral';
  const pct = (updated - budget) / budget;
  if (pct > 0.1) return 'over';
  if (pct < -0.05) return 'under';
  return 'neutral';
}

/** Days between a unix-ms (or ISO) date and now. Null-safe. */
export function daysSince(date: string | number | null | undefined): number | null {
  if (date == null) return null;
  const t = typeof date === 'number' ? date : Number(date);
  if (!Number.isFinite(t) || t <= 0) {
    const parsed = Date.parse(String(date));
    if (!Number.isFinite(parsed)) return null;
    return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
  }
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}
