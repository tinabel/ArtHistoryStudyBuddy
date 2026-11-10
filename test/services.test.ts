import { findWorkImage } from '../src/renderer/js/services/imageFinder.js';
import { importExam } from '../src/renderer/js/services/importer.js';
import { enrichWorks, lookupArtistInfo } from '../src/renderer/js/services/workInfo.js';
import type { Work } from '../src/renderer/js/types.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

afterEach(restoreFetch);

type Routes = Parameters<typeof stubFetch>[0];

const commonsHit = (title = 'File:Odalisque Ingres.jpg'): Routes[number] => ['commons.wikimedia.org', {
  query: { pages: { a: { index: 1, title, imageinfo: [{ thumburl: 'thumb.jpg', descriptionurl: 'https://commons/desc' }] } } },
}];

/**
 * Wikidata routes for one artist: name -> person id -> country id -> demonym "Testish",
 * and (optionally) movement id -> label.
 */
function artist(nameInSearch: string, personId: string, countryId: string, movement?: { id: string; label: string }): Routes {
  const claims: Record<string, unknown> = { P27: [{ mainsnak: { datavalue: { value: { id: countryId } } } }] };
  if (movement) claims.P135 = [{ rank: 'normal', mainsnak: { datavalue: { value: { id: movement.id } } } }];
  return [
    [new RegExp(`search=${nameInSearch}&`), { search: [{ id: personId, description: 'painter' }] }],
    [new RegExp(`ids=${personId}\\b`), { entities: { [personId]: { claims } } }],
    [new RegExp(`ids=${countryId}\\b`), { entities: { [countryId]: { claims: { P1549: [{ mainsnak: { datavalue: { value: { text: 'Testish', language: 'en' } } } }] }, labels: {} } } }],
    ...(movement ? [[new RegExp(`ids=${movement.id}\\b`), { entities: { [movement.id]: { labels: { en: { value: movement.label } } } } }] as Routes[number]] : []),
  ];
}

describe('findWorkImage', () => {
  it('uses Commons first', async () => {
    stubFetch([commonsHit()]);
    expect(await findWorkImage({ artist: 'J.A.D. Ingres', title: 'Large Odalisque' })).toEqual({ img: 'thumb.jpg', src: 'https://commons/desc' });
  });

  it('queries with the title (parentheticals removed) and the artist surname', async () => {
    const calls = stubFetch([commonsHit()]);
    await findWorkImage({ artist: 'J.M.W. Turner', title: 'The Slave Ship (Slavers Throwing Overboard)' });
    expect(decodeURIComponent(calls[0] ?? '').replace(/\+/g, ' ')).toContain('gsrsearch=The Slave Ship turner');
  });

  it('falls back to the Met, matching on the artist', async () => {
    stubFetch([
      ['commons.wikimedia.org', { batchcomplete: '' }],
      ['/objects/1', { objectID: 1, title: 'Olympia', artistDisplayName: 'Edouard Manet', primaryImageSmall: 'met.jpg', objectURL: 'https://met/1' }],
      ['/search', { objectIDs: [1] }],
    ]);
    expect(await findWorkImage({ artist: 'Edouard Manet', title: 'Olympia' })).toEqual({ img: 'met.jpg', src: 'https://met/1' });
  });

  it('returns empty strings when nothing is found', async () => {
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }], ['/search', { objectIDs: [] }]]);
    expect(await findWorkImage({ artist: 'Nobody', title: 'Nothing' })).toEqual({ img: '', src: '' });
  });
});

describe('lookupArtistInfo', () => {
  // Distinct artist names per test: lookups are cached for the session.
  it('resolves nationality and movement, and caches the result', async () => {
    const calls = stubFetch(artist('Cache\\+Tester', 'Q501', 'Q601', { id: 'Q901', label: 'romanticism' }));
    expect(await lookupArtistInfo('Cache Tester')).toEqual({ nationality: 'Testish', movement: 'Romanticism' });
    const afterFirst = calls.length;
    expect(await lookupArtistInfo('Cache Tester')).toEqual({ nationality: 'Testish', movement: 'Romanticism' });
    expect(calls).toHaveLength(afterFirst);
  });

  it('leaves movement empty when Wikidata has none', async () => {
    stubFetch(artist('No\\+Movement', 'Q504', 'Q604'));
    expect(await lookupArtistInfo('No Movement')).toEqual({ nationality: 'Testish', movement: '' });
  });

  it('retries with the surname when the name has initials', async () => {
    stubFetch([['search=A.B.+Initialed', { search: [] }], ...artist('Initialed', 'Q502', 'Q602')]);
    expect((await lookupArtistInfo('A.B. Initialed'))?.nationality).toBe('Testish');
  });

  it('does not retry plain names, and handles empty input', async () => {
    const calls = stubFetch([['wbsearchentities', { search: [] }]]);
    expect(await lookupArtistInfo('Plain Person')).toEqual({ nationality: '', movement: '' });
    expect(calls.filter((c) => c.includes('wbsearchentities'))).toHaveLength(1);
    expect(await lookupArtistInfo('')).toEqual({ nationality: '', movement: '' });
  });
});

