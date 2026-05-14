import { STATUS_PILL } from '@/lib/clickup/types';

interface Props {
  code: keyof typeof STATUS_PILL;
  size?: 'sm' | 'md';
  title?: string;
}

export function StatusPill({ code, size = 'sm', title }: Props) {
  const cfg = STATUS_PILL[code];
  if (!cfg) return <span className="dim">—</span>;
  return (
    <span
      className={size === 'md' ? 'status-pill' : 'pill'}
      style={{ background: cfg.bg, color: cfg.fg }}
      title={title ?? cfg.name}
    >
      {code}
    </span>
  );
}
