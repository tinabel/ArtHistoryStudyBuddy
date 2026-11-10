// Exams, classes and scores: the app's saved data. The only module that loads or saves it.
//
// The data lives in a SQLite database kept by the main process (main/database.ts), reached through
// `window.api`. Everything is loaded once at startup and held here; every change saves the whole lot again.
//
// A class ("course" in code) is just a name: exams point at it with `exam.course`. The list of names is saved
// separately so a class can exist before it has any exams.
import { loadLegacyExams } from './legacyStorage.js';
import type { Exam, Kind, Score, StudyData } from './types.js';

function load(): StudyData {
  const saved = window.api.loadData();
  if (saved) return saved;
  // Nothing in the database yet: carry over exams from versions that kept them in the browser's storage.
  const legacy: StudyData = { courses: [], exams: loadLegacyExams() };
  try {
    if (legacy.exams.length) window.api.saveData(legacy);
  } catch (error) {
    console.error('Could not copy earlier exams into the database; they are still shown.', error);
  }
  return legacy;
}

const { exams, courses } = load();
for (const exam of exams) ensureCourse(exam.course ?? '');

/** Throws if the data can't be written. */
function persist(): void {
  window.api.saveData({ courses, exams });
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
