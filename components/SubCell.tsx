import { STATUS_CODE, STATUS_PILL, BiddingTask } from '@/lib/clickup/types';
import { fmtUsd, subAvatarColor, subInitials } from '@/lib/formatting';

interface Props {
  bid: BiddingTask | null;
  isLowest: boolean;
}

export function SubCell({ bid, isLowest }: Props) {
  if (!bid) return <td />;
  const code = STATUS_CODE[bid.status];
  const cfg = STATUS_PILL[code];
  return (
    <td>
      <a
        href={bid.url}
        target="_top"
        className={`bid-card${isLowest ? ' lowest' : ''}`}
        title={`Open ${bid.subcontractor} in ClickUp`}
      >
        <div className="bid-head">
          <span className="avatar" style={{ background: subAvatarColor(bid.subcontractor) }}>
            {subInitials(bid.subcontractor)}
          </span>
          <span className="sub-name" title={bid.subcontractor}>
            {bid.subcontractor}
          </span>
        </div>
        <div className="bid-foot">
          <span className="bid-amt">
            {bid.bidAmount != null ? fmtUsd(bid.bidAmount) : <span className="dim">no bid</span>}
          </span>
          {cfg ? (
            <span
              className="status-pill"
              style={{ background: cfg.bg, color: cfg.fg }}
              title={bid.status}
            >
              {code}
            </span>
          ) : null}
        </div>
      </a>
    </td>
  );
}
