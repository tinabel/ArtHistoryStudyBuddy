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
    expect(await findWorkImage({ artist: 'J.A.D. Ingres', title: 'Large Odalisque' })).toEqual({ image: 'thumb.jpg', source: 'https://commons/desc' });
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
    expect(await findWorkImage({ artist: 'Edouard Manet', title: 'Olympia' })).toEqual({ image: 'met.jpg', source: 'https://met/1' });
  });

  it('returns empty strings when nothing is found', async () => {
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }], ['/search', { objectIDs: [] }]]);
    expect(await findWorkImage({ artist: 'Nobody', title: 'Nothing' })).toEqual({ image: '', source: '' });
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
    expect(calls.filter((call) => call.includes('wbsearchentities'))).toHaveLength(1);
    expect(await lookupArtistInfo('')).toEqual({ nationality: '', movement: '' });
  });
});

describe('enrichWorks', () => {
  const work = (over: Partial<Work>): Work => ({ id: 1, title: 'T', artist: 'A', date: '1800', image: '', ...over });

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
    const markdown = [
      '# Course Exam', '## Must Know Works', '- Gustave Courbet, The Stone Breakers, 1849 (p. 1012)',
      '## Must Know Terms', '- Realism', '- Sublime: given definition',
    ].join('\n');
    const messages: string[] = [];
    const result = await importExam(markdown, (message) => messages.push(message));

    expect(result.title).toBe('Course Exam');
    expect(result.terms).toEqual([
      { term: 'Realism', definition: 'Auto definition. More text.', source: 'https://en.wikipedia.org/wiki/Realism' },
      { term: 'Sublime', definition: 'given definition', source: '' },
    ]);
    expect(result.works).toEqual([{
      id: 'md-Gustave Courbet|The Stone Breakers', title: 'The Stone Breakers', artist: 'Gustave Courbet',
      nationality: 'Testish', movement: 'Realism', date: '1849', image: 'thumb.jpg', source: 'https://commons/desc',
    }]);
    expect(result.noImage).toEqual([]);
    expect(messages.some((message) => message.includes('Defining term 1/2'))).toBe(true);
    expect(messages.some((message) => message.includes('Looking up work 1/1'))).toBe(true);
  });

  it('a movement written in the markdown overrides the Wikidata one', async () => {
    stubFetch([
      commonsHit('File:Delacroix Liberty.jpg'),
      ...artist('Eug.+ne\\+Delacroix|Delacroix', 'Q507', 'Q607', { id: 'Q907', label: 'romanticism' }),
    ]);
    const markdown = '## Must Know Works\n- Eugène Delacroix, Liberty Leading the People, 1830 (movement: Orientalism)';
    const result = await importExam(markdown);
    expect(result.works[0]?.movement).toBe('Orientalism');
  });

  it('keeps works it cannot find an image for, and reports them', async () => {
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }], ['/search', { objectIDs: [] }], ['wbsearchentities', { search: [] }]]);
    const result = await importExam('## Must Know Works\n- Unknown Painter, Lost Painting, 1700');
    expect(result.works).toHaveLength(1);
    expect(result.works[0]).toMatchObject({ image: '', nationality: '', movement: '' });
    expect(result.noImage).toEqual(['Lost Painting']);
  });

  it('returns empty content for an empty file', async () => {
    stubFetch([]);
    expect(await importExam('')).toEqual({ title: '', terms: [], works: [], noImage: [], badImage: [] });
  });

  describe('pictures given in the file', () => {
    const markdown = [
      '## Must Know Works',
      '- Gustave Courbet, The Stone Breakers, 1849 ![](stone.jpg)',
      '- Édouard Manet, Olympia, 1863 ![](https://example.org/olympia.jpg) (movement: Realism)',
    ].join('\n');

    it('uses the resolved picture instead of searching for one', async () => {
      const calls = stubFetch([['wbsearchentities', { search: [] }]]);
      const resolveImage = jest.fn((target: string) => Promise.resolve(`resolved:${target}`));
      const result = await importExam(markdown, undefined, resolveImage);
      expect(result.works.map((work) => work.image)).toEqual(['resolved:stone.jpg', 'resolved:https://example.org/olympia.jpg']);
      expect(result.works[1]).toMatchObject({ title: 'Olympia', movement: 'Realism' });
      expect(result.noImage).toEqual([]);
      expect(result.badImage).toEqual([]);
      expect(calls.some((call) => call.includes('commons.wikimedia.org'))).toBe(false);
    });

    it('searches instead, and reports the work, when the picture cannot be used', async () => {
      stubFetch([commonsHit('File:Courbet Stone Breakers.jpg'), ['wbsearchentities', { search: [] }]]);
      const result = await importExam(markdown.split('\n').slice(0, 2).join('\n'), undefined, () => Promise.reject(new Error('missing')));
      expect(result.works[0]?.image).toBe('thumb.jpg');
      expect(result.badImage).toEqual(['The Stone Breakers']);
    });
  });
});
