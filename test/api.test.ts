import { findImage } from '../src/renderer/js/api/commons.js';
import { getJson } from '../src/renderer/js/api/http.js';
import * as met from '../src/renderer/js/api/met.js';
import { artistInfoOf, workMovementOf } from '../src/renderer/js/api/wikidata.js';
import { define } from '../src/renderer/js/api/wikipedia.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

const nationalityOf = async (name: string): Promise<string> => (await artistInfoOf(name)).nationality;

afterEach(restoreFetch);

describe('getJson', () => {
  it('appends query params and parses JSON', async () => {
    const calls = stubFetch([['example.org', { ok: 1 }]]);
    expect(await getJson('https://example.org/api', { a: '1', b: 'x y' })).toEqual({ ok: 1 });
    expect(calls[0]).toBe('https://example.org/api?a=1&b=x+y');
  });

  it('throws on HTTP errors', async () => {
    stubFetch([['example.org', new Error('x')]]);
    await expect(getJson('https://example.org/api')).rejects.toThrow(/HTTP 500/);
  });
});

describe('Met API', () => {
  const metObject = (id: number, over: Partial<met.MetObject> = {}): met.MetObject => ({
    objectID: id, title: `T${id}`, artistDisplayName: 'Artist', artistNationality: 'French',
    objectDate: '1800', primaryImageSmall: `img${id}.jpg`, objectURL: `https://met/${id}`, ...over,
  });

  it('toWork maps a Met object to the app shape', () => {
    expect(met.toWork(metObject(5))).toEqual({
      id: 5, title: 'T5', artist: 'Artist', nationality: 'French', date: '1800', image: 'img5.jpg', source: 'https://met/5',
    });
    expect(met.toWork(metObject(6, { artistNationality: undefined })).nationality).toBe('');
  });

  it('searchWorks restricts to images and drops results without one', async () => {
    const calls = stubFetch([
      ['/objects/1', metObject(1)],
      ['/objects/2', metObject(2, { primaryImageSmall: '' })],
      ['/objects/3', new Error('gone')],
      ['/search', { objectIDs: [1, 2, 3] }],
    ]);
    expect((await met.searchWorks('portrait', 10)).map((work) => work.id)).toEqual([1]);
    expect(calls[0]).toContain('hasImages=true');
    expect(calls[0]).toContain('q=portrait');
  });

  it('searches the v1.1 endpoint (v1 search was retired) with a page size and offset', async () => {
    const calls = stubFetch([['/search', { total: 3, objectIDs: [1, 2, 3] }]]);
    await met.searchIds({ q: 'monet' });
    expect(calls[0]).toContain('/public/collection/v1.1/search?');
    expect(calls[0]).not.toContain('/v1/search');
    for (const part of ['hasImages=true', 'q=monet', 'limit=50', 'offset=0']) expect(calls[0]).toContain(part);
  });

  it('searchPage returns the total and one page of ids; a missing total falls back to the page size', async () => {
    const calls = stubFetch([['/search', { total: 5000, objectIDs: [7, 8] }]]);
    expect(await met.searchPage({ q: 'art' }, { limit: 2, offset: 40 })).toEqual({ total: 5000, ids: [7, 8] });
    expect(calls[0]).toContain('limit=2');
    expect(calls[0]).toContain('offset=40');
    stubFetch([['/search', { objectIDs: [1, 2, 3] }]]);
    expect(await met.searchPage({ q: 'art' }, { limit: 10 })).toEqual({ total: 3, ids: [1, 2, 3] });
    stubFetch([['/search', {}]]);
    expect(await met.searchPage({ q: 'art' }, { limit: 10 })).toEqual({ total: 0, ids: [] });
  });

  it('a retired search endpoint is an error, not "no results"', async () => {
    stubFetch([['/search', new Error('gone')]]);
    await expect(met.searchWorks('monet', 10)).rejects.toThrow(/HTTP 500/);
  });

  it('still uses v1 for departments and individual objects', async () => {
    const calls = stubFetch([['/departments', { departments: [] }], ['/objects/9', { objectID: 9 }]]);
    await met.listDepartments();
    await met.getObject(9);
    expect(calls[0]).toContain('/public/collection/v1/departments');
    expect(calls[1]).toContain('/public/collection/v1/objects/9');
  });

  it('searchIds returns [] when the API has no objectIDs', async () => {
    stubFetch([['/search', { total: 0, objectIDs: null }]]);
    expect(await met.searchIds({ q: 'zzz' })).toEqual([]);
  });

  it('findWork requires the artist surname to match', async () => {
    stubFetch([
      ['/objects/1', metObject(1, { artistDisplayName: 'Someone Else' })],
      ['/objects/2', metObject(2, { artistDisplayName: 'Edouard Manet' })],
      ['/search', { objectIDs: [1, 2] }],
    ]);
    expect((await met.findWork('Olympia', 'manet'))?.id).toBe(2);
    expect(await met.findWork('Olympia', 'degas')).toBeNull();
  });

  it('listDepartments returns the department list', async () => {
    stubFetch([['/departments', { departments: [{ departmentId: 11, displayName: 'European Paintings' }] }]]);
    expect(await met.listDepartments()).toEqual([{ departmentId: 11, displayName: 'European Paintings' }]);
  });
});

