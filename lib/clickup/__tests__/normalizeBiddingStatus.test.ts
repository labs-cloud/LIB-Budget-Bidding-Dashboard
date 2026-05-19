import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeBiddingStatus, BIDDING_STATUSES } from '../types';

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
