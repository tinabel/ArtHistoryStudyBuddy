// Wikipedia lookups: term definitions, and artworks (wherever they are kept) for the work search.
import type { Work } from '../types.js';
import { getJson } from './http.js';

const API = 'https://en.wikipedia.org/w/api.php';
const SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const MAX_LENGTH = 320;

export interface Definition {
  definition: string;
  source: string;
}

/** First two sentences of the best-matching article, plus its URL. Empty strings on failure. */
export async function define(term: string): Promise<Definition> {
  const none: Definition = { definition: '', source: '' };
  try {
    const query = term.replace(/,\s*\d{3,4}.*$/, '');
    const search = await getJson<{ query?: { search: { title: string }[] } }>(API, {
      action: 'query', list: 'search', srsearch: `${query} art history`,
      srlimit: '1', format: 'json', origin: '*',
    });
    const title = search.query?.search[0]?.title;
    if (!title) return none;
    const page = await getJson<{ extract?: string }>(SUMMARY + encodeURIComponent(title));
    const sentences = (page.extract ?? '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) ?? [];
    return {
      definition: sentences.slice(0, 2).join('').trim().slice(0, MAX_LENGTH),
      source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch {
    return none;
  }
}

// ---- artwork search ----

const IMAGE_WIDTH = 1000; // pixels: large enough to study from

interface WikipediaPage {
  pageid: number;
  title: string;
  /** Position in the search results, best first. */
  index: number;
  /** A one-line summary, e.g. "1863 painting by Édouard Manet". */
  description?: string;
  thumbnail?: { source: string };
  fullurl?: string;
}

/** "French painter (1832–1883)", "American musician (born 1942)": an article about a person, not a work. */
const DESCRIBES_PERSON = /\((born\s+)?\d{3,4}\b/;

/** An article with a picture becomes a work. The artist and year are read from the summary when it gives them. */
function toWork(page: WikipediaPage): Work {
  const description = page.description ?? '';
  return {
    id: `wikipedia-${page.pageid}`,
    title: page.title.replace(/\s*\([^)]*\)$/, ''), // "Olympia (Manet)" -> "Olympia"
    artist: / by (.+)$/.exec(description)?.[1] ?? '',
    date: /^(?:c\. )?\d{3,4}\b/.exec(description)?.[0] ?? '',
    image: page.thumbnail?.source ?? '',
    source: page.fullurl ?? '',
  };
}

/** Free-text search; returns up to `limit` articles that have a picture and are not about a person. */
export async function searchWorks(query: string, limit: number): Promise<Work[]> {
  const result = await getJson<{ query?: { pages?: Record<string, WikipediaPage> } }>(API, {
    action: 'query', generator: 'search', gsrsearch: query, gsrlimit: String(limit * 2), // some will be filtered out
    prop: 'pageimages|description|info', inprop: 'url', piprop: 'thumbnail', pithumbsize: String(IMAGE_WIDTH),
    format: 'json', origin: '*',
  });
  return Object.values(result.query?.pages ?? {})
    .sort((first, second) => first.index - second.index)
    .filter((page) => page.thumbnail && !DESCRIBES_PERSON.test(page.description ?? ''))
    .slice(0, limit)
    .map(toWork);
}
