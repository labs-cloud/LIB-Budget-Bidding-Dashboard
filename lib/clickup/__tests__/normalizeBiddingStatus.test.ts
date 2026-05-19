import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeBiddingStatus, BIDDING_STATUSES } from '../types';
import { shapeBiddingTask } from '../client';
import type { CUTask } from '../types';

describe('normalizeBiddingStatus', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  // Every canonical name in 4 casings (TitleCase, lowercase, UPPER, mixed)
  // round-trips to the canonical TitleCase form.
  for (const canonical of BIDDING_STATUSES) {
    it(`maps every casing of "${canonical}" to itself`, () => {
      expect(normalizeBiddingStatus(canonical)).toBe(canonical);
      expect(normalizeBiddingStatus(canonical.toLowerCase())).toBe(canonical);
      expect(normalizeBiddingStatus(canonical.toUpperCase())).toBe(canonical);
      // Mixed case
      const mixed = canonical
        .split('')
        .map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase()))
        .join('');
      expect(normalizeBiddingStatus(mixed)).toBe(canonical);
    });
  }

  it('maps the "Bid Recieved" misspelling to canonical "Bid Received"', () => {
    expect(normalizeBiddingStatus('Bid Recieved')).toBe('Bid Received');
    expect(normalizeBiddingStatus('BID RECIEVED')).toBe('Bid Received');
    expect(normalizeBiddingStatus('bid recieved')).toBe('Bid Received');
  });

  it('maps em-dash and en-dash variants of "Leveled - Pending Review"', () => {
    expect(normalizeBiddingStatus('Leveled — Pending Review')).toBe('Leveled - Pending Review');
    expect(normalizeBiddingStatus('Leveled – Pending Review')).toBe('Leveled - Pending Review');
    expect(normalizeBiddingStatus('LEVELED — PENDING REVIEW')).toBe('Leveled - Pending Review');
  });

  it('maps informal Excel "Budget Outlook" vocabulary to canonical statuses', () => {
    expect(normalizeBiddingStatus('sent')).toBe('RFP Sent');
    expect(normalizeBiddingStatus('SENT')).toBe('RFP Sent');
    expect(normalizeBiddingStatus(' received ')).toBe('Bid Received');
    expect(normalizeBiddingStatus('finalized')).toBe('Awarded');
    expect(normalizeBiddingStatus('Finalized')).toBe('Awarded');
    expect(normalizeBiddingStatus('hold')).toBe('Needs Rebid');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('maps "Followed <date>" shorthand to "Followed Up"', () => {
    expect(normalizeBiddingStatus('Followed 4/21')).toBe('Followed Up');
    expect(normalizeBiddingStatus('followed 4/21/26')).toBe('Followed Up');
    expect(normalizeBiddingStatus('Followed up 04-21-2026')).toBe('Followed Up');
    expect(normalizeBiddingStatus('Followed')).toBe('Followed Up');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still warns on "Followed" with a non-date suffix', () => {
    expect(normalizeBiddingStatus('Followed soon')).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('returns null and warns on unknown values', () => {
    expect(normalizeBiddingStatus('Bogus Status')).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('Bogus Status');
  });

  it('returns null without warning for empty/null input', () => {
    expect(normalizeBiddingStatus(null)).toBeNull();
    expect(normalizeBiddingStatus(undefined)).toBeNull();
    expect(normalizeBiddingStatus('')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('shapeBiddingTask', () => {
  it('prefers the SOP Bidding Status custom field over derived amount status', () => {
    const task: CUTask = {
      id: 'bid-1',
      name: 'Acme Mechanical',
      status: { status: 'not started' },
      parent: null,
      url: 'https://app.clickup.com/t/bid-1',
      list: { id: 'bidding-list' },
      custom_fields: [
        {
          id: 'status-field',
          name: 'Bidding Status',
          type: 'drop_down',
          value: 'lp',
          type_config: {
            options: [{ id: 'lp', name: 'Leveled - Pending Review' }],
          },
        },
        {
          id: 'trade-field',
          name: 'Trade',
          type: 'drop_down',
          value: 'hvac',
          type_config: { options: [{ id: 'hvac', name: 'HVAC' }] },
        },
        {
          id: 'amount-field',
          name: 'Bid/Contracted Amount',
          type: 'currency',
          value: 100,
        },
      ],
    };

    const shaped = shapeBiddingTask(task, 'Project', 'folder-1', new Map());

    expect(shaped.status).toBe('Leveled - Pending Review');
    expect(shaped.statusDerived).toBe(false);
  });
});
