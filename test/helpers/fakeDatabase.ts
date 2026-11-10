import type { StudyData } from '../../src/shared/data.js';

/** Stands in for the SQLite database behind `window.api`: remembers the last thing saved. */
export interface FakeDatabase {
  /** What a reload would get back; null until something is saved. */
  saved: StudyData | null;
  loadData: () => StudyData | null;
  saveData: (data: StudyData) => void;
}

export function fakeDatabase(initial: StudyData | null = null): FakeDatabase {
  const database: FakeDatabase = {
    saved: initial,
    loadData: () => database.saved,
    // Copied, as the real call copies it into another process: later edits must not leak into "saved" data.
    saveData: (data) => { database.saved = JSON.parse(JSON.stringify(data)) as StudyData; },
  };
  return database;
}
