// Shared data shapes. What gets saved is defined in shared/data.d.ts (the main process stores it);
// the rest here only exists while the app runs.
import type { Kind } from '../../shared/data.js';

export type { Exam, Filter, Kind, Score, StudyData, Term, Work } from '../../shared/data.js';

/** A picture and the page it came from ('' when there is none). */
export interface WorkImage {
  image: string;
  source: string;
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

export type Card = TermCard | WorkCard;
export interface CardError {
  error: string;
}
