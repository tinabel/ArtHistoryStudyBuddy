// The store loads its data at import time, so each test sets up what it will find and imports a fresh copy.
import type { StudyData } from '../src/shared/data.js';
import { fakeDatabase, type FakeDatabase } from './helpers/fakeDatabase.js';

type Store = typeof import('../src/renderer/js/store.js');

/**
 * Gives the store a database (empty unless `saved` is given) and, optionally, exams left in the browser's
 * localStorage by a version from before the database (`legacy`, the raw text).
 */
function install({ saved = null, legacy }: { saved?: StudyData | null; legacy?: string } = {}): FakeDatabase {
  const database = fakeDatabase(saved);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { api: database } });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => (key === 'exams' ? legacy ?? null : null) },
  });
  return database;
}

/** Starts the store again, as relaunching the app does. It finds whatever the installed database holds. */
async function freshStore(): Promise<Store> {
  jest.resetModules();
  return import('../src/renderer/js/store.js');
}

beforeEach(() => { install(); });

describe('loading', () => {
  it('starts empty without saved data', async () => {
    const store = await freshStore();
    expect(store.getExams()).toEqual([]);
    expect(store.getCourses()).toEqual([]);
  });

  it('loads what the database holds', async () => {
    install({ saved: { courses: ['Art History 101'], exams: [{ name: 'Midterm', course: 'Art History 101', works: [], terms: [], filter: null, stats: {} }] } });
    const store = await freshStore();
    expect(store.getExams().map((exam) => exam.name)).toEqual(['Midterm']);
    expect(store.getCourses()).toEqual(['Art History 101']);
  });
});

describe('exams from before the database (localStorage)', () => {
  it('are carried over into the database the first time', async () => {
    const database = install({ legacy: JSON.stringify([{ name: 'Old Exam', works: [], terms: [], filter: null, stats: { terms: { c: 1, t: 2 } } }]) });
    const store = await freshStore();
    expect(store.getExams()[0]).toMatchObject({ name: 'Old Exam', stats: { terms: { correct: 1, total: 2 } } });
    expect(database.saved?.exams.map((exam) => exam.name)).toEqual(['Old Exam']);
  });

  it('are ignored once the database has been saved to, even if it is now empty', async () => {
    install({ saved: { courses: [], exams: [] }, legacy: JSON.stringify([{ name: 'Old Exam' }]) });
    expect((await freshStore()).getExams()).toEqual([]);
  });

  it('survive corrupt data and skip unreadable entries', async () => {
    install({ legacy: '{not json' });
    expect((await freshStore()).getExams()).toEqual([]);
    install({ legacy: JSON.stringify([null, 7, { name: 'Good' }]) });
    expect((await freshStore()).getExams().map((exam) => exam.name)).toEqual(['Good']);
  });

  it('are upgraded from the old "list" and "filter" formats', async () => {
    install({ legacy: JSON.stringify([
      { name: 'L', type: 'list', items: [{ id: 1, title: 'T' }] },
      { name: 'F', type: 'filter', deptId: '11', deptName: 'Paintings', from: '1400', to: '1600', q: 'portrait' },
    ]) });
    const [list, filter] = (await freshStore()).getExams();
    expect(list).toEqual({ name: 'L', works: [{ id: 1, title: 'T', artist: '', date: '', img: '' }], terms: [], filter: null, stats: {} });
    expect(filter?.filter).toEqual({ deptId: '11', deptName: 'Paintings', from: '1400', to: '1600', q: 'portrait' });
    expect(filter?.works).toEqual([]);
  });

  it('get default stats when they lack them', async () => {
    install({ legacy: JSON.stringify([{ name: 'X', works: [], terms: [], filter: null }]) });
    expect((await freshStore()).getExams()[0]?.stats).toEqual({});
  });
});

