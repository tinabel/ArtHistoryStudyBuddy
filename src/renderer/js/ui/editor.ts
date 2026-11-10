// Editor view: build a new exam by hand or from a markdown file.
import * as met from '../api/met.js';
import { formatTermLines, parseTermLines } from '../markdown.js';
import { importExam } from '../services/importer.js';
import { addExam, getCourses, makeExam } from '../store.js';
import type { Filter, Work } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { $, esc, field, resultRow } from './dom.js';
import { go } from './router.js';

// Draft state for the exam being built
let works: Work[] = [];
let termSources: Record<string, string> = {}; // term -> source URL (for auto-filled definitions)
let searchResults: Work[] = [];
let departmentsLoaded = false;

const input = (id: string): HTMLInputElement => field(id, HTMLInputElement);
const termsBox = (): HTMLTextAreaElement => field('exTerms', HTMLTextAreaElement);
const deptSelect = (): HTMLSelectElement => field('exDept', HTMLSelectElement);
const courseSelect = (): HTMLSelectElement => field('exCourse', HTMLSelectElement);
const say = (message: string): void => { $('editorMsg').textContent = message; };

function addWork(work: Work): void {
  if (!works.some((w) => w.id === work.id)) works.push(work);
  renderWorks();
}

function renderWorks(): void {
  $('addedCount').textContent = String(works.length);
  $('addedList').innerHTML = works.map((w, i) => resultRow({
    img: w.img,
    title: w.title,
    button: `<button type="button" class="danger" data-action="editor.removeWork" data-i="${i}">✕</button>`,
  })).join('');
}

function renderSearchResults(message: string): void {
  $('searchResults').innerHTML = message
    ? `<div class="small">${esc(message)}</div>`
    : searchResults.map((w, i) => resultRow({
      img: w.img,
      title: w.title,
      subtitle: `${w.artist || 'Unknown'}${w.nationality ? ` (${w.nationality})` : ''} · ${w.date}`,
      button: `<button type="button" data-action="editor.addResult" data-i="${i}">Add</button>`,
    })).join('');
}

async function loadDepartments(): Promise<void> {
  if (departmentsLoaded) return;
  try {
    for (const d of await met.listDepartments()) deptSelect().add(new Option(d.displayName, String(d.departmentId)));
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
  termSources = {};
  searchResults = [];
  for (const id of ['exName', 'exFrom', 'exTo', 'exQ', 'searchQ', 'mdPath']) input(id).value = '';
  termsBox().value = '';
  input('useFilter').checked = false;
  $('filterFields').hidden = true;
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

  for (const t of imported.terms) if (t.src) termSources[t.term] = t.src;
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

  const terms = parseTermLines(termsBox().value).map((t) => ({ ...t, src: termSources[t.term] ?? '' }));
  const result = readFilter();
  if ('error' in result) { say(result.error); return; }
  if (!works.length && !terms.length && !result.filter) { say('Add works, terms, or a random pool.'); return; }

  try {
    addExam(makeExam({ name, course: courseSelect().value, works, terms, filter: result.filter }));
  } catch {
    say('Could not save the exam (storage full or unavailable).');
    return;
  }
  go('home');
}

export const actions: ActionMap = {
  'editor.cancel': () => { go('home'); },
  'editor.save': save,
  'editor.toggleFilter': (el) => { $('filterFields').hidden = !(el as HTMLInputElement).checked; },
  'editor.removeWork': (el) => { works.splice(indexOf(el), 1); renderWorks(); },
  'editor.addResult': (el) => {
    const work = searchResults[indexOf(el)];
    if (work) addWork(work);
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
    const q = input('searchQ').value.trim();
    if (!q) return;
    renderSearchResults('Searching...');
    try {
      searchResults = await met.searchWorks(q);
      renderSearchResults(searchResults.length ? '' : 'No results with images.');
    } catch {
      renderSearchResults('Search failed.');
    }
  },
};