describe('Wikimedia Commons', () => {
  const page = (index: number, title: string, withInfo = true): unknown => ({
    index, title, imageinfo: withInfo ? [{ thumburl: `thumb-${index}`, descriptionurl: `desc-${index}` }] : undefined,
  });

  it('prefers a file whose name contains the surname', async () => {
    stubFetch([['commons.wikimedia.org', { query: { pages: { a: page(1, 'File:Other.jpg'), b: page(2, 'File:Ingres Odalisque.jpg') } } }]]);
    expect(await findImage('Odalisque ingres', 'ingres')).toEqual({ image: 'thumb-2', source: 'desc-2' });
  });

  it('falls back to the top result, and skips non-photo files', async () => {
    stubFetch([['commons.wikimedia.org', { query: { pages: {
      a: page(1, 'File:Diagram.svg'), b: page(2, 'File:First.jpeg'), c: page(3, 'File:Second.png'), d: page(4, 'File:NoInfo.jpg', false),
    } } }]]);
    expect(await findImage('x', '')).toEqual({ image: 'thumb-2', source: 'desc-2' });
  });

  it('returns null on no results or errors', async () => {
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }]]);
    expect(await findImage('x', 'y')).toBeNull();
    stubFetch([['commons.wikimedia.org', new Error('x')]]);
    expect(await findImage('x', 'y')).toBeNull();
  });
});

describe('Wikipedia', () => {
  it('define returns the first two sentences and the article URL', async () => {
    const calls = stubFetch([
      ['rest_v1/page/summary', { extract: 'One fact. Two facts! Three facts.' }],
      ['list=search', { query: { search: [{ title: 'Salon des Refusés' }] } }],
    ]);
    expect(await define('Salon De Refuses, 1863')).toEqual({
      definition: 'One fact. Two facts!',
      source: 'https://en.wikipedia.org/wiki/Salon_des_Refus%C3%A9s',
    });
    expect(calls[0]).toContain('srsearch=Salon+De+Refuses+art+history'); // trailing ", 1863" removed
  });

  it('caps very long definitions', async () => {
    stubFetch([
      ['rest_v1/page/summary', { extract: `${'x'.repeat(600)}.` }],
      ['list=search', { query: { search: [{ title: 'T' }] } }],
    ]);
    expect((await define('T')).definition).toHaveLength(320);
  });

  it('returns empty strings when nothing is found or the request fails', async () => {
    stubFetch([['list=search', { query: { search: [] } }]]);
    expect(await define('zzz')).toEqual({ definition: '', source: '' });
    stubFetch([['list=search', new Error('x')]]);
    expect(await define('zzz')).toEqual({ definition: '', source: '' });
  });
});

