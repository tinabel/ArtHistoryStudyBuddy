/**
 * @jest-environment jsdom
 */
import { parseExamMarkdown, parseReading } from '../src/renderer/js/markdown.js';
import { importExam } from '../src/renderer/js/services/importer.js';
import { completeReading, findReading, readingFromLink } from '../src/renderer/js/services/readings.js';
import { searchReadings } from '../src/renderer/js/services/readingSearch.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

const PARAGRAPH = 'This paragraph is long enough to count as real writing rather than a menu or a caption on a page.';
const page = (title: string, body = PARAGRAPH): string => `<html><head><title>${title}</title></head><body><article><p>${body}</p></article></body></html>`;

const GUTENBERG_BOOKS = { results: [
  { id: 84, title: 'Frankenstein; or, The modern Prometheus', authors: [{ name: 'Shelley, Mary Wollstonecraft' }],
    formats: { 'text/html': 'https://www.gutenberg.org/ebooks/84.html.images', 'text/plain; charset=utf-8': 'https://www.gutenberg.org/ebooks/84.txt.utf-8' } },
  { id: 1, title: 'No Text Edition', authors: [], formats: {} },
] };
const BOOK_TEXT = `Licence.\n\n*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***\n\n${'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. '.repeat(2)}`;

/** window.api.fetchText that answers from a table of address -> text, and rejects for anything else. */
function stubDownloads(table: Record<string, string>): string[] {
  const asked: string[] = [];
  window.api = {
    fetchText: jest.fn((address: string) => {
      asked.push(address);
      const hit = Object.entries(table).find(([part]) => address.includes(part));
      return hit ? Promise.resolve({ text: hit[1], url: address }) : Promise.reject(new Error("Error invoking remote method 'fetch-text': Error: That address is not on the public internet."));
    }),
  } as unknown as typeof window.api;
  return asked;
}

afterEach(restoreFetch);

describe('parseReading', () => {
  it.each([
    ['Ways of Seeing by John Berger', { title: 'Ways of Seeing', author: 'John Berger', link: '' }],
    ['Ways of Seeing, John Berger', { title: 'Ways of Seeing', author: 'John Berger', link: '' }],
    ['**Ways of Seeing**, John Berger (pp. 7-34)', { title: 'Ways of Seeing', author: 'John Berger', link: '' }],
    ['Ways of Seeing', { title: 'Ways of Seeing', author: '', link: '' }],
    ['[Ways of Seeing](https://example.org/wos)', { title: 'Ways of Seeing', author: '', link: 'https://example.org/wos' }],
    ['[Ways of Seeing](https://example.org/wos), John Berger', { title: 'Ways of Seeing', author: 'John Berger', link: 'https://example.org/wos' }],
    ['https://example.org/essay', { title: '', author: '', link: 'https://example.org/essay' }],
  ])('reads %s', (line, expected) => {
    expect(parseReading(line)).toEqual(expected);
  });
});

describe('parseExamMarkdown readings', () => {
  it('reads a Readings section next to Artworks and Terms (and the older "Must Know" headings)', () => {
    const parsed = parseExamMarkdown([
      '# Exam', '## Readings', '- Ways of Seeing by John Berger', '- [The Sublime](https://example.org/sublime)',
      '## Artworks', '- Leonardo, Mona Lisa, 1503',
      '## Terms', '- Sfumato',
      '## Must Know Readings', '- Orientalism, Edward Said',
    ].join('\n'));
    expect(parsed.readings.map((reading) => reading.title)).toEqual(['Ways of Seeing', 'The Sublime', 'Orientalism']);
    expect(parsed.works.map((work) => work.title)).toEqual(['Mona Lisa']);
    expect(parsed.terms.map((term) => term.term)).toEqual(['Sfumato']);
  });
});

