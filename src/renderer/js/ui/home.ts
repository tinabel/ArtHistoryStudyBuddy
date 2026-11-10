// Home view: exams, grouped by class when there are classes.
import { addCourse, getCourses, getExams, overallStats, removeCourse, removeExam, resetStats, setExamCourse } from '../store.js';
import type { Exam } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { $, esc, field } from './dom.js';
import * as editor from './editor.js';
import * as study from './study.js';

function scoreSuffix(exam: Exam): string {
  const { c, t } = overallStats(exam);
  return t ? ` · ${Math.round(100 * c / t)}% (${c}/${t})` : '';
}

/** Dropdown that moves an exam to another class. Nothing to choose from until a class exists. */
function courseSelect(exam: Exam, index: number): string {
  const courses = getCourses();
  if (!courses.length) return '';
  const option = (value: string, label: string): string =>
    `<option value="${esc(value)}"${value === (exam.course ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
  return `<select aria-label="Class" title="Move to another class" data-change="home.setCourse" data-i="${index}">
    ${option('', 'No class')}${courses.map((name) => option(name, name)).join('')}
  </select>`;
}

/** `index` is the exam's place in the whole list (what the store's functions take), not within its class. */
const examRow = (exam: Exam, index: number): string => `
  <div class="row">
    <div>
      <strong>${esc(exam.name)}</strong><br>
      <span class="small">${exam.works.length} works · ${exam.terms.length} terms${exam.filter ? ' · random pool' : ''}${scoreSuffix(exam)}</span>
    </div>
    <div>
      ${courseSelect(exam, index)}
      <button type="button" data-action="home.study" data-i="${index}">Study</button>
      <button type="button" class="secondary" title="Reset scores" data-action="home.reset" data-i="${index}">↺</button>
      <button type="button" class="danger" title="Delete exam" data-action="home.delete" data-i="${index}">✕</button>
    </div>
  </div>`;

/** The rows of the exams in `course` ('' = exams in no class). */
const examRows = (course: string): string =>
  getExams().map((exam, index) => ((exam.course ?? '') === course ? examRow(exam, index) : '')).join('');

const courseSection = (name: string): string => `
  <section class="course">
    <div class="course-head">
      <h3>${esc(name)}</h3>
      <div>
        <button type="button" class="secondary" data-action="home.new" data-course="${esc(name)}">+ Add Exam</button>
        <button type="button" class="danger" title="Remove class (its exams are kept)" data-action="home.removeCourse" data-course="${esc(name)}">✕</button>
      </div>
    </div>
    ${examRows(name) || '<div class="small">No exams in this class yet.</div>'}
  </section>`;

export function render(): void {
  const courses = getCourses();
  const unassigned = examRows('');
  let html = courses.map(courseSection).join('');
  if (unassigned) html += courses.length ? `<section class="course"><h3>No class</h3>${unassigned}</section>` : unassigned;
  $('examList').innerHTML = html || '<div class="small">No exams yet. Add one.</div>';
}

export const actions: ActionMap = {
  'home.new': (el) => { editor.open(el.dataset.course ?? ''); },
  'home.study': (el) => {
    const exam = getExams()[indexOf(el)];
    if (exam) study.start(exam);
  },
  'home.reset': (el) => { resetStats(indexOf(el)); render(); },
  'home.delete': (el) => { removeExam(indexOf(el)); render(); },
  'home.addCourse': () => {
    const input = field('newCourse', HTMLInputElement);
    if (addCourse(input.value)) input.value = '';
    render();
  },
  'home.removeCourse': (el) => { removeCourse(el.dataset.course ?? ''); render(); },
  'home.setCourse': (el) => { setExamCourse(indexOf(el), (el as HTMLSelectElement).value); render(); },
};
