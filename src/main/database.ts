// The SQLite database that exams and classes are saved in. Uses Node's built-in SQLite (node:sqlite), so there
// is nothing extra to install. No Electron imports here, so tests can open a database directly.
//
// Saving replaces everything in one transaction: the page always holds the full list, the data is small, and
// "all of it or none of it" is easy to reason about. Order (of classes, exams, works and terms) is kept by a
// position column.
//
// Security: values only ever reach SQL as bound parameters (the ? marks), never by building SQL text. What the
// page sends is checked value by value before it is stored (see "Checking" below), and the file is readable by
// the user alone.
import * as fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Exam, Filter, Kind, StudyData, Term, Work } from '../shared/data.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS courses (
    position INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS exams (
    id     INTEGER PRIMARY KEY,   -- also the exam's place in the list
    name   TEXT NOT NULL,
    course TEXT,                  -- class name; NULL = not in a class
    filter TEXT,                  -- random-art filter as JSON; NULL = none
    stats  TEXT NOT NULL          -- scores as JSON, e.g. {"works":{"correct":3,"total":4}}
  );
  CREATE TABLE IF NOT EXISTS works (
    exam_id     INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    work_id     NOT NULL,         -- no type on purpose: Met ids stay numbers, imported ids stay text
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    nationality TEXT,             -- NULL = not looked up yet; '' = looked up, unknown
    movement    TEXT,             -- same
    date        TEXT NOT NULL,
    image       TEXT NOT NULL,    -- an https: address or a data: image
    source      TEXT,             -- the web page it came from
    PRIMARY KEY (exam_id, position)
  );
  CREATE TABLE IF NOT EXISTS terms (
    exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    term       TEXT NOT NULL,
    definition TEXT NOT NULL,
    source     TEXT,
    PRIMARY KEY (exam_id, position)
  );
