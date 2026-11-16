// What the app saves: the shapes shared by the page (which uses them) and the main process (which stores them
// in SQLite, see main/database.ts). Adding a field here means adding a column there.

export interface Work {
  id: string | number;
  title: string;
  artist: string;
  /** undefined = not looked up yet; '' = looked up, unknown. */
  nationality?: string;
  /** Art movement, e.g. "Impressionism". undefined = not looked up yet; '' = unknown. */
  movement?: string;
  date: string;
  image: string;
  source?: string;
}

export interface Term {
  term: string;
  /** May be empty (flashcard-only term). */
  definition: string;
  source?: string;
}

/** A text to read for the exam: a book, an article, a web page. */
export interface Reading {
  /** Unique within the exam: "gutenberg-84", "archive-<identifier>", "wikipedia-<page>" or "link-<address>". */
  id: string;
  title: string;
  /** May be empty. */
  author: string;
  /** The opening of the text, or a summary of it: what the reading is reviewed from. May be empty. */
  excerpt: string;
  /** Where to read all of it: an https address, or '' when there is none. */
  source: string;
}

export interface Filter {
  deptId: string;
  deptName?: string;
  from: string;
  to: string;
  q: string;
}

/** works / terms / readings: the exam's own lists. pool: random Met art from the exam's filter. */
export type Kind = 'works' | 'terms' | 'readings' | 'pool';

export interface Score {
  correct: number;
  total: number;
}

export interface Exam {
  name: string;
  /** The class (course) it belongs to, e.g. "Art History 101". Absent = not in a class. */
  course?: string;
  works: Work[];
  terms: Term[];
  readings: Reading[];
  filter: Filter | null;
  stats: Partial<Record<Kind, Score>>;
}

/** Everything that is saved, in display order. */
export interface StudyData {
  /** Class names. */
  courses: string[];
  exams: Exam[];
}