describe('Wikidata', () => {
  // Each test uses its own country id: demonyms are cached per country for the session.
  function wikidata(opts: { description?: string; person?: string; country?: string; countryClaims?: object; labels?: object }): Parameters<typeof stubFetch>[0] {
    const { description = 'French painter (1819–1877)', person = 'Q2', country, countryClaims = {}, labels = {} } = opts;
    const citizenship = country ? { P27: [{ mainsnak: { datavalue: { value: { id: country } } } }] } : {};
    return [
      ['wbsearchentities', { search: [{ id: 'Q1', description: 'exhibition' }, { id: person, description }] }],
      [new RegExp(`ids=${person}\\b`), { entities: { [person]: { claims: citizenship } } }],
      [new RegExp(`ids=${country ?? 'none'}\\b`), { entities: { [country ?? 'none']: { claims: countryClaims, labels } } }],
    ];
  }
  const demonym = (text: string, language = 'en'): object => ({ mainsnak: { datavalue: { value: { text, language } } } });

  it('returns the English demonym of the country of citizenship', async () => {
    stubFetch(wikidata({ country: 'Q1001', countryClaims: { P1549: [demonym('француз', 'ru'), demonym('French')] }, labels: { en: { value: 'France' } } }));
    expect(await nationalityOf('Gustave Courbet')).toBe('French');
  });

  it('picks the artist, not an exhibition with the same name', async () => {
    const calls = stubFetch(wikidata({ person: 'Q22', country: 'Q1002', countryClaims: { P1549: [demonym('Spanish')] } }));
    await nationalityOf('Goya');
    expect(calls.some((call) => /ids=Q22\b/.test(call))).toBe(true);
    expect(calls.some((call) => /ids=Q1\b/.test(call))).toBe(false);
  });

  it('falls back to the country name when there is no demonym', async () => {
    stubFetch(wikidata({ country: 'Q1003', labels: { en: { value: 'Kingdom of Prussia' } } }));
    expect(await nationalityOf('Someone')).toBe('Kingdom of Prussia');
  });

  it('returns "" for non-artists and for artists without citizenship', async () => {
    stubFetch([['wbsearchentities', { search: [{ id: 'Q9', description: 'racehorse' }] }]]);
    expect(await nationalityOf('Auguste Rodin')).toBe('');
    stubFetch(wikidata({ person: 'Q23' }));
    expect(await nationalityOf('Nobody')).toBe('');
  });

  it('retries a failed request once, then throws so callers can tell "unknown" from "could not ask"', async () => {
    let attempts = 0;
    stubFetch([['wbsearchentities', () => (++attempts === 1 ? new Error('burst') : { search: [] })]]);
    expect(await nationalityOf('Retry Me')).toBe('');
    expect(attempts).toBe(2);

    stubFetch([['wbsearchentities', new Error('down')]]);
    await expect(nationalityOf('Always Down')).rejects.toThrow('HTTP 500');
  });
});

