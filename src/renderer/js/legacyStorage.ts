// Reads exams saved by versions of the app from before the SQLite database, which kept them in the browser's
// localStorage. Read-only: it is used once, to carry old exams over (see `load` in store.ts).
import type { Exam, Filter, Kind, Term, Work } from './types.js';

const KEY = 'exams';

/** Anything that may be in localStorage: the last format or an older one. */
interface SavedExam {
  name: string;
  course?: string;
  type?: 'list' | 'filter';
  // oldest "list" exams
  items?: Work[];
  // oldest "filter" exams
  deptId?: string;
  deptName?: string;
  from?: string;
  to?: string;
  q?: string;
  // last format
  works?: Work[];
  terms?: Term[];
  filter?: Filter | null;
  /** Scores used to be saved with one-letter names: c = correct, t = total. */
  stats?: Partial<Record<Kind, { c: number; t: number }>>;
}

/** Old data can lack fields the database insists on. */
const completeWork = (work: Partial<Work>): Work =>
  ({ ...work, id: work.id ?? '', title: work.title ?? '', artist: work.artist ?? '', date: work.date ?? '', img: work.img ?? '' });

const completeTerm = (term: Partial<Term>): Term => ({ ...term, term: term.term ?? '', def: term.def ?? '' });

function upgradeStats(saved: SavedExam['stats'] = {}): Exam['stats'] {
  const stats: Exam['stats'] = {};
  for (const [kind, score] of Object.entries(saved)) stats[kind as Kind] = { correct: score.c, total: score.t };
  return stats;
}

function upgrade(saved: SavedExam): Exam {
  if (saved.type === 'list') {
    return { name: saved.name, works: (saved.items ?? []).map(completeWork), terms: [], filter: null, stats: {} };
  }
  if (saved.type === 'filter') {
    return {
      name: saved.name, works: [], terms: [], stats: {},
      filter: { deptId: saved.deptId ?? '', deptName: saved.deptName, from: saved.from ?? '', to: saved.to ?? '', q: saved.q ?? '' },
    };
  }
  const exam: Exam = {
    name: saved.name,
    works: (saved.works ?? []).map(completeWork),
    terms: (saved.terms ?? []).map(completeTerm),
    filter: saved.filter ?? null,
    stats: upgradeStats(saved.stats),
  };
  if (typeof saved.course === 'string' && saved.course) exam.course = saved.course;
  return exam;
}

const looksSaved = (entry: unknown): entry is SavedExam =>
  typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string';

/** The exams in localStorage, skipping anything unreadable. Empty when there are none. */
export function loadLegacyExams(): Exam[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter(looksSaved).map(upgrade) : [];
  } catch {
    return [];
  }
}