describe('reading search', () => {
  it('searches Gutenberg (through the app), the Archive and Wikipedia together and names a place that is down', async () => {
    stubDownloads({ 'gutendex.com': JSON.stringify(GUTENBERG_BOOKS) });
    stubFetch([
      ['archive.org', { response: { docs: [{ identifier: 'frank00shel', title: 'Frankenstein', creator: 'Shelley', description: ['<p>A <b>novel</b>.</p>'] }] } }],
      ['wikipedia.org', new Error('down')],
    ]);
    const { found, failed } = await searchReadings('frankenstein', ['gutenberg', 'archive', 'wikipedia']);
    expect(failed).toEqual(['Wikipedia']);
    const [gutenberg, archive] = found.map((listed) => listed.item);
    expect(gutenberg?.reading).toMatchObject({ id: 'gutenberg-84', author: 'Mary Wollstonecraft Shelley', source: 'https://www.gutenberg.org/ebooks/84', excerpt: '' });
    expect(gutenberg?.textUrl).toBe('https://www.gutenberg.org/ebooks/84.txt.utf-8');
    expect(archive?.reading).toMatchObject({ id: 'archive-frank00shel', title: 'Frankenstein', author: 'Shelley', excerpt: 'A novel.', source: 'https://archive.org/details/frank00shel' });
    expect(found.map((listed) => listed.sourceLabel)).toEqual(['Project Gutenberg', 'Internet Archive', 'Project Gutenberg']);
  });

  it('Wikipedia results carry the opening of the article', async () => {
    stubFetch([['wikipedia.org', { query: { pages: { a: { pageid: 5, index: 1, title: 'Ways of Seeing', extract: 'Ways of Seeing is a 1972 book. It is about art.', fullurl: 'https://en.wikipedia.org/wiki/Ways_of_Seeing' } } } }]]);
    const { found } = await searchReadings('ways of seeing', ['wikipedia']);
    expect(found[0]?.item.reading).toEqual({
      id: 'wikipedia-5', title: 'Ways of Seeing', author: '', excerpt: 'Ways of Seeing is a 1972 book. It is about art.', source: 'https://en.wikipedia.org/wiki/Ways_of_Seeing',
    });
  });
});

describe('completing a reading', () => {
  it('fetches a Gutenberg book and keeps its opening', async () => {
    const asked = stubDownloads({ 'ebooks/84.txt.utf-8': BOOK_TEXT });
    const reading = await completeReading({ reading: { id: 'gutenberg-84', title: 'Frankenstein', author: 'M', excerpt: '', source: 'https://www.gutenberg.org/ebooks/84' }, textUrl: 'https://www.gutenberg.org/ebooks/84.txt.utf-8' });
    expect(asked).toEqual(['https://www.gutenberg.org/ebooks/84.txt.utf-8']);
    expect(reading.excerpt).toContain('You will rejoice to hear');
    expect(reading.excerpt).not.toContain('Licence');
  });

  it('keeps the reading, without text, when the download fails; and does not download when it already has text', async () => {
    const asked = stubDownloads({});
    const candidate = { reading: { id: 'x', title: 'T', author: '', excerpt: '', source: 'https://s' }, textUrl: 'https://www.gutenberg.org/ebooks/1.txt.utf-8' };
    expect((await completeReading(candidate)).excerpt).toBe('');
    expect(await completeReading({ reading: { ...candidate.reading, excerpt: 'Already.' }, textUrl: candidate.textUrl })).toMatchObject({ excerpt: 'Already.' });
    expect(asked).toHaveLength(1);
  });

  it('turns a link into a reading from the page title, author and opening', async () => {
    stubDownloads({ 'example.org/essay': page('An Essay') });
    expect(await readingFromLink('https://example.org/essay')).toEqual({
      id: 'link-https://example.org/essay', title: 'An Essay', author: '', excerpt: PARAGRAPH, source: 'https://example.org/essay',
    });
    expect((await readingFromLink('https://example.org/essay', 'My Title')).title).toBe('My Title');
  });

  it('gives the user the app\'s own message when a page is refused, not the Electron wrapper', async () => {
    stubDownloads({});
    await expect(readingFromLink('https://intranet.example/')).rejects.toThrow('That address is not on the public internet.');
  });
});