describe('Wikidata artist info (movement)', () => {
  type Rank = 'preferred' | 'normal' | 'deprecated';
  const movementClaim = (id: string, rank: Rank = 'normal'): object => ({ rank, mainsnak: { datavalue: { value: { id } } } });

  /** Routes for one artist with the given movements; each movement id resolves to its label. */
  function artistWith(opts: { person: string; country?: string; movements: { id: string; label: string; rank?: Rank }[] }): Parameters<typeof stubFetch>[0] {
    const claims: Record<string, unknown[]> = {};
    if (opts.country) claims.P27 = [{ mainsnak: { datavalue: { value: { id: opts.country } } } }];
    claims.P135 = opts.movements.map((movement) => movementClaim(movement.id, movement.rank));
    return [
      ['wbsearchentities', { search: [{ id: opts.person, description: 'French painter' }] }],
      [new RegExp(`ids=${opts.person}\\b`), { entities: { [opts.person]: { claims } } }],
      ...(opts.country ? [[new RegExp(`ids=${opts.country}\\b`), { entities: { [opts.country]: { claims: {}, labels: { en: { value: 'Testland' } } } } }] as [RegExp, unknown]] : []),
      ...opts.movements.map((movement): [RegExp, unknown] => [new RegExp(`ids=${movement.id}\\b`), { entities: { [movement.id]: { labels: { en: { value: movement.label } } } } }]),
    ];
  }

  it('returns nationality and art movement together', async () => {
    stubFetch(artistWith({ person: 'Q3001', country: 'Q3101', movements: [{ id: 'Q3201', label: 'impressionism' }] }));
    expect(await artistInfoOf('Info Painter A')).toEqual({ nationality: 'Testland', movement: 'Impressionism' });
  });

  it('capitalises each word and hyphenated part of the label', async () => {
    stubFetch(artistWith({ person: 'Q3002', movements: [{ id: 'Q3202', label: 'post-impressionism' }] }));
    expect((await artistInfoOf('Info Painter B')).movement).toBe('Post-Impressionism');
    stubFetch(artistWith({ person: 'Q3003', movements: [{ id: 'Q3203', label: 'art nouveau' }] }));
    expect((await artistInfoOf('Info Painter C')).movement).toBe('Art Nouveau');
  });

  it('prefers a claim ranked "preferred", then the first normal one, and ignores deprecated ones', async () => {
    stubFetch(artistWith({ person: 'Q3004', movements: [
      { id: 'Q3204', label: 'realism' }, { id: 'Q3205', label: 'impressionism', rank: 'preferred' }, { id: 'Q3206', label: 'cubism', rank: 'deprecated' },
    ] }));
    expect((await artistInfoOf('Info Painter D')).movement).toBe('Impressionism');

    stubFetch(artistWith({ person: 'Q3005', movements: [{ id: 'Q3207', label: 'cubism', rank: 'deprecated' }, { id: 'Q3208', label: 'realism' }] }));
    expect((await artistInfoOf('Info Painter E')).movement).toBe('Realism');

    stubFetch(artistWith({ person: 'Q3006', movements: [{ id: 'Q3209', label: 'cubism', rank: 'deprecated' }] }));
    expect((await artistInfoOf('Info Painter F')).movement).toBe('');
  });

  it('leaves movement empty when Wikidata lists none, and nationalityOf still works', async () => {
    stubFetch(artistWith({ person: 'Q3007', country: 'Q3102', movements: [] }));
    expect(await artistInfoOf('Info Painter G')).toEqual({ nationality: 'Testland', movement: '' });
    stubFetch(artistWith({ person: 'Q3008', country: 'Q3103', movements: [{ id: 'Q3210', label: 'realism' }] }));
    expect(await nationalityOf('Info Painter H')).toBe('Testland');
  });

  it('throws when the movement lookup fails, rather than passing off a partial answer as complete', async () => {
    stubFetch([
      ...artistWith({ person: 'Q3009', country: 'Q3104', movements: [{ id: 'Q3211', label: 'realism' }] }).filter(([matcher]) => !String(matcher).includes('Q3211')),
      [/ids=Q3211\b/, new Error('down')],
    ]);
    await expect(artistInfoOf('Info Painter I')).rejects.toThrow('HTTP 500');
  });

  it('returns empty info for an unknown artist', async () => {
    stubFetch([['wbsearchentities', { search: [] }]]);
    expect(await artistInfoOf('Nobody At All')).toEqual({ nationality: '', movement: '' });
  });
});

