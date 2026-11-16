// Searches several places at once. Shared by the artwork search (workSearch.ts) and the readings search
// (readingSearch.ts).

export interface SearchSource<Item> {
  id: string;
  /** Shown beside its checkbox and on each result. */
  label: string;
  search: (query: string, limit: number) => Promise<Item[]>;
}

export interface Found<Item> {
  item: Item;
  /** Label of the place it was found. */
  sourceLabel: string;
}

export interface SearchOutcome<Item> {
  found: Found<Item>[];
  /** Labels of the places that could not be reached (offline, service down). */
  failed: string[];
}

/**
 * Searches the places named in `sourceIds`, all at the same time. Results are taken in turn from each place
 * (its best match first), so one place can't crowd out the others, and an item found twice (`isSame`) is listed once.
 */
export async function searchAll<Item>(
  sources: readonly SearchSource<Item>[],
  query: string,
  sourceIds: readonly string[],
  limitPerSource: number,
  isSame: (first: Item, second: Item) => boolean,
): Promise<SearchOutcome<Item>> {
  const chosen = sources.filter((source) => sourceIds.includes(source.id));
  const answers = await Promise.allSettled(chosen.map((source) => source.search(query, limitPerSource)));

  const outcome: SearchOutcome<Item> = { found: [], failed: [] };
  const resultLists: Found<Item>[][] = [];
  answers.forEach((answer, position) => {
    const sourceLabel = chosen[position]?.label ?? '';
    if (answer.status === 'rejected') outcome.failed.push(sourceLabel);
    else resultLists.push(answer.value.map((item) => ({ item, sourceLabel })));
  });

  for (let rank = 0; rank < limitPerSource; rank++) {
    for (const results of resultLists) {
      const candidate = results[rank];
      if (candidate && !outcome.found.some((listed) => isSame(listed.item, candidate.item))) outcome.found.push(candidate);
    }
  }
  return outcome;
}