describe('findReading', () => {
  it('uses the link in the line, with the title and author the file gave', async () => {
    stubDownloads({ 'example.org/wos': page('Page Title') });
    const { reading, complete } = await findReading({ title: 'Ways of Seeing', author: 'John Berger', link: 'https://example.org/wos' });
    expect(complete).toBe(true);
    expect(reading).toMatchObject({ title: 'Ways of Seeing', author: 'John Berger', source: 'https://example.org/wos', excerpt: PARAGRAPH });
  });

  it('keeps the link, and says it is incomplete, when the page cannot be downloaded', async () => {
    stubDownloads({});
    const { reading, complete } = await findReading({ title: 'Lost', author: '', link: 'https://example.org/gone' });
    expect(complete).toBe(false);
    expect(reading).toMatchObject({ title: 'Lost', source: 'https://example.org/gone', excerpt: '' });
  });

  it('searches by title and author, preferring a result whose title matches', async () => {
    stubDownloads({ 'gutendex.com': JSON.stringify({ results: [] }) });
    stubFetch([
      ['archive.org', { response: { docs: [{ identifier: 'other', title: 'Something Else', description: 'unrelated' }, { identifier: 'wos', title: 'Ways of Seeing', creator: 'Berger, John', description: 'About looking.' }] } }],
      ['wikipedia.org', { query: { pages: {} } }],
    ]);
    const { reading, complete } = await findReading({ title: 'Ways of Seeing', author: 'John Berger', link: '' });
    expect(complete).toBe(true);
    expect(reading).toMatchObject({ id: 'archive-wos', title: 'Ways of Seeing', author: 'John Berger', excerpt: 'About looking.' });
  });

  it('keeps the title as the file wrote it, not the catalogue\'s spelling of it', async () => {
    stubDownloads({ 'gutendex.com': JSON.stringify({ results: [] }) });
    stubFetch([['archive.org', { response: { docs: [{ identifier: 'wos', title: 'WAYS OF SEEING (1972)', description: 'About looking.' }] } }], ['wikipedia.org', { query: { pages: {} } }]]);
    expect((await findReading({ title: 'Ways of Seeing', author: '', link: '' })).reading.title).toBe('Ways of Seeing');
  });

  it('names a bare link that cannot be downloaded by its host', async () => {
    stubDownloads({});
    const { reading } = await findReading({ title: '', author: '', link: 'https://www.example.org/some/page' });
    expect(reading).toMatchObject({ title: 'www.example.org', source: 'https://www.example.org/some/page', excerpt: '' });
  });

  it('keeps just the title and author when nothing is found', async () => {
    stubDownloads({ 'gutendex.com': JSON.stringify({ results: [] }) });
    stubFetch([['archive.org', { response: { docs: [] } }], ['wikipedia.org', { query: { pages: {} } }]]);
    const { reading, complete } = await findReading({ title: 'Obscure Pamphlet', author: 'Nobody', link: '' });
    expect(complete).toBe(false);
    expect(reading).toEqual({ id: 'text-Obscure Pamphlet|Nobody', title: 'Obscure Pamphlet', author: 'Nobody', excerpt: '', source: '' });
  });
});

describe('importExam readings', () => {
  it('imports the Readings section, reporting the ones it could not find anything for', async () => {
    stubDownloads({ 'example.org/essay': page('The Essay') });
    stubFetch([['archive.org', { response: { docs: [] } }], ['wikipedia.org', { query: { pages: {} } }], ['gutendex.com', { results: [] }]]);
    const result = await importExam('## Readings\n- [The Essay](https://example.org/essay)\n- Unfindable Tract by Nobody');
    expect(result.readings.map((reading) => reading.title)).toEqual(['The Essay', 'Unfindable Tract']);
    expect(result.noText).toEqual(['Unfindable Tract']);
  });
});