describe('Wikidata work movement', () => {
  /** A search that finds items with the given descriptions, and entities with the given movement claim. */
  function workRoutes(opts: { search: { id: string; description: string }[]; entity?: { id: string; movementId?: string; rank?: string }; labels?: Record<string, string> }): Parameters<typeof stubFetch>[0] {
    const routes: Parameters<typeof stubFetch>[0] = [['wbsearchentities', { search: opts.search }]];
    if (opts.entity) {
      const { id, movementId, rank = 'normal' } = opts.entity;
      const claims = movementId ? { P135: [{ rank, mainsnak: { datavalue: { value: { id: movementId } } } }] } : {};
      routes.push([new RegExp(`ids=${id}\\b`), { entities: { [id]: { claims } } }]);
    }
    for (const [id, label] of Object.entries(opts.labels ?? {})) {
      routes.push([new RegExp(`ids=${id}\\b`), { entities: { [id]: { labels: { en: { value: label } } } } }]);
    }
    return routes;
  }

  it("reads the movement from the artwork's own item", async () => {
    stubFetch(workRoutes({
      search: [{ id: 'Q4001', description: 'film' }, { id: 'Q4002', description: 'painting by Édouard Manet' }],
      entity: { id: 'Q4002', movementId: 'Q4101' }, labels: { Q4101: 'realism' },
    }));
    expect(await workMovementOf('Luncheon on the Grass', 'Edouard Manet')).toBe('Realism');
  });

  it('requires the description to be an artwork by that artist', async () => {
    const calls = stubFetch(workRoutes({ search: [{ id: 'Q4003', description: 'painting by John Smith' }, { id: 'Q4004', description: 'novel by Édouard Manet' }] }));
    expect(await workMovementOf('Olympia', 'Édouard Manet')).toBe('');
    expect(calls.some((call) => /ids=Q400[34]/.test(call))).toBe(false);
  });

  it('returns "" when the artwork has no movement or the input is empty, and throws when the search fails', async () => {
    stubFetch(workRoutes({ search: [{ id: 'Q4005', description: 'painting by Edgar Degas' }], entity: { id: 'Q4005' } }));
    expect(await workMovementOf('Some Dancers', 'Edgar Degas')).toBe('');
    stubFetch([['wbsearchentities', new Error('down')]]);
    await expect(workMovementOf('Some Dancers', 'Edgar Degas')).rejects.toThrow('HTTP 500');
    expect(await workMovementOf('', 'Edgar Degas')).toBe('');
    expect(await workMovementOf('Some Dancers', '')).toBe('');
  });

  it('ignores a parenthetical subtitle when searching', async () => {
    const calls = stubFetch(workRoutes({ search: [] }));
    await workMovementOf('The Slave Ship (Slavers Throwing Overboard the Dead and Dying)', 'J.M.W. Turner');
    expect(calls[0]).toContain('search=The+Slave+Ship&');
  });

  it('drops a nationality prefix from movement labels', async () => {
    stubFetch(workRoutes({
      search: [{ id: 'Q4006', description: 'painting by Gustave Courbet' }],
      entity: { id: 'Q4006', movementId: 'Q4106' }, labels: { Q4106: 'French realism' },
    }));
    expect(await workMovementOf('The Stone Breakers', 'Gustave Courbet')).toBe('Realism');
    stubFetch(workRoutes({
      search: [{ id: 'Q4007', description: 'painting by Caspar David Friedrich' }],
      entity: { id: 'Q4007', movementId: 'Q4107' }, labels: { Q4107: 'german romanticism' },
    }));
    expect(await workMovementOf('Monk by the Sea', 'Caspar David Friedrich')).toBe('Romanticism');
  });

  it('keeps movements that merely start with a country-like word out of the strip list', async () => {
    stubFetch(workRoutes({
      search: [{ id: 'Q4008', description: 'painting by Thomas Cole' }],
      entity: { id: 'Q4008', movementId: 'Q4108' }, labels: { Q4108: 'Hudson River School' },
    }));
    expect(await workMovementOf('The Oxbow', 'Thomas Cole')).toBe('Hudson River School');
  });
});

describe('Wikidata request retries', () => {
  it('does not retry a 404 (it cannot succeed), but does retry a server error', async () => {
    const missing = stubFetch([]); // every URL is a 404
    expect(await nationalityOf('Four Oh Four')).toBe('');
    expect(missing.filter((call) => call.includes('wbsearchentities'))).toHaveLength(1);

    const broken = stubFetch([['wbsearchentities', new Error('server error')]]);
    await expect(nationalityOf('Five Hundred')).rejects.toThrow('HTTP 500');
    expect(broken.filter((call) => call.includes('wbsearchentities'))).toHaveLength(2);
  });
});