describe('enrichWorks', () => {
  const work = (over: Partial<Work>): Work => ({ id: 1, title: 'T', artist: 'A', date: '1800', img: '', ...over });

  it('fills in a missing nationality and movement, and reports each change', async () => {
    stubFetch(artist('Enrich\\+One', 'Q505', 'Q605', { id: 'Q905', label: 'realism' }));
    const works = [work({ artist: 'Enrich One' })];
    const onChange = jest.fn();
    await enrichWorks(works, onChange);
    expect(works[0]).toMatchObject({ nationality: 'Testish', movement: 'Realism' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('only fills what is missing, keeping values already set (including "")', async () => {
    stubFetch(artist('Enrich\\+Two', 'Q506', 'Q606', { id: 'Q906', label: 'cubism' }));
    const works = [work({ artist: 'Enrich Two', nationality: 'Custom' }), work({ id: 2, artist: 'Enrich Two', movement: '' })];
    await enrichWorks(works, () => undefined);
    expect(works[0]).toMatchObject({ nationality: 'Custom', movement: 'Cubism' });
    expect(works[1]).toMatchObject({ nationality: 'Testish', movement: '' });
  });

  it('makes no requests for complete works or works without an artist', async () => {
    const calls = stubFetch([]);
    const onChange = jest.fn();
    await enrichWorks([work({ nationality: 'French', movement: 'Realism' }), work({ artist: '' })], onChange);
    expect(calls).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('records "" when the artist cannot be found, so it is not looked up again', async () => {
    stubFetch([['wbsearchentities', { search: [] }]]);
    const works = [work({ artist: 'Unfindable Person' })];
    await enrichWorks(works, () => undefined);
    expect(works[0]).toMatchObject({ nationality: '', movement: '' });
  });
});

describe('importExam', () => {
  it('assembles terms and works from markdown', async () => {
    stubFetch([
      ['rest_v1/page/summary', { extract: 'Auto definition. More text.' }],
      ['list=search', { query: { search: [{ title: 'Realism' }] } }],
      commonsHit('File:Courbet Stone Breakers.jpg'),
      ...artist('Gustave\\+Courbet', 'Q503', 'Q603', { id: 'Q903', label: 'realism' }),
    ]);
    const md = [
      '# Course Exam', '## Must Know Works', '- Gustave Courbet, The Stone Breakers, 1849 (p. 1012)',
      '## Must Know Terms', '- Realism', '- Sublime: given definition',
    ].join('\n');
    const messages: string[] = [];
    const result = await importExam(md, (m) => messages.push(m));

    expect(result.title).toBe('Course Exam');
    expect(result.terms).toEqual([
      { term: 'Realism', def: 'Auto definition. More text.', src: 'https://en.wikipedia.org/wiki/Realism' },
      { term: 'Sublime', def: 'given definition', src: '' },
    ]);
    expect(result.works).toEqual([{
      id: 'md-Gustave Courbet|The Stone Breakers', title: 'The Stone Breakers', artist: 'Gustave Courbet',
      nationality: 'Testish', movement: 'Realism', date: '1849', img: 'thumb.jpg', src: 'https://commons/desc',
    }]);
    expect(result.noImage).toEqual([]);
    expect(messages.some((m) => m.includes('Defining term 1/2'))).toBe(true);
    expect(messages.some((m) => m.includes('Looking up work 1/1'))).toBe(true);
  });

  it('a movement written in the markdown overrides the Wikidata one', async () => {
    stubFetch([
      commonsHit('File:Delacroix Liberty.jpg'),
      ...artist('Eug.+ne\\+Delacroix|Delacroix', 'Q507', 'Q607', { id: 'Q907', label: 'romanticism' }),
    ]);
    const md = '## Must Know Works\n- Eugène Delacroix, Liberty Leading the People, 1830 (movement: Orientalism)';
    const result = await importExam(md);
    expect(result.works[0]?.movement).toBe('Orientalism');
  });

  it('keeps works it cannot find an image for, and reports them', async () => {
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }], ['/search', { objectIDs: [] }], ['wbsearchentities', { search: [] }]]);
    const result = await importExam('## Must Know Works\n- Unknown Painter, Lost Painting, 1700');
    expect(result.works).toHaveLength(1);
    expect(result.works[0]).toMatchObject({ img: '', nationality: '', movement: '' });
    expect(result.noImage).toEqual(['Lost Painting']);
  });

  it('returns empty content for an empty file', async () => {
    stubFetch([]);
    expect(await importExam('')).toEqual({ title: '', terms: [], works: [], noImage: [] });
  });
});
