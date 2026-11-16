// Searches for artworks in several places at once. The editor's "Must Know Works" search uses this.
//
// To add a place to search: write a client in api/ with a `searchWorks(query, limit)` function, add one line to
// WORK_SOURCES below, and allow its address in the Content-Security-Policy in index.html (connect-src).
import * as artic from '../api/artic.js';
import * as cleveland from '../api/cleveland.js';
import * as met from '../api/met.js';
import * as wikipedia from '../api/wikipedia.js';
import type { Work } from '../types.js';
import { showsWholeWork } from '../util.js';

export interface WorkSource {
  id: string;
  /** Shown beside its checkbox and on each result. */
  label: string;
  search: (query: string, limit: number) => Promise<Work[]>;
}

export const WORK_SOURCES: readonly WorkSource[] = [
  { id: 'met', label: 'The Met', search: met.searchWorks },
  { id: 'artic', label: 'Art Institute of Chicago', search: artic.searchWorks },
  { id: 'cleveland', label: 'Cleveland Museum of Art', search: cleveland.searchWorks },
  // Not a museum, but it covers famous works wherever they hang (the Louvre, the Prado...) and architecture.
  { id: 'wikipedia', label: 'Wikipedia', search: wikipedia.searchWorks },
];

const RESULTS_PER_SOURCE = 6;

export interface FoundWork {
  work: Work;
  /** Label of the place it was found. */
  sourceLabel: string;
}

export interface SearchOutcome {
  found: FoundWork[];
  /** Labels of the places that could not be reached (offline, service down). */
  failed: string[];
}

const sameWork = (first: Work, second: Work): boolean =>
  first.title.toLowerCase() === second.title.toLowerCase() && first.artist.toLowerCase() === second.artist.toLowerCase();

/**
 * Searches the places named in `sourceIds`, all at the same time. Results are taken in turn from each place
 * (its best match first), so one place can't crowd out the others, and a work found twice is listed once.
 * Pictures of a whole work come before details, fragments and sketches.
 */
export async function searchWorks(query: string, sourceIds: readonly string[]): Promise<SearchOutcome> {
  const sources = WORK_SOURCES.filter((source) => sourceIds.includes(source.id));
  const answers = await Promise.allSettled(sources.map((source) => source.search(query, RESULTS_PER_SOURCE)));

  const outcome: SearchOutcome = { found: [], failed: [] };
  const resultLists: FoundWork[][] = [];
  answers.forEach((answer, position) => {
    const sourceLabel = sources[position]?.label ?? '';
    if (answer.status === 'rejected') outcome.failed.push(sourceLabel);
    else resultLists.push(answer.value.map((work) => ({ work, sourceLabel })));
  });

  for (let rank = 0; rank < RESULTS_PER_SOURCE; rank++) {
    for (const results of resultLists) {
      const candidate = results[rank];
      if (candidate && !outcome.found.some((listed) => sameWork(listed.work, candidate.work))) outcome.found.push(candidate);
    }
  }
  const whole = outcome.found.filter((listed) => showsWholeWork(listed.work.title));
  const partial = outcome.found.filter((listed) => !showsWholeWork(listed.work.title));
  outcome.found = [...whole, ...partial];
  return outcome;
}
