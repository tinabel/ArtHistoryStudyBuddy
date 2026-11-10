// Exam and class persistence, and score keeping. The only module that touches localStorage.
//
// A class ("course" in code) is just a name: exams point at it with `exam.course`. The list of names is saved
// separately so a class can exist before it has any exams.
import type { Exam, Filter, Kind, Score, Term, Work } from './types.js';

const KEY = 'exams';
const COURSES_KEY = 'courses';

/** Anything that may be in localStorage: the current format or one written by an older version. */
interface SavedExam {
  name: string;
  course?: string;
  type?: 'list' | 'filter';
  // legacy "list" exams
  items?: Work[];
  // legacy "filter" exams
  deptId?: string;
  deptName?: string;
  from?: string;
  to?: string;
  q?: string;
  // current format
  works?: Work[];
  terms?: Term[];
  filter?: Filter | null;
  stats?: Exam['stats'];
}

/** Upgrade exams saved by older versions of the app. */
function migrate(e: SavedExam): Exam {
  if (e.type === 'list') {
    return { name: e.name, works: e.items ?? [], terms: [], filter: null, stats: {} };
  }
  if (e.type === 'filter') {
    return {
      name: e.name, works: [], terms: [], stats: {},
      filter: { deptId: e.deptId ?? '', deptName: e.deptName, from: e.from ?? '', to: e.to ?? '', q: e.q ?? '' },
    };
  }
  const exam: Exam = { name: e.name, works: e.works ?? [], terms: e.terms ?? [], filter: e.filter ?? null, stats: e.stats ?? {} };
  if (typeof e.course === 'string' && e.course) exam.course = e.course;
  return exam;
}

const BACKUP_KEY = 'exams.backup';

/** Keep the unreadable data: the next save would otherwise overwrite it for good. */
function backUp(raw: string): void {
  try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* storage unavailable or full */ }
}

const looksSaved = (e: unknown): e is SavedExam =>
  typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string';

/** Reads each saved exam on its own, so one bad entry doesn't take the others with it. */
function load(): Exam[] {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return []; }
  if (raw === null) return [];

  let saved: unknown;
  try { saved = JSON.parse(raw); } catch { backUp(raw); return []; }
  if (!Array.isArray(saved)) { backUp(raw); return []; }

  const loaded: Exam[] = [];
  let skipped = false;
  for (const entry of saved) {
    try {
      if (looksSaved(entry)) loaded.push(migrate(entry));
      else skipped = true;
    } catch {
      skipped = true;
    }
  }
  if (skipped) backUp(raw);
  return loaded;
}

function loadCourses(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COURSES_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string' && name !== '') : [];
  } catch {
    return [];
  }
}

const exams: Exam[] = load();
const courses: string[] = [];
for (const name of [...loadCourses(), ...exams.map((e) => e.course ?? '')]) ensureCourse(name);

/** Throws if the browser refuses the write (e.g. storage full). */
function persist(): void {
  localStorage.setItem(KEY, JSON.stringify(exams));
  localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export const makeExam = ({ name, course, works = [], terms = [], filter = null }: Partial<Exam> & { name: string }): Exam =>
  ({ name, ...(course ? { course } : {}), works, terms, filter, stats: {} });

// ---- classes ----

/** Adds `name` to the class list, kept in order ("Art History 101" before "Art History 200"). False if empty or already there. */
function ensureCourse(name: string): boolean {
  if (!name || courses.includes(name)) return false;
  courses.push(name);
  courses.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return true;
}

export const getCourses = (): readonly string[] => courses;

/** False (and nothing changes) when the name is empty or already used. */
export function addCourse(name: string): boolean {
  const added = ensureCourse(name.trim());
  if (added) persist();
  return added;
}

/** Removes the class but keeps its exams, which go back to "no class". */
export function removeCourse(name: string): void {
  const at = courses.indexOf(name);
  if (at < 0) return;
  courses.splice(at, 1);
  for (const exam of exams) if (exam.course === name) delete exam.course;
  persist();
}

/** Moves an exam into a class; '' takes it out of its class. */
export function setExamCourse(index: number, course: string): void {
  const exam = exams[index];
  if (!exam) return;
  if (course) exam.course = course;
  else delete exam.course;
  ensureCourse(course);
  persist();
}

// ---- exams ----

export const getExams = (): Exam[] => exams;

/** Throws (and leaves the list unchanged) if the exam can't be saved. */
export function addExam(exam: Exam): void {
  exams.push(exam);
  ensureCourse(exam.course ?? '');
  try { persist(); } catch (error) { exams.pop(); throw error; }
}
export function removeExam(index: number): void { exams.splice(index, 1); persist(); }
export function resetStats(index: number): void {
  const exam = exams[index];
  if (exam) { exam.stats = {}; persist(); }
}

/** Call after mutating an exam in place. */
export const saveExams = persist;

export function recordResult(exam: Exam, kind: Kind, correct: boolean): void {
  const score = (exam.stats[kind] ??= { c: 0, t: 0 });
  score.t++;
  if (correct) score.c++;
  persist();
}

export const kindStats = (exam: Exam, kind: Kind): Score | undefined => exam.stats[kind];

export function overallStats(exam: Exam): Score {
  return Object.values(exam.stats).reduce((acc, s) => ({ c: acc.c + s.c, t: acc.t + s.t }), { c: 0, t: 0 });
}
