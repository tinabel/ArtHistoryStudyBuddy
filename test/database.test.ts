// The real SQLite database (in memory, or in a temporary file to check it survives being reopened).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDatabase } from '../src/main/database.js';
import type { StudyData } from '../src/shared/data.js';

const data: StudyData = {
  courses: ['Art History 101', 'Art History 400: Indian and Southeast Asian Art'],
  exams: [
    {
      name: 'Midterm',
      course: 'Art History 101',
      works: [
        { id: 436535, title: 'Wheat Field', artist: 'Vincent van Gogh', nationality: 'Dutch', movement: 'Post-Impressionism', date: '1889', img: 'https://images/vg.jpg', src: 'https://met/436535' },
        { id: 'md-Manet|Olympia', title: 'Olympia', artist: 'Édouard Manet', nationality: '', date: '1863', img: '' },
      ],
      terms: [{ term: 'Sublime', def: 'awe mixed with terror', src: 'https://en.wikipedia.org/wiki/Sublime' }, { term: 'Impasto', def: '' }],
      filter: null,
      stats: { works: { c: 3, t: 4 } },
    },
    { name: 'Random pool', works: [], terms: [], filter: { deptId: '11', deptName: 'European Paintings', from: '1800', to: '1900', q: 'landscape' }, stats: {} },
  ],
};

/** Runs `check` with the path of a database file in a temporary folder, then removes the folder. */
function withDatabaseFile(check: (file: string) => void): void {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'study-db-'));
  try {
    check(path.join(folder, 'study.sqlite'));
  } finally {
    fs.rmSync(folder, { recursive: true });
  }
}

it('is "never saved" (null) when new, which is different from saved and empty', () => {
  const database = openDatabase(':memory:');
  expect(database.load()).toBeNull();
  database.save({ courses: [], exams: [] });
  expect(database.load()).toEqual({ courses: [], exams: [] });
});

it('gives back exactly what was saved: order, number and text ids, and unset versus empty values', () => {
  const database = openDatabase(':memory:');
  database.save(data);
  const loaded = database.load();
  expect(loaded).toEqual(data);
  const [vanGogh, manet] = loaded?.exams[0]?.works ?? [];
  expect(vanGogh?.id).toBe(436535);
  expect(manet?.id).toBe('md-Manet|Olympia');
  expect(manet?.nationality).toBe(''); // looked up, unknown
  expect(manet?.movement).toBeUndefined(); // not looked up yet
});

it('replaces everything on each save', () => {
  const database = openDatabase(':memory:');
  database.save(data);
  database.save({ courses: ['Art History 200'], exams: [{ name: 'Final', works: [], terms: [], filter: null, stats: {} }] });
  expect(database.load()).toEqual({ courses: ['Art History 200'], exams: [{ name: 'Final', works: [], terms: [], filter: null, stats: {} }] });
});

it('keeps what was saved before when a save fails part-way', () => {
  const database = openDatabase(':memory:');
  database.save(data);
  const broken = { courses: [], exams: [{ name: 'Half', works: [{ id: 1 }], terms: [], filter: null, stats: {} }] } as unknown as StudyData;
  expect(() => { database.save(broken); }).toThrow();
  expect(database.load()).toEqual(data);
});

it('refuses values of the wrong kind, and stores SQL-looking text as plain text', () => {
  const database = openDatabase(':memory:');
  const exam = { name: 'Exam', works: [], terms: [], filter: null, stats: {} };
  const save = (changes: object): void => { database.save({ courses: [], exams: [{ ...exam, ...changes }] }); };
  expect(() => { save({ name: 42 }); }).toThrow('Exam name must be text');
  expect(() => { save({ stats: { works: { c: '<b>1</b>', t: 2 } } }); }).toThrow('A score must be a count');
  expect(() => { save({ works: [{ id: {}, title: 'T', artist: 'A', date: '', img: '' }] }); }).toThrow('A work id');
  expect(database.load()).toBeNull(); // none of those was saved

  const hostile = "Robert'); DROP TABLE exams;--";
  save({ name: hostile, stats: { works: { c: 1, t: 2 }, madeUp: { c: 9, t: 9 } } });
  expect(database.load()?.exams[0]).toMatchObject({ name: hostile, stats: { works: { c: 1, t: 2 } } });
  expect(database.load()?.exams[0]?.stats).not.toHaveProperty('madeUp'); // only known kinds of score are kept
});

it('makes its file readable by the user only', () => {
  withDatabaseFile((file) => {
    openDatabase(file).close();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

it('keeps the data in its file between launches', () => {
  withDatabaseFile((file) => {
    const firstLaunch = openDatabase(file);
    firstLaunch.save(data);
    firstLaunch.close();
    const secondLaunch = openDatabase(file);
    expect(secondLaunch.load()).toEqual(data);
    secondLaunch.close();
  });
});
