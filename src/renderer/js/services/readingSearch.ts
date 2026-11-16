// Searches for readings (books and articles) in several places at once. The editor's Readings search uses this.
//
// To add a place to search: write a client in api/ with a `searchReadings(query, limit)` function, add one line to
// READING_SOURCES below, and allow its address in the Content-Security-Policy in index.html (connect-src), unless it
// can only be reached through the main process (like Project Gutenberg's catalogue).
import * as archive from '../api/archive.js';
import * as gutenberg from '../api/gutenberg.js';
import * as wikipedia from '../api/wikipedia.js';
import type { ReadingCandidate } from '../types.js';
import { searchAll, type SearchOutcome, type SearchSource } from './multiSearch.js';

export const READING_SOURCES: readonly SearchSource<ReadingCandidate>[] = [
  { id: 'gutenberg', label: 'Project Gutenberg', search: gutenberg.searchReadings },
  { id: 'archive', label: 'Internet Archive', search: archive.searchReadings },
  { id: 'wikipedia', label: 'Wikipedia', search: wikipedia.searchReadings },
];

const RESULTS_PER_SOURCE = 5;

const sameReading = (first: ReadingCandidate, second: ReadingCandidate): boolean =>
  first.reading.id === second.reading.id || (
    first.reading.title.toLowerCase() === second.reading.title.toLowerCase()
    && first.reading.author.toLowerCase() === second.reading.author.toLowerCase());

export const searchReadings = (query: string, sourceIds: readonly string[]): Promise<SearchOutcome<ReadingCandidate>> =>
  searchAll(READING_SOURCES, query, sourceIds, RESULTS_PER_SOURCE, sameReading);
