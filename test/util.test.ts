import { pick, shuffle, surnameOf, unique } from '../src/renderer/js/util.js';

describe('util', () => {
  it('shuffle keeps every element and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const out = shuffle(input);
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual(copy);
  });

  it('shuffle eventually produces different orders', () => {
    const orders = new Set(Array.from({ length: 40 }, () => shuffle([1, 2, 3, 4]).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('unique removes duplicates, keeping first-seen order', () => {
    expect(unique(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('pick returns an element of the array', () => {
    const items = ['x', 'y', 'z'];
    for (let round = 0; round < 30; round++) expect(items).toContain(pick(items));
  });

  it('surnameOf: last word, letters only, lowercase, accents kept', () => {
    expect(surnameOf('J.A.D. Ingres')).toBe('ingres');
    expect(surnameOf('Théodore Géricault')).toBe('géricault');
    expect(surnameOf("Timothy O' Sullivan")).toBe('sullivan');
    expect(surnameOf('')).toBe('');
  });
});
