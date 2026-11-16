// The Readings part of the exam editor: search for readings or paste a link, and keep the list added so far.
// The editor opens it empty (`reset`), adds readings from a markdown import (`add`) and saves `current()`.
import { completeReading, readingFromLink } from '../services/readings.js';
import { READING_SOURCES, searchReadings } from '../services/readingSearch.js';
import type { Found } from '../services/multiSearch.js';
import type { Reading, ReadingCandidate } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { byId, chosenSourceIds, escapeHtml, field, renderSourceChoices, resultRow } from './dom.js';

let readings: Reading[] = [];
let results: Found<ReadingCandidate>[] = [];

const queryBox = (): HTMLInputElement => field('readingQ', HTMLInputElement);
const say = (message: string): void => { byId('readingMsg').textContent = message; };
const EXCERPT_PREVIEW = 160; // characters shown in the lists

export const current = (): Reading[] => readings;

const preview = (excerpt: string): string =>
  excerpt ? `<div class="small">${escapeHtml(excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW)}…` : excerpt)}</div>` : '';

function renderResults(message: string): void {
  const note = message ? `<div class="small">${escapeHtml(message)}</div>` : '';
  byId('readingResults').innerHTML = note + results.map(({ item, sourceLabel }, index) => resultRow({
    image: null,
    title: item.reading.title,
    subtitle: [item.reading.author, sourceLabel].filter(Boolean).join(' · '),
    extra: preview(item.reading.excerpt),
    button: `<button type="button" data-action="readings.addResult" data-i="${index}">Add</button>`,
  })).join('');
}

function renderAdded(): void {
  byId('readingCount').textContent = String(readings.length);
  byId('readingList').innerHTML = readings.map((reading, index) => resultRow({
    image: null,
    title: reading.title,
    subtitle: reading.author,
    extra: preview(reading.excerpt) || '<div class="small">No text saved; the link opens it.</div>',
    button: `<button type="button" class="danger" data-action="readings.remove" data-i="${index}">✕</button>`,
  })).join('');
}

/** Adds a reading unless the exam has it already. */
export function add(reading: Reading): void {
  if (!readings.some((added) => added.id === reading.id)) readings.push(reading);
  renderAdded();
}

/** Empties the section for a new exam. */
export function reset(): void {
  readings = [];
  results = [];
  queryBox().value = '';
  renderSourceChoices('readingSources', READING_SOURCES);
  renderResults('');
  renderAdded();
  say('');
}

/** An https address pasted into the search box is added as a reading itself instead of searched for. */
const isLink = (query: string): boolean => /^https:\/\/\S+$/i.test(query);

async function addLink(address: string): Promise<void> {
  say('Reading the page...');
  try {
    const reading = await readingFromLink(address);
    add(reading);
    say(`Added "${reading.title}".${reading.excerpt ? '' : ' No text could be taken from the page, so only the link is saved.'}`);
    queryBox().value = '';
  } catch (error) {
    say(error instanceof Error ? error.message : 'Could not read that page.');
  }
}

async function search(query: string): Promise<void> {
  const sourceIds = chosenSourceIds('readingSources');
  results = [];
  if (!sourceIds.length) { renderResults('Tick at least one place to search.'); return; }
  renderResults('Searching...');
  const { found, failed } = await searchReadings(query, sourceIds);
  results = found;
  renderResults([
    found.length ? '' : 'Nothing found.',
    failed.length ? `Could not reach: ${failed.join(', ')}.` : '',
  ].filter(Boolean).join(' '));
}

export const actions: ActionMap = {
  'readings.search': () => {
    const query = queryBox().value.trim();
    if (!query) return undefined;
    return isLink(query) ? addLink(query) : search(query);
  },
  'readings.addResult': async (element) => {
    const result = results[indexOf(element)];
    if (!result) return;
    say('Adding...');
    add(await completeReading(result.item));
    say('');
  },
  'readings.remove': (element) => { readings.splice(indexOf(element), 1); renderAdded(); },
};
