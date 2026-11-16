// Cleveland Museum of Art Open Access API client (https://openaccess-api.clevelandart.org). No key needed.
import type { Work } from '../types.js';
import { getJson } from './http.js';

const SEARCH = 'https://openaccess-api.clevelandart.org/api/artworks/';

interface ClevelandArtwork {
  id: number;
  title?: string | null;
  creation_date?: string | null;
  url?: string | null;
  /** `description` reads like "Claude Monet (French, 1840–1926)". */
  creators?: { description?: string | null }[];
  images?: { web?: { url?: string | null } | null } | null;
}

/** "Claude Monet (French, 1840–1926)" -> name "Claude Monet", nationality "French". */
function parseCreator(description: string): { artist: string; nationality?: string } {
  const match = /^(.*?)\s*\(([^,)]*)[,)]/.exec(description);
  if (!match) return { artist: description.trim() };
  const nationality = (match[2] ?? '').trim();
  // Without a nationality the bracket holds only dates, e.g. "(1840–1926)".
  return /\d/.test(nationality) ? { artist: (match[1] ?? '').trim() } : { artist: (match[1] ?? '').trim(), nationality };
}

const toWork = (artwork: ClevelandArtwork): Work => ({
  id: `cleveland-${artwork.id}`, // prefixed so it can't collide with another museum's numbering
  title: artwork.title ?? '',
  ...parseCreator(artwork.creators?.[0]?.description ?? ''),
  date: artwork.creation_date ?? '',
  image: artwork.images?.web?.url ?? '',
  source: artwork.url ?? '',
});

/** Free-text search; returns up to `limit` works that have an image. */
export async function searchWorks(query: string, limit: number): Promise<Work[]> {
  const result = await getJson<{ data?: ClevelandArtwork[] }>(SEARCH, {
    q: query, has_image: '1', limit: String(limit), fields: 'id,title,creators,creation_date,images,url',
  });
  return (result.data ?? []).map(toWork).filter((work) => work.image);
}