`;

/** PRAGMA user_version: 0 in a new file, 1 once something has been saved. */
const SAVED_VERSION = 1;
const OWNER_ONLY = 0o600;
const KINDS: readonly Kind[] = ['works', 'terms', 'pool'];

export interface Database {
  /** Everything saved, or null if nothing has ever been saved (a new database). */
  load: () => StudyData | null;
  /** Replaces everything saved with `data`. Throws, changing nothing, if `data` can't be stored. */
  save: (data: StudyData) => void;
  close: () => void;
}

// ---- Checking ----
// Neither the page nor a database file someone has edited is trusted to hold well-formed data, so values are
// checked on the way in and on the way out. Each function returns the value, or throws naming what is wrong.

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new TypeError(`${what} must be text`);
  return value;
}

/** Text, or null when absent. SQLite has no "undefined": optional values are stored as NULL. */
const optionalText = (value: unknown, what: string): string | null =>
  (value === undefined || value === null ? null : text(value, what));

/** The other direction: NULL in the database is a missing value in the app. */
const orUndefined = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function count(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new TypeError(`${what} must be a count`);
  return value;
}

function workId(value: unknown): string | number {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new TypeError('A work id must be text or a number');
}

/** A copy holding only the known fields, each checked. */
function checkedFilter(value: unknown): Filter | null {
  if (value === null || value === undefined) return null;
  const filter = value as Record<string, unknown>;
  return {
    deptId: text(filter.deptId, 'Filter department'),
    deptName: orUndefined(filter.deptName),
    from: text(filter.from, 'Filter start year'),
    to: text(filter.to, 'Filter end year'),
    q: text(filter.q, 'Filter keyword'),
  };
}

/** A copy holding only the known kinds of score, each checked. */
function checkedStats(value: unknown): Exam['stats'] {
  const given = (value ?? {}) as Record<string, { correct?: unknown; total?: unknown } | undefined>;
  const stats: Exam['stats'] = {};
  for (const kind of KINDS) {
    const score = given[kind];
    if (score) stats[kind] = { correct: count(score.correct, 'A score'), total: count(score.total, 'A score') };
  }
  return stats;
}

// ---- Rows to app data ----

type Row = Record<string, unknown>;

const toWork = (row: Row): Work => ({
  id: workId(row.work_id),
  title: text(row.title, 'Title'),
  artist: text(row.artist, 'Artist'),
  nationality: orUndefined(row.nationality),
  movement: orUndefined(row.movement),
  date: text(row.date, 'Date'),
  image: text(row.image, 'Image'),
  source: orUndefined(row.source),
});

const toTerm = (row: Row): Term => ({
  term: text(row.term, 'Term'),
  definition: text(row.definition, 'Definition'),
  source: orUndefined(row.source),
});

/** Opens (creating if needed) the database in `file`. Pass ':memory:' for a throwaway one. */
export function openDatabase(file: string): Database {
  const sqlite = new DatabaseSync(file);
  if (file !== ':memory:') fs.chmodSync(file, OWNER_ONLY);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(SCHEMA);

  const rows = (sql: string, ...values: SQLInputValue[]): Row[] => sqlite.prepare(sql).all(...values);

  function load(): StudyData | null {
    const savedVersion = sqlite.prepare('PRAGMA user_version').get()?.user_version;
    if (savedVersion !== SAVED_VERSION) return null;

    const exams = rows('SELECT * FROM exams ORDER BY id').map((exam): Exam => ({
      name: text(exam.name, 'Exam name'),
      course: orUndefined(exam.course),
      works: rows('SELECT * FROM works WHERE exam_id = ? ORDER BY position', exam.id as number).map(toWork),
      terms: rows('SELECT * FROM terms WHERE exam_id = ? ORDER BY position', exam.id as number).map(toTerm),
      filter: checkedFilter(typeof exam.filter === 'string' ? JSON.parse(exam.filter) : null),
      stats: checkedStats(JSON.parse(text(exam.stats, 'Scores'))),
    }));
    const courses = rows('SELECT name FROM courses ORDER BY position').map((course) => text(course.name, 'Class name'));
    return { courses, exams };
  }

  function writeAll(data: StudyData): void {
    sqlite.exec('DELETE FROM terms; DELETE FROM works; DELETE FROM exams; DELETE FROM courses;');

    const addCourse = sqlite.prepare('INSERT INTO courses (position, name) VALUES (?, ?)');
    const addExam = sqlite.prepare('INSERT INTO exams (id, name, course, filter, stats) VALUES (?, ?, ?, ?, ?)');
    const addWork = sqlite.prepare(`INSERT INTO works (exam_id, position, work_id, title, artist, nationality, movement, date, image, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addTerm = sqlite.prepare('INSERT INTO terms (exam_id, position, term, definition, source) VALUES (?, ?, ?, ?, ?)');

    data.courses.forEach((name, position) => addCourse.run(position, text(name, 'Class name')));

    data.exams.forEach((exam, examId) => {
      const filter = checkedFilter(exam.filter);
      addExam.run(
        examId, text(exam.name, 'Exam name'), optionalText(exam.course, 'Class name'),
        filter ? JSON.stringify(filter) : null, JSON.stringify(checkedStats(exam.stats)),
      );
      exam.works.forEach((work, position) => addWork.run(
        examId, position, workId(work.id), text(work.title, 'Title'), text(work.artist, 'Artist'),
        optionalText(work.nationality, 'Nationality'), optionalText(work.movement, 'Movement'),
        text(work.date, 'Date'), text(work.image, 'Image'), optionalText(work.source, 'Source'),
      ));
      exam.terms.forEach((term, position) => addTerm.run(
        examId, position, text(term.term, 'Term'), text(term.definition, 'Definition'), optionalText(term.source, 'Source'),
      ));
    });
    sqlite.exec(`PRAGMA user_version = ${SAVED_VERSION}`); // a constant, not user input
  }

  function save(data: StudyData): void {
    sqlite.exec('BEGIN');
    try {
      writeAll(data);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK'); // keep what was saved before
      throw error;
    }
  }

  return { load, save, close: () => { sqlite.close(); } };
}
