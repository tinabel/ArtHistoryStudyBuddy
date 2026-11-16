// Wikimedia Commons image search.
import type { WorkImage } from '../types.js';
import { showsWholeWork } from '../util.js';
import { getJson } from './http.js';

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

interface CommonsPage {
  index: number;
  title: string;
  imageinfo?: { thumburl?: string; descriptionurl?: string }[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

/**
 * Best-matching JPEG/PNG for `query`, preferring files that show the whole work (not a detail) and whose name
 * contains `surname`.
 * Returns null when nothing usable is found.
 */
export async function findImage(query: string, surname: string): Promise<WorkImage | null> {
  try {
    const response = await getJson<CommonsResponse>(ENDPOINT, {
      action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '8',
      gsrsearch: query, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600',
      format: 'json', origin: '*',
    });
    const pages = Object.values(response.query?.pages ?? {})
      .sort((first, second) => first.index - second.index)
      .filter((page) => /\.(jpe?g|png)$/i.test(page.title) && page.imageinfo?.[0]?.thumburl);
    const bySurname = (page: CommonsPage): boolean => surname !== '' && page.title.toLowerCase().includes(surname);
    const best = pages.find((page) => bySurname(page) && showsWholeWork(page.title))
      ?? pages.find((page) => showsWholeWork(page.title))
      ?? pages.find(bySurname)
      ?? pages[0];
    const info = best?.imageinfo?.[0];
    if (info?.thumburl) return { image: info.thumburl, source: info.descriptionurl ?? '' };
  } catch {
    /* fall through */
  }
  return null;
}
