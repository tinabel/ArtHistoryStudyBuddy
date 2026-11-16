// Searches for artworks in several places at once. The editor's Artworks search uses this.
//
// To add a place to search: write a client in api/ with a `searchWorks(query, limit)` function, add one line to
// WORK_SOURCES below, and allow its address in the Content-Security-Policy in index.html (connect-src).
import * as artic from '../api/artic.js';
import * as cleveland from '../api/cleveland.js';
import * as met from '../api/met.js';
import * as wikipedia from '../api/wikipedia.js';
import type { Work } from '../types.js';
import { showsWholeWork } from '../util.js';
import { searchAll, type Found, type SearchOutcome, type SearchSource } from './multiSearch.js';

export const WORK_SOURCES: readonly SearchSource<Work>[] = [
  { id: 'met', label: 'The Met', search: met.searchWorks },
  { id: 'artic', label: 'Art Institute of Chicago', search: artic.searchWorks },
  { id: 'cleveland', label: 'Cleveland Museum of Art', search: cleveland.searchWorks },
  // Not a museum, but it covers famous works wherever they hang (the Louvre, the Prado...) and architecture.
  { id: 'wikipedia', label: 'Wikipedia', search: wikipedia.searchWorks },
];

const RESULTS_PER_SOURCE = 6;

const sameWork = (first: Work, second: Work): boolean =>
  first.title.toLowerCase() === second.title.toLowerCase() && first.artist.toLowerCase() === second.artist.toLowerCase();

/** Pictures of a whole work come before details, fragments and sketches. */
export async function searchWorks(query: string, sourceIds: readonly string[]): Promise<SearchOutcome<Work>> {
  const outcome = await searchAll(WORK_SOURCES, query, sourceIds, RESULTS_PER_SOURCE, sameWork);
  const isWhole = (listed: Found<Work>): boolean => showsWholeWork(listed.item.title);
  return { ...outcome, found: [...outcome.found.filter(isWhole), ...outcome.found.filter((listed) => !isWhole(listed))] };
}
