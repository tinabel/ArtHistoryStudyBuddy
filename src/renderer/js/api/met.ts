// Met Museum Open Access API client. Returns plain data, never touches the DOM.
import type { Work } from '../types.js';
import { getJson } from './http.js';

const ROOT = 'https://collectionapi.metmuseum.org/public/collection';
const BASE = `${ROOT}/v1`;
// /v1/search was retired on 2026-10-01 (it answers 410 Gone). v1.1 is paginated with limit and offset.
const SEARCH = `${ROOT}/v1.1/search`;

export interface MetObject {
  objectID: number;
  title: string;
  artistDisplayName: string;
  artistNationality?: string;
  objectDate: string;
  primaryImageSmall: string;
  objectURL: string;
}

export interface Department {
  departmentId: number;
  displayName: string;
}

export async function listDepartments(): Promise<Department[]> {
  return (await getJson<{ departments: Department[] }>(`${BASE}/departments`)).departments;
}

export interface SearchPage {
  /** How many objects match in all, not just on this page. */
  total: number;
  ids: number[];
}

/** One page of matches (always restricted to objects with images). */
export async function searchPage(params: Record<string, string>, page: { limit: number; offset?: number }): Promise<SearchPage> {
  const result = await getJson<{ total?: number; objectIDs?: number[] | null }>(SEARCH, {
    hasImages: 'true', ...params, limit: String(page.limit), offset: String(page.offset ?? 0),
  });
  const ids = result.objectIDs ?? [];
  return { total: result.total ?? ids.length, ids };
}

/** The best matches for params: the first page of results. */
export async function searchIds(params: Record<string, string>, limit = 50): Promise<number[]> {
  return (await searchPage(params, { limit })).ids;
}

export async function getObject(id: number): Promise<MetObject | null> {
  try {
    return await getJson<MetObject>(`${BASE}/objects/${id}`);
  } catch {
    return null;
  }
}

/** Met object -> app "work" shape. */
export const toWork = (metObject: MetObject): Work => ({
  id: metObject.objectID,
  title: metObject.title,
  artist: metObject.artistDisplayName,
  nationality: metObject.artistNationality ?? '',
  date: metObject.objectDate,
  image: metObject.primaryImageSmall,
  source: metObject.objectURL,
});

/** Free-text search; returns up to `limit` works that have an image. */
export async function searchWorks(query: string, limit = 10): Promise<Work[]> {
  const ids = (await searchIds({ q: query })).slice(0, limit);
  const objects = await Promise.all(ids.map(getObject));
  return objects.filter((metObject): metObject is MetObject => metObject?.primaryImageSmall !== undefined && metObject.primaryImageSmall !== '').map(toWork);
}

/** First result for `title` whose artist name contains `surname`, or null. */
export async function findWork(title: string, surname: string, tries = 5): Promise<Work | null> {
  try {
    for (const id of (await searchIds({ q: title })).slice(0, tries)) {
      const metObject = await getObject(id);
      if (metObject?.primaryImageSmall && surname && metObject.artistDisplayName.toLowerCase().includes(surname)) {
        return toWork(metObject);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}
