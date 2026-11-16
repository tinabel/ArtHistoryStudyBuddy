// Project Gutenberg, searched through Gutendex (https://gutendex.com), a free catalogue of its books. No key needed.
// Gutendex does not allow the page to ask it directly (no CORS), so the request goes through the main process.
import type { ReadingCandidate } from '../types.js';

const SEARCH = 'https://gutendex.com/books/';

interface GutendexBook {
  id: number;
  title?: string;
  authors?: { name?: string }[];
  /** Download addresses by file type, e.g. "text/plain; charset=utf-8". */
  formats?: Record<string, string>;
}

/** "Shelley, Mary Wollstonecraft" -> "Mary Wollstonecraft Shelley". */
const readableName = (name: string): string => {
  const [last = '', first = ''] = name.split(/,\s*/, 2);
  return first ? `${first} ${last}` : last;
};

const toCandidate = (book: GutendexBook): ReadingCandidate => {
  const plainText = Object.entries(book.formats ?? {}).find(([type]) => type.startsWith('text/plain'))?.[1];
  return {
    reading: {
      id: `gutenberg-${book.id}`,
      title: book.title ?? '',
      author: readableName(book.authors?.[0]?.name ?? ''),
      excerpt: '', // the catalogue has no text: it comes from `textUrl` when the book is added
      source: `https://www.gutenberg.org/ebooks/${book.id}`,
    },
    ...(plainText?.startsWith('https://') ? { textUrl: plainText } : {}),
  };
};

/** Free-text search of titles and authors; returns up to `limit` books. */
export async function searchReadings(query: string, limit: number): Promise<ReadingCandidate[]> {
  const { text } = await window.api.fetchText(`${SEARCH}?${new URLSearchParams({ search: query }).toString()}`);
  const { results = [] } = JSON.parse(text) as { results?: GutendexBook[] };
  return results.filter((book) => book.title).slice(0, limit).map(toCandidate);
}
