// Art Institute of Chicago API client (https://api.artic.edu/docs). No key needed.
import type { Work } from '../types.js';
import { getJson } from './http.js';

const SEARCH = 'https://api.artic.edu/api/v1/artworks/search';
const IMAGE_WIDTH = 843; // the size the museum asks apps to use, so its servers can reuse stored copies

interface ArticArtwork {
  id: number;
  title?: string | null;
  artist_title?: string | null;
  date_display?: string | null;
  image_id?: string | null;
}

const toWork = (artwork: ArticArtwork): Work => ({
  id: `artic-${artwork.id}`, // prefixed so it can't collide with another museum's numbering
  title: artwork.title ?? '',
  artist: artwork.artist_title ?? '',
  date: artwork.date_display ?? '',
  image: `https://www.artic.edu/iiif/2/${encodeURIComponent(artwork.image_id ?? '')}/full/${IMAGE_WIDTH},/0/default.jpg`,
  source: `https://www.artic.edu/artworks/${artwork.id}`,
});

/** Free-text search; returns up to `limit` works that have an image. */
export async function searchWorks(query: string, limit: number): Promise<Work[]> {
  const result = await getJson<{ data?: ArticArtwork[] }>(SEARCH, {
    q: query, limit: String(limit), fields: 'id,title,artist_title,date_display,image_id',
  });
  return (result.data ?? []).filter((artwork) => artwork.image_id).map(toWork);
}
