import * as artic from '../src/renderer/js/api/artic.js';
import * as cleveland from '../src/renderer/js/api/cleveland.js';
import * as wikipedia from '../src/renderer/js/api/wikipedia.js';
import { searchWorks, WORK_SOURCES } from '../src/renderer/js/services/workSearch.js';
import { showsWholeWork } from '../src/renderer/js/util.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

afterEach(restoreFetch);

describe('Art Institute of Chicago', () => {
  it('maps results to works with a prefixed id and IIIF image, dropping ones without an image', async () => {
    const calls = stubFetch([['api.artic.edu', { data: [
      { id: 1, title: 'Water Lilies', artist_title: 'Claude Monet', date_display: '1906', image_id: 'abc' },
      { id: 2, title: 'No picture', image_id: null },
    ] }]]);
    const works = await artic.searchWorks('monet', 6);
    expect(calls[0]).toContain('q=monet');
    expect(works).toEqual([{
      id: 'artic-1', title: 'Water Lilies', artist: 'Claude Monet', date: '1906',
      image: 'https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg', source: 'https://www.artic.edu/artworks/1',
    }]);
  });
});

describe('Cleveland Museum of Art', () => {
  it('splits the creator into name and nationality and drops works without an image', async () => {
    stubFetch([['clevelandart.org', { data: [
      { id: 9, title: 'Water Lilies', creation_date: '1914', url: 'https://cma/9', creators: [{ description: 'Claude Monet (French, 1840–1926)' }], images: { web: { url: 'w.jpg' } } },
      { id: 10, title: 'Dates only', creators: [{ description: 'Unknown (1840–1926)' }], images: { web: { url: 'd.jpg' } } },
      { id: 11, title: 'No picture', images: null },
    ] }]]);
    const works = await cleveland.searchWorks('monet', 6);
    expect(works).toHaveLength(2);
    expect(works[0]).toMatchObject({ id: 'cleveland-9', artist: 'Claude Monet', nationality: 'French', image: 'w.jpg' });
    expect(works[1]).toMatchObject({ artist: 'Unknown' });
    expect(works[1]?.nationality).toBeUndefined();
  });
});

describe('Wikipedia work search', () => {
  it('keeps articles with a picture, drops people, reads artist and date from the summary', async () => {
    stubFetch([['wikipedia.org', { query: { pages: {
      a: { pageid: 1, index: 2, title: 'Olympia (Manet)', description: '1863 painting by Édouard Manet', thumbnail: { source: 'o.jpg' }, fullurl: 'https://w/o' },
      b: { pageid: 2, index: 1, title: 'Édouard Manet', description: 'French painter (1832–1883)', thumbnail: { source: 'm.jpg' } },
      c: { pageid: 3, index: 3, title: 'No picture', description: 'painting' },
    } } }]]);
    expect(await wikipedia.searchWorks('olympia', 6)).toEqual([
      { id: 'wikipedia-1', title: 'Olympia', artist: 'Édouard Manet', date: '1863', image: 'o.jpg', source: 'https://w/o' },
    ]);
  });
});

describe('showsWholeWork', () => {
  it.each(['Detail of Water Lilies', 'File:Mona_Lisa_crop.jpg', 'Study for The Kiss', 'Close-up of face'])('flags %s', (name) => {
    expect(showsWholeWork(name)).toBe(false);
  });
  it('accepts a normal title', () => {
    expect(showsWholeWork('Water Lilies')).toBe(true);
  });
});

describe('searchWorks service', () => {
  it('lists sources by id', () => {
    expect(WORK_SOURCES.map((source) => source.id)).toEqual(['met', 'artic', 'cleveland', 'wikipedia']);
  });

  it('searches only ticked sources, de-dupes, puts whole works first, and reports failures', async () => {
    stubFetch([
      ['api.artic.edu', { data: [
        { id: 1, title: 'Detail of Haystacks', artist_title: 'Claude Monet', image_id: 'a' },
        { id: 2, title: 'Haystacks', artist_title: 'Claude Monet', image_id: 'b' },
      ] }],
      ['clevelandart.org', new Error('down')],
    ]);
    const outcome = await searchWorks('haystacks', ['artic', 'cleveland']);
    expect(outcome.failed).toEqual(['Cleveland Museum of Art']);
    expect(outcome.found.map((found) => found.work.title)).toEqual(['Haystacks', 'Detail of Haystacks']);
    expect(outcome.found[0]?.sourceLabel).toBe('Art Institute of Chicago');
  });
});
