// Random artwork from the Met matching an exam's filter (department / years / keyword).
import * as met from '../api/met.js';
import type { Filter, Work } from '../types.js';
import { pick } from '../util.js';

const MAX_TRIES = 8;
const PAGE_SIZE = 20;
/** The search service only pages a limited way in, so random picks stay within the first few thousand matches. */
const MAX_OFFSET = 9_000;

const totals = new Map<string, number>(); // search params -> how many objects match

async function totalFor(key: string, params: Record<string, string>): Promise<number> {
  const known = totals.get(key);
  if (known !== undefined) return known;
  const { total } = await met.searchPage(params, { limit: 1 });
  totals.set(key, total);
  return total;
}

/** A work with an image and an artist, or null if none could be found. */
export async function pickRandomWork(filter: Filter): Promise<Work | null> {
  const params: Record<string, string> = { q: filter.q || 'art' };
  if (filter.deptId) params.departmentId = filter.deptId;
  if (filter.from !== '' && filter.to !== '') {
    params.dateBegin = filter.from;
    params.dateEnd = filter.to;
  }

  const total = await totalFor(JSON.stringify(params), params);
  if (!total) return null;

  // Results come in pages, so jump to a random page and take one of its objects.
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const offset = Math.floor(Math.random() * Math.min(total, MAX_OFFSET));
    const { ids } = await met.searchPage(params, { limit: PAGE_SIZE, offset });
    if (!ids.length) continue;
    const metObject = await met.getObject(pick(ids));
    if (metObject?.primaryImageSmall && metObject.artistDisplayName) return met.toWork(metObject);
  }
  return null;
}
