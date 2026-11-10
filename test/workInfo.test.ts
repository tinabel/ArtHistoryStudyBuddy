import { lookupWorkInfo } from '../src/renderer/js/services/workInfo.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

afterEach(restoreFetch);

type Routes = Parameters<typeof stubFetch>[0];

/** Wikidata routes: the artist (with an artist-level movement) and, optionally, the artwork (with its own). */
function routes(opts: { artist: string; artistId: string; artistMovement: [string, string]; work?: { title: string; id: string; movement?: [string, string] } }): Routes {
  const movementEntity = (id: string, label: string): [RegExp, unknown] => [new RegExp(`ids=${id}\\b`), { entities: { [id]: { labels: { en: { value: label } } } } }];
  const claimsOf = (movementId?: string): unknown => (movementId ? { P135: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: movementId } } } }] } : {});
  const out: Routes = [
    [new RegExp(`search=${opts.artist.replace(/ /g, '\\+')}&`), { search: [{ id: opts.artistId, description: 'painter' }] }],
    [new RegExp(`ids=${opts.artistId}\\b`), { entities: { [opts.artistId]: { claims: { ...(claimsOf(opts.artistMovement[0]) as object) } } } }],
    movementEntity(...opts.artistMovement),
  ];
  if (opts.work) {
    const surname = opts.artist.split(' ').pop() ?? '';
    out.push([new RegExp(`search=${opts.work.title.replace(/ /g, '\\+')}&`), { search: [{ id: opts.work.id, description: `painting by ${opts.artist}` }] }]);
    out.push([new RegExp(`ids=${opts.work.id}\\b`), { entities: { [opts.work.id]: { claims: claimsOf(opts.work.movement?.[0]) } } }]);
    if (opts.work.movement) out.push(movementEntity(...opts.work.movement));
    expect(surname).not.toBe('');
  }
  return out;
}

describe('lookupWorkInfo', () => {
  // Distinct artist / title names per test: lookups are cached for the session.
  it("prefers the artwork's own movement over the artist's", async () => {
    stubFetch(routes({ artist: 'Prefer Painter', artistId: 'Q5001', artistMovement: ['Q5101', 'impressionism'], work: { title: 'Prefer Work', id: 'Q5201', movement: ['Q5102', 'realism'] } }));
    expect((await lookupWorkInfo({ artist: 'Prefer Painter', title: 'Prefer Work' }))?.movement).toBe('Realism');
  });

  it("falls back to the artist's movement when the artwork has none", async () => {
    stubFetch(routes({ artist: 'Fallback Painter', artistId: 'Q5002', artistMovement: ['Q5103', 'impressionism'], work: { title: 'Fallback Work', id: 'Q5202' } }));
    expect((await lookupWorkInfo({ artist: 'Fallback Painter', title: 'Fallback Work' }))?.movement).toBe('Impressionism');
  });

  it("falls back to the artist's movement when the artwork isn't on Wikidata", async () => {
    stubFetch(routes({ artist: 'Lonely Painter', artistId: 'Q5003', artistMovement: ['Q5104', 'cubism'] }));
    expect((await lookupWorkInfo({ artist: 'Lonely Painter', title: 'Not On Wikidata' }))?.movement).toBe('Cubism');
  });

  it('returns null when Wikidata cannot be reached, and asks again next time', async () => {
    stubFetch([['wbsearchentities', new Error('down')]]);
    expect(await lookupWorkInfo({ artist: 'Outage Painter', title: 'Outage Work' })).toBeNull();
    stubFetch(routes({ artist: 'Outage Painter', artistId: 'Q5005', artistMovement: ['Q5106', 'dada'] }));
    expect(await lookupWorkInfo({ artist: 'Outage Painter', title: 'Outage Work' })).toMatchObject({ movement: 'Dada' });
  });

  it('caches per artist and title, and reuses the artist lookup across works', async () => {
    const calls = stubFetch(routes({ artist: 'Cached Painter', artistId: 'Q5004', artistMovement: ['Q5105', 'fauvism'] }));
    await lookupWorkInfo({ artist: 'Cached Painter', title: 'First Work' });
    const afterFirst = calls.length;
    await lookupWorkInfo({ artist: 'Cached Painter', title: 'First Work' });
    expect(calls).toHaveLength(afterFirst);
    await lookupWorkInfo({ artist: 'Cached Painter', title: 'Second Work' });
    expect(calls.filter((call) => call.includes('search=Cached+Painter&'))).toHaveLength(1); // artist found once
  });

  it('returns empty info for a work with no artist', async () => {
    const calls = stubFetch([]);
    expect(await lookupWorkInfo({ artist: '', title: 'Anonymous' })).toEqual({ nationality: '', movement: '' });
    expect(calls).toHaveLength(0);
  });
});
