// What we know about a work beyond its image: the artist's nationality and the work's art movement,
// both from Wikidata. The movement comes from the artwork's own item when it has one, else from the artist's.
//
// Lookups never throw. They return `null` when Wikidata couldn't be reached, which is different from
// `{ nationality: '', movement: '' }` ("asked, and it doesn't know"). Callers must not save a null result,
// so the next study session tries again.
import { artistInfoOf, workMovementOf, type ArtistInfo } from '../api/wikidata.js';
import type { Work } from '../types.js';

export type { ArtistInfo };

const HAS_INITIALS = /\b\p{Lu}\.\s?/u; // "J.A.D. Ingres"

const artistCache = new Map<string, Promise<ArtistInfo | null>>();
const workCache = new Map<string, Promise<ArtistInfo | null>>();

/** Runs `lookup` once per key. A failed lookup (null) is forgotten, so the next call retries. */
function remember(
  cache: Map<string, Promise<ArtistInfo | null>>, key: string, lookup: () => Promise<ArtistInfo>,
): Promise<ArtistInfo | null> {
  let result = cache.get(key);
  if (!result) {
    const attempt = lookup().catch(() => null);
    result = attempt;
    cache.set(key, attempt);
    void attempt.then((info) => { if (info === null && cache.get(key) === attempt) cache.delete(key); });
  }
  return result;
}

async function fetchArtistInfo(artist: string): Promise<ArtistInfo> {
  const full = await artistInfoOf(artist);
  if (full.nationality || full.movement || !HAS_INITIALS.test(artist)) return full;
  // Initials rarely match Wikidata labels; retry with the surname alone.
  return artistInfoOf(artist.split(/\s+/).pop() ?? '');
}

/** Nationality and movement for an artist (cached: many works share one). */
export function lookupArtistInfo(artist: string): Promise<ArtistInfo | null> {
  if (!artist) return Promise.resolve({ nationality: '', movement: '' });
  return remember(artistCache, artist, () => fetchArtistInfo(artist));
}

/** Nationality and movement for one work. */
export function lookupWorkInfo(work: { artist: string; title: string }): Promise<ArtistInfo | null> {
  if (!work.artist) return Promise.resolve({ nationality: '', movement: '' });
  return remember(workCache, `${work.artist}|${work.title}`, async () => {
    const fromArtist = await lookupArtistInfo(work.artist);
    if (!fromArtist) throw new Error('artist lookup failed');
    const own = await workMovementOf(work.title, work.artist);
    return { nationality: fromArtist.nationality, movement: own || fromArtist.movement };
  });
}

/**
 * Fills in nationality / movement that works saved by older versions are missing, one work at a time,
 * calling `onChange` after each fill-in so the caller can save. Works with nothing missing cost nothing.
 */
export async function enrichWorks(works: readonly Work[], onChange: () => void): Promise<void> {
  for (const work of works) {
    if (!work.artist || (work.nationality !== undefined && work.movement !== undefined)) continue;
    const info = await lookupWorkInfo(work);
    if (!info) continue; // couldn't ask: leave the work unfilled so the next study session retries
    work.nationality ??= info.nationality;
    work.movement ??= info.movement;
    onChange();
  }
}
