import { decoyDates, parseYear } from '../src/renderer/js/years.js';

describe('parseYear', () => {
  it('finds the first year in common date formats', () => {
    expect(parseYear('1814')).toBe(1814);
    expect(parseYear('1796-98')).toBe(1796);
    expect(parseYear('c. 1890-94')).toBe(1890);
    expect(parseYear('1500s')).toBe(1500);
    expect(parseYear('ca. 1650–1655')).toBe(1650);
    expect(parseYear('800')).toBe(800);
  });

  it('returns null when there is no year', () => {
    expect(parseYear('')).toBeNull();
    expect(parseYear('undated')).toBeNull();
    expect(parseYear('late 19th century')).toBeNull();
  });
});

describe('decoyDates', () => {
  it('gives the requested number of different dates, never the answer', () => {
    for (let round = 0; round < 40; round++) {
      const decoys = decoyDates('1814', 5);
      expect(decoys).toHaveLength(5);
      expect(new Set(decoys).size).toBe(5);
      expect(decoys).not.toContain('1814');
    }
  });

  it('keeps decoys near the answer', () => {
    for (const decoy of decoyDates('1814', 8)) {
      expect(Math.abs(Number(decoy) - 1814)).toBeGreaterThanOrEqual(3);
      expect(Math.abs(Number(decoy) - 1814)).toBeLessThanOrEqual(40);
    }
  });

  it('keeps the format: "c." prefix, two-digit range end, suffix', () => {
    for (let round = 0; round < 20; round++) {
      for (const decoy of decoyDates('c. 1890-94', 6)) expect(decoy).toMatch(/^c\. \d{4}-\d{2}$/);
      for (const decoy of decoyDates('1796-98', 6)) expect(decoy).toMatch(/^\d{4}-\d{2}$/);
      for (const decoy of decoyDates('1500s', 6)) expect(decoy).toMatch(/^\d{4}s$/);
    }
  });

  it('keeps the span of a range', () => {
    for (const decoy of decoyDates('1818-19', 8)) {
      const [start, end] = decoy.split('-').map(Number) as [number, number];
      expect((end + 100 - (start % 100)) % 100).toBe(1);
    }
  });

  it('handles a four-digit range end and a century rollover', () => {
    for (const decoy of decoyDates('1798-1802', 6)) expect(decoy).toMatch(/^\d{4}-\d{4}$/);
    for (const decoy of decoyDates('1798-02', 6)) expect(decoy).toMatch(/^\d{4}-\d{2}$/);
  });

  it('stays within a plausible range of years', () => {
    for (let round = 0; round < 20; round++) {
      for (const decoy of decoyDates('2020', 8)) expect(Number(decoy)).toBeLessThanOrEqual(2030);
      for (const decoy of decoyDates('520', 8)) expect(Number(decoy)).toBeGreaterThanOrEqual(500);
    }
  });

  it('uses wider gaps for older work', () => {
    const gaps = decoyDates('800', 8).map((decoy) => Math.abs(Number(decoy) - 800));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(60);
  });

  it('returns nothing when there is no year', () => {
    expect(decoyDates('undated', 3)).toEqual([]);
    expect(decoyDates('', 3)).toEqual([]);
  });
});
