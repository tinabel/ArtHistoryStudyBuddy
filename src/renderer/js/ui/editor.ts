// Editor view: build a new exam by hand or from a markdown file.
import * as met from '../api/met.js';
import { formatTermLines, parseTermLines } from '../markdown.js';
import { importExam } from '../services/importer.js';
import { searchWorks, WORK_SOURCES, type FoundWork } from '../services/workSearch.js';
import { addExam, getCourses, makeExam } from '../store.js';
import type { Filter, Work } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { byId, escapeHtml, field, resultRow } from './dom.js';
import { go } from './router.js';

// Draft state for the exam being built
let works: Work[] = [];
// term -> source URL (for auto-filled definitions). A Map, not a plain object: a term can be called anything,
// and looking up "constructor" in a plain object finds a built-in function instead of nothing.
const termSources = new Map<string, string>();
let searchResults: FoundWork[] = [];
let departmentsLoaded = false;

const input = (id: string): HTMLInputElement => field(id, HTMLInputElement);
const termsBox = (): HTMLTextAreaElement => field('exTerms', HTMLTextAreaElement);
const deptSelect = (): HTMLSelectElement => field('exDept', HTMLSelectElement);
const courseSelect = (): HTMLSelectElement => field('exCourse', HTMLSelectElement);
const say = (message: string): void => { byId('editorMsg').textContent = message; };

function addWork(work: Work): void {
  if (!works.some((added) => added.id === work.id)) works.push(work);
  renderWorks();
}

function renderWorks(): void {
  byId('addedCount').textContent = String(works.length);
  byId('addedList').innerHTML = works.map((work, index) => resultRow({
    image: work.image,
    title: work.title,
    button: `<button type="button" class="danger" data-action="editor.removeWork" data-i="${index}">✕</button>`,
  })).join('');
}

/** Shows the search results, with an optional line above them (progress, "nothing found", a place that failed). */
function renderSearchResults(message: string): void {
  const note = message ? `<div class="small">${escapeHtml(message)}</div>` : '';
  byId('searchResults').innerHTML = note + searchResults.map(({ work, sourceLabel }, index) => resultRow({
    image: work.image,
    title: work.title,
    subtitle: [`${work.artist || 'Unknown'}${work.nationality ? ` (${work.nationality})` : ''}`, work.date, sourceLabel].filter(Boolean).join(' · '),
    button: `<button type="button" data-action="editor.addResult" data-i="${index}">Add</button>`,
  })).join('');
}

/** One checkbox per place to search, all ticked to start with. Built once, so choices last while the app is open. */
function renderSearchSources(): void {
  if (byId('searchSources').childElementCount) return;
  byId('searchSources').innerHTML = WORK_SOURCES.map((source) =>
    `<label><input type="checkbox" value="${escapeHtml(source.id)}" checked> ${escapeHtml(source.label)}</label>`).join('');
}

const chosenSourceIds = (): string[] =>
  [...document.querySelectorAll<HTMLInputElement>('#searchSources input:checked')].map((checkbox) => checkbox.value);

async function loadDepartments(): Promise<void> {
  if (departmentsLoaded) return;
  try {
    for (const department of await met.listDepartments()) deptSelect().add(new Option(department.displayName, String(department.departmentId)));
    departmentsLoaded = true;
  } catch {
    say('Could not load departments (offline?).');
  }
}

/** Opens an empty form. `course` preselects the class the exam will go in ('' = none). */
export function open(course = ''): void {
  const courses = getCourses();
  courseSelect().replaceChildren(new Option('No class', ''), ...courses.map((name) => new Option(name, name)));
  courseSelect().value = course;
  courseSelect().hidden = !courses.length;
  works = [];
  termSources.clear();
  searchResults = [];
  for (const id of ['exName', 'exFrom', 'exTo', 'exQ', 'searchQ', 'mdPath']) input(id).value = '';
  termsBox().value = '';
  input('useFilter').checked = false;
  byId('filterFields').hidden = true;
  renderSearchSources();
  renderSearchResults('');
  renderWorks();
  say('');
  go('editor');
  void loadDepartments();
}

