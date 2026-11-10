// Wikimedia Commons image search.
import type { WorkImage } from '../types.js';
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
 * Best-matching JPEG/PNG for `query`, preferring files whose name contains `surname`.
 * Returns null when nothing usable is found.
 */
export async function findImage(query: string, surname: string): Promise<WorkImage | null> {
  try {
    const r = await getJson<CommonsResponse>(ENDPOINT, {
      action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '8',
      gsrsearch: query, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600',
      format: 'json', origin: '*',
    });
    const pages = Object.values(r.query?.pages ?? {})
      .sort((a, b) => a.index - b.index)
      .filter((p) => /\.(jpe?g|png)$/i.test(p.title) && p.imageinfo?.[0]?.thumburl);
    const best = pages.find((p) => surname && p.title.toLowerCase().includes(surname)) ?? pages[0];
    const info = best?.imageinfo?.[0];
    if (info?.thumburl) return { img: info.thumburl, src: info.descriptionurl ?? '' };
  } catch {
    /* fall through */
  }
  return null;
}
