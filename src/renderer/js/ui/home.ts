// Home view: list of exams.
import { getExams, overallStats, removeExam, resetStats } from '../store.js';
import type { Exam } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { $, esc } from './dom.js';
import * as editor from './editor.js';
import * as study from './study.js';

function scoreSuffix(exam: Exam): string {
  const { c, t } = overallStats(exam);
  return t ? ` · ${Math.round(100 * c / t)}% (${c}/${t})` : '';
}

export function render(): void {
  const exams = getExams();
  $('examList').innerHTML = exams.length
    ? exams.map((e, i) => `
      <div class="row">
        <div>
          <strong>${esc(e.name)}</strong><br>
          <span class="small">${e.works.length} works · ${e.terms.length} terms${e.filter ? ' · random pool' : ''}${scoreSuffix(e)}</span>
        </div>
        <div>
          <button type="button" data-action="home.study" data-i="${i}">Study</button>
          <button type="button" class="secondary" title="Reset scores" data-action="home.reset" data-i="${i}">↺</button>
          <button type="button" class="danger" title="Delete exam" data-action="home.delete" data-i="${i}">✕</button>
        </div>
      </div>`).join('')
    : '<div class="small">No exams yet. Add one.</div>';
}

export const actions: ActionMap = {
  'home.new': () => { editor.open(); },
  'home.study': (el) => {
    const exam = getExams()[indexOf(el)];
    if (exam) study.start(exam);
  },
  'home.reset': (el) => { resetStats(indexOf(el)); render(); },
  'home.delete': (el) => { removeExam(indexOf(el)); render(); },
};