let importing = false;

/** Greys out the import buttons while an import runs, so a second click can't append everything twice. */
function setImporting(busy: boolean): void {
  importing = busy;
  for (const action of ['editor.importPath', 'editor.browse']) {
    for (const button of document.querySelectorAll<HTMLButtonElement>(`button[data-action="${action}"]`)) button.disabled = busy;
  }
}

async function runImport(path: string): Promise<void> {
  if (importing) return;
  setImporting(true);
  try {
    await importFile(path);
  } finally {
    setImporting(false);
  }
}

async function importFile(path: string): Promise<void> {
  let text: string;
  try {
    text = await window.api.readMd(path);
  } catch {
    say(`Cannot read file: ${path}`);
    return;
  }

  const imported = await importExam(text, say);
  if (!input('exName').value) input('exName').value = imported.title;

  for (const term of imported.terms) if (term.source) termSources.set(term.term, term.source);
  const terms = termsBox();
  const existing = terms.value.trim();
  const lines = formatTermLines(imported.terms);
  terms.value = existing ? `${existing}\n${lines}` : lines;

  imported.works.forEach(addWork);

  say(`Imported ${imported.terms.length} terms (definitions auto-filled from Wikipedia — review!), ${imported.works.length} works.` +
    (imported.noImage.length ? ` No image: ${imported.noImage.join('; ')}` : ''));
}

/** Reads the filter form; filter is null when the checkbox is off. */
function readFilter(): { filter: Filter | null } | { error: string } {
  if (!input('useFilter').checked) return { filter: null };
  const from = input('exFrom').value;
  const to = input('exTo').value;
  if ((from === '') !== (to === '')) return { error: 'Set both years or neither.' };
  const dept = deptSelect();
  return {
    filter: { deptId: dept.value, deptName: dept.selectedOptions[0]?.text, from, to, q: input('exQ').value.trim() },
  };
}

function save(): void {
  const name = input('exName').value.trim();
  if (!name) { say('Name required.'); return; }

  const terms = parseTermLines(termsBox().value).map((term) => ({ ...term, source: termSources.get(term.term) ?? '' }));
  const result = readFilter();
  if ('error' in result) { say(result.error); return; }
  if (!works.length && !terms.length && !result.filter) { say('Add works, terms, or a random pool.'); return; }

  try {
    addExam(makeExam({ name, course: courseSelect().value, works, terms, filter: result.filter }));
  } catch {
    say('Could not save the exam. Nothing was changed.');
    return;
  }
  go('home');
}

export const actions: ActionMap = {
  'editor.cancel': () => { go('home'); },
  'editor.save': save,
  'editor.toggleFilter': (element) => { byId('filterFields').hidden = !(element as HTMLInputElement).checked; },
  'editor.removeWork': (element) => { works.splice(indexOf(element), 1); renderWorks(); },
  'editor.addResult': (element) => {
    const result = searchResults[indexOf(element)];
    if (result) addWork(result.work);
  },
  'editor.importPath': () => {
    const path = input('mdPath').value.trim();
    return path ? runImport(path) : undefined;
  },
  'editor.browse': async () => {
    const path = await window.api.pickMd();
    if (path) {
      input('mdPath').value = path;
      await runImport(path);
    }
  },
  'editor.search': async () => {
    const query = input('searchQ').value.trim();
    if (!query) return;
    const sourceIds = chosenSourceIds();
    searchResults = [];
    if (!sourceIds.length) { renderSearchResults('Tick at least one place to search.'); return; }
    renderSearchResults('Searching...');
    const { found, failed } = await searchWorks(query, sourceIds);
    searchResults = found;
    const notes = [
      found.length ? '' : 'No results with images.',
      failed.length ? `Could not reach: ${failed.join(', ')}.` : '',
    ];
    renderSearchResults(notes.filter(Boolean).join(' '));
  },
};
