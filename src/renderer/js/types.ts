// Shared data shapes.

export interface Work {
  id: string | number;
  title: string;
  artist: string;
  /** undefined = not looked up yet; '' = looked up, unknown. */
  nationality?: string;
  /** Art movement, e.g. "Impressionism". undefined = not looked up yet; '' = unknown. */
  movement?: string;
  date: string;
  img: string;
  src?: string;
}

/** A picture and the page it came from ('' when there is none). */
export interface WorkImage {
  img: string;
  src: string;
}

export interface Term {
  term: string;
  /** May be empty (flashcard-only term). */
  def: string;
  src?: string;
}

export interface Filter {
  deptId: string;
  deptName?: string;
  from: string;
  to: string;
  q: string;
}

/** works / terms: the exam's own lists. pool: random Met art from the exam's filter. */
export type Kind = 'works' | 'terms' | 'pool';
/** A study source choice; 'mix' alternates between works and terms. */
export type Source = Kind | 'mix';
export type Mode = 'flash' | 'quiz';

export interface Score {
  c: number;
  t: number;
}

export interface Exam {
  name: string;
  /** The class (course) it belongs to, e.g. "Art History 101". Absent = not in a class. */
  course?: string;
  works: Work[];
  terms: Term[];
  filter: Filter | null;
  stats: Partial<Record<Kind, Score>>;
}

/** choices === null means flashcard; otherwise multiple choice. */
export interface TermCard {
  kind: 'terms';
  term: string;
  def: string;
  src?: string;
  answer: string;
  choices: string[] | null;
}

/** What a multiple-choice question about a work asks for. */
export type Question = 'artist' | 'title' | 'year' | 'movement';

export interface WorkCard {
  kind: 'works' | 'pool';
  /** Which fact `answer` and `choices` are about. */
  question: Question;
  id: string | number;
  title: string;
  artist: string;
  nationality?: string;
  movement?: string;
  date: string;
  img: string;
  src?: string;
  answer: string;
  choices: string[] | null;
}

export type Card = TermCard | WorkCard;
export interface CardError {
  error: string;
}
