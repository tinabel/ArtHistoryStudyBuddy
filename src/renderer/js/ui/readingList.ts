// Readings list view: every reading of an exam with its excerpt, to read through (the flashcards and quiz are in study.ts).
import type { Exam } from '../types.js';
import { type ActionMap } from './actions.js';
import { byId, escapeHtml, sourceLink } from './dom.js';
import { go } from './router.js';

const readingHtml = (reading: Exam['readings'][number]): string => `
  <details class="reading">
    <summary><strong>${escapeHtml(reading.title)}</strong>${reading.author ? ` — ${escapeHtml(reading.author)}` : ''}</summary>
    <div class="excerpt">${escapeHtml(reading.excerpt || '(no text saved)')}</div>
    ${sourceLink(reading.source, 'Read it')}
  </details>`;

export function open(exam: Exam): void {
  byId('readingListTitle').textContent = `${exam.name}: Readings`;
  byId('readingListBody').innerHTML = exam.readings.map(readingHtml).join('') || '<div class="small">No readings in this exam.</div>';
  go('readingList');
}

export const actions: ActionMap = {
  'readingList.back': () => { go('home'); },
};
