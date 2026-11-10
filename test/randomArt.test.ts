import { pickRandomWork } from '../src/renderer/js/services/randomArt.js';
import type { Filter } from '../src/renderer/js/types.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

afterEach(restoreFetch);

// Each test uses its own keyword: the number of matches is cached per search.
const filter = (q: string, over: Partial<Filter> = {}): Filter => ({ deptId: '', from: '', to: '', q, ...over });
const object = (id: number, over: object = {}): unknown =>
  ({ objectID: id, title: `T${id}`, artistDisplayName: 'Artist', artistNationality: 'Dutch', primaryImageSmall: `i${id}.jpg`, objectDate: '1650', objectURL: `https://met/${id}`, ...over });

/** A search that reports `total` matches and returns `pageIds` for any page; objects come from `objects`. */
function metWith(total: number, pageIds: number[], objects: Record<number, unknown> = {}): Parameters<typeof stubFetch>[0] {
  return [
    [/\/objects\/(\d+)/, (url: string) => objects[Number(/\/objects\/(\d+)/.exec(url)?.[1])] ?? { message: 'missing' }],
    ['/search', (url: string) => ({ total, objectIDs: url.includes('limit=1&') ? pageIds.slice(0, 1) : pageIds })],
  ];
}
const searches = (calls: string[]): string[] => calls.filter((call) => call.includes('/search'));
const offsetOf = (url: string): number => Number(/offset=(\d+)/.exec(url)?.[1]);

describe('pickRandomWork', () => {
  it('asks for the number of matches once, then reads a random page', async () => {
    const calls = stubFetch(metWith(500, [1, 2, 3], { 1: object(1), 2: object(2), 3: object(3) }));
    const randomFilter = filter('random-total');
    for (let round = 0; round < 5; round++) expect(await pickRandomWork(randomFilter)).not.toBeNull();

    const all = searches(calls);
    expect(all.filter((call) => call.includes('limit=1&'))).toHaveLength(1); // the total is remembered
    const pages = all.filter((call) => call.includes('limit=20&'));
    expect(pages).toHaveLength(5);
    for (const page of pages) expect(offsetOf(page)).toBeLessThan(500);
  });

  it('spreads picks across the results instead of always taking the first page', async () => {
    const calls = stubFetch(metWith(500, [1], { 1: object(1) }));
    for (let round = 0; round < 25; round++) await pickRandomWork(filter('random-spread'));
    const offsets = new Set(searches(calls).filter((call) => call.includes('limit=20&')).map(offsetOf));
    expect(offsets.size).toBeGreaterThan(5);
  });

  it('stays within the part of the results the search service will page through', async () => {
    const calls = stubFetch(metWith(51_583, [1], { 1: object(1) }));
    for (let round = 0; round < 30; round++) await pickRandomWork(filter('random-deep'));
    for (const page of searches(calls).filter((call) => call.includes('limit=20&'))) expect(offsetOf(page)).toBeLessThan(9000);
  });

  it('passes the exam filter on to the search', async () => {
    const calls = stubFetch(metWith(10, [1], { 1: object(1) }));
    await pickRandomWork(filter('random-filter', { deptId: '11', from: '1800', to: '1900' }));
    for (const part of ['q=random-filter', 'departmentId=11', 'dateBegin=1800', 'dateEnd=1900', 'hasImages=true']) {
      expect(searches(calls)[0]).toContain(part);
    }
  });

  it('returns a work with the Met details', async () => {
    stubFetch(metWith(1, [7], { 7: object(7) }));
    expect(await pickRandomWork(filter('random-shape'))).toEqual({
      id: 7, title: 'T7', artist: 'Artist', nationality: 'Dutch', date: '1650', image: 'i7.jpg', source: 'https://met/7',
    });
  });

  it('returns null when nothing matches', async () => {
    const calls = stubFetch(metWith(0, []));
    expect(await pickRandomWork(filter('random-none'))).toBeNull();
    expect(searches(calls)).toHaveLength(1); // no pointless page requests
  });

  it('skips objects without an image or an artist, and gives up after a few tries', async () => {
    const calls = stubFetch(metWith(100, [1, 2], { 1: object(1, { primaryImageSmall: '' }), 2: object(2, { artistDisplayName: '' }) }));
    expect(await pickRandomWork(filter('random-bad'))).toBeNull();
    expect(searches(calls).filter((call) => call.includes('limit=20&')).length).toBeLessThanOrEqual(8);
  });

  it('propagates a failing search so the caller can say the Met is unreachable', async () => {
    stubFetch([['/search', new Error('gone')]]);
    await expect(pickRandomWork(filter('random-error'))).rejects.toThrow(/HTTP 500/);
  });
});