describe('saving', () => {
  it('addExam saves, and puts the list back if saving fails', async () => {
    const database = install();
    const store = await freshStore();
    store.addExam(store.makeExam({ name: 'Midterm', terms: [{ term: 'a', def: 'b', src: '' }] }));
    expect(database.saved?.exams).toHaveLength(1);
    expect(database.saved?.exams[0]).toMatchObject({ name: 'Midterm', works: [] });

    database.saveData = () => { throw new Error('disk full'); };
    expect(() => { store.addExam(store.makeExam({ name: 'Final' })); }).toThrow('disk full');
    expect(store.getExams().map((exam) => exam.name)).toEqual(['Midterm']);
  });

  it('removeExam deletes by index and saves', async () => {
    const database = install();
    const store = await freshStore();
    store.addExam(store.makeExam({ name: 'A' }));
    store.addExam(store.makeExam({ name: 'B' }));
    store.removeExam(0);
    expect(store.getExams().map((exam) => exam.name)).toEqual(['B']);
    expect(database.saved?.exams.map((exam) => exam.name)).toEqual(['B']);
  });

  it('saveExams saves in-place edits', async () => {
    const database = install();
    const store = await freshStore();
    const exam = store.makeExam({ name: 'A', works: [{ id: 1, title: 'T', artist: 'X', date: '', img: '' }] });
    store.addExam(exam);
    exam.works[0]!.nationality = 'French';
    expect(database.saved?.exams[0]?.works[0]?.nationality).toBeUndefined(); // not until asked
    store.saveExams();
    expect(database.saved?.exams[0]?.works[0]?.nationality).toBe('French');
  });
});

describe('scores', () => {
  it('recordResult, kindStats and overallStats', async () => {
    const store = await freshStore();
    const exam = store.makeExam({ name: 'E' });
    store.addExam(exam);
    store.recordResult(exam, 'works', true);
    store.recordResult(exam, 'works', false);
    store.recordResult(exam, 'terms', true);
    expect(store.kindStats(exam, 'works')).toEqual({ correct: 1, total: 2 });
    expect(store.kindStats(exam, 'terms')).toEqual({ correct: 1, total: 1 });
    expect(store.kindStats(exam, 'pool')).toBeUndefined();
    expect(store.overallStats(exam)).toEqual({ correct: 2, total: 3 });
  });

  it('survive a reload', async () => {
    const store = await freshStore();
    const exam = store.makeExam({ name: 'E' });
    store.addExam(exam);
    store.recordResult(exam, 'terms', true);
    expect((await freshStore()).getExams()[0]?.stats).toEqual({ terms: { correct: 1, total: 1 } });
  });

  it('resetStats clears one exam only', async () => {
    const store = await freshStore();
    const examA = store.makeExam({ name: 'A' });
    const examB = store.makeExam({ name: 'B' });
    store.addExam(examA);
    store.addExam(examB);
    store.recordResult(examA, 'works', true);
    store.recordResult(examB, 'works', true);
    store.resetStats(0);
    expect(store.overallStats(examA)).toEqual({ correct: 0, total: 0 });
    expect(store.overallStats(examB)).toEqual({ correct: 1, total: 1 });
  });
});

describe('classes', () => {
  it('keeps classes in order and saves them, including one with no exams', async () => {
    const database = install();
    const store = await freshStore();
    expect(store.addCourse(' Art History 200 ')).toBe(true);
    expect(store.addCourse('Art History 101')).toBe(true);
    expect(store.addCourse('Art History 101')).toBe(false);
    expect(store.addCourse('')).toBe(false);
    expect(store.getCourses()).toEqual(['Art History 101', 'Art History 200']);
    expect(database.saved?.courses).toEqual(['Art History 101', 'Art History 200']);
    expect((await freshStore()).getCourses()).toEqual(['Art History 101', 'Art History 200']);
  });

  it('remembers which class an exam is in, and recovers a class named only by an exam', async () => {
    const database = install();
    const store = await freshStore();
    store.addExam(store.makeExam({ name: 'Midterm', course: 'Art History 101' }));
    expect(store.getCourses()).toEqual(['Art History 101']);
    database.saved!.courses = [];
    const reloaded = await freshStore();
    expect(reloaded.getExams()[0]?.course).toBe('Art History 101');
    expect(reloaded.getCourses()).toEqual(['Art History 101']);
  });

  it('moves an exam between classes; removing a class keeps its exams', async () => {
    const store = await freshStore();
    store.addExam(store.makeExam({ name: 'Midterm' }));
    expect(store.getExams()[0]).not.toHaveProperty('course'); // exams outside a class look as they always did
    store.setExamCourse(0, 'Art History 400');
    expect(store.getExams()[0]?.course).toBe('Art History 400');
    expect(store.getCourses()).toEqual(['Art History 400']);
    store.removeCourse('Art History 400');
    expect(store.getCourses()).toEqual([]);
    expect(store.getExams()).toHaveLength(1);
    expect(store.getExams()[0]).not.toHaveProperty('course');
  });
});
