import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, daysBetween, isoDate } from './dates';

describe('dates', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts whole days between dates, across months and DST changes', () => {
    expect(daysBetween('2026-11-03', '2026-11-03')).toBe(0);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-05', '2026-11-03')).toBe(-2);
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02');
  });

  it('labels plan days from the start date', () => {
    // 2026-11-03 is a Tuesday.
    expect(dayLabel('2026-11-03', 0)).toEqual({ weekday: 'TUE', date: 3 });
    expect(dayLabel('2026-11-03', 5)).toEqual({ weekday: 'SUN', date: 8 });
  });

  it('rejects text that is not an ISO date', () => {
    expect(() => daysBetween('soon', '2026-11-03')).toThrow(/ISO date/);
  });
});
