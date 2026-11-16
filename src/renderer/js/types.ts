// Shared data shapes. What gets saved is defined in shared/data.d.ts (the main process stores it);
// the rest here only exists while the app runs.
import type { Kind, Reading } from '../../shared/data.js';

export type { Exam, Filter, Kind, Reading, Score, StudyData, Term, Work } from '../../shared/data.js';

/** A picture and the page it came from ('' when there is none). */
export interface WorkImage {
  image: string;
  source: string;
}

/**
 * A reading found by a search. Some places give a summary straight away (`reading.excerpt`); for others the text
 * has to be fetched from `textUrl` when the reading is added (see services/readings.ts).
 */
export interface ReadingCandidate {
  reading: Reading;
  /** An https address of the text itself, for when `reading.excerpt` is empty. */
  textUrl?: string;
}

/** A study source choice; 'mix' alternates between works and terms. */
export type Source = Kind | 'mix';
export type Mode = 'flash' | 'quiz';

/** choices === null means flashcard; otherwise multiple choice. */
export interface TermCard {
  kind: 'terms';
  term: string;
  definition: string;
  source?: string;
  answer: string;
  choices: string[] | null;
}

/** choices === null means flashcard. In a quiz the excerpt has the title hidden, and the choices are titles. */
export interface ReadingCard {
  kind: 'readings';
  title: string;
  author: string;
  excerpt: string;
  source?: string;
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
  image: string;
  source?: string;
  answer: string;
  choices: string[] | null;
}

/** Cards whose facts can be corrected with "Edit details". */
export type EditableCard = TermCard | WorkCard;
export type Card = EditableCard | ReadingCard;
export interface CardError {
  error: string;
}
