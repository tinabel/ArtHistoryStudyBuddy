// Internet Archive (https://archive.org) text search. No key needed.
import type { ReadingCandidate } from '../types.js';
import { getJson } from './http.js';
import { plainText, shorten } from '../textExtract.js';

const SEARCH = 'https://archive.org/advancedsearch.php';

interface ArchiveItem {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  /** Often HTML, sometimes a list of paragraphs. */
  description?: string | string[];
}

/** The archive gives some fields as a list when there are several values. */
const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));

const toCandidate = (item: ArchiveItem): ReadingCandidate => ({
  reading: {
    id: `archive-${item.identifier}`,
    title: first(item.title),
    author: first(item.creator),
    excerpt: shorten(plainText(Array.isArray(item.description) ? item.description.join(' ') : (item.description ?? ''))),
    source: `https://archive.org/details/${encodeURIComponent(item.identifier)}`,
  },
});

/** Books and articles whose title or author matches; the most downloaded first. */
export async function searchReadings(query: string, limit: number): Promise<ReadingCandidate[]> {
  const terms = query.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim(); // the search has its own syntax: keep to plain words
  const result = await getJson<{ response?: { docs?: ArchiveItem[] } }>(SEARCH, {
    q: `(title:(${terms}) OR creator:(${terms})) AND mediatype:texts`,
    fl: 'identifier,title,creator,description', rows: String(limit), 'sort[]': 'downloads desc', output: 'json',
  });
  return (result.response?.docs ?? []).filter((item) => first(item.title)).map(toCandidate);
}
