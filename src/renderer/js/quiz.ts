// Study logic: what can be studied and how a question is built.
// Knows about exams and cards; knows nothing about the DOM or localStorage.
import { FAMOUS_ARTISTS, FAMOUS_MOVEMENTS, FAMOUS_TITLES } from './data/fallbacks.js';
import { pickRandomWork } from './services/randomArt.js';
import { maskTerm } from './textMask.js';
import type { Card, CardError, Exam, Kind, Mode, Question, Source, Work } from './types.js';
import { pick, shuffle, unique } from './util.js';
import { decoyDates, parseYear } from './years.js';

const DISTRACTORS = 3;

export interface SourceOption {
  value: Source;
  label: string;
}

/** Study sources an exam supports, for the source dropdown. */
export function studySources(exam: Exam): SourceOption[] {
  const sources: SourceOption[] = [];
  if (exam.works.length && exam.terms.length) sources.push({ value: 'mix', label: 'Works + Terms (mixed)' });
  if (exam.works.length) sources.push({ value: 'works', label: 'Must Know Works' });
  if (exam.terms.length) sources.push({ value: 'terms', label: 'Must Know Terms' });
  if (exam.filter) sources.push({ value: 'pool', label: 'Random Art' });
  return sources;
}

/** 'mix' becomes works or terms per card; other sources pass through. */
export const resolveKind = (source: Source): Kind =>
  source === 'mix' ? (Math.random() < 0.5 ? 'works' : 'terms') : source;

/** The right answer plus up to 3 distinct wrong ones, shuffled. */
function withDistractors(answer: string, candidates: readonly string[]): string[] {
  const wrong = unique(candidates.filter((candidate) => candidate && candidate.toLowerCase() !== answer.toLowerCase()));
  return shuffle([answer, ...shuffle(wrong).slice(0, DISTRACTORS)]);
}

export const isCardError = (result: Card | CardError): result is CardError => 'error' in result;

async function drawWork(exam: Exam, kind: 'works' | 'pool'): Promise<Work | null> {
  try {
    if (kind === 'works') return exam.works.length ? pick(exam.works) : null;
    return exam.filter ? await pickRandomWork(exam.filter) : null;
  } catch {
    return null; // offline etc.
  }
}

/** The facts a quiz can ask about this work (a title question needs the image: otherwise the title is shown). */
export function availableQuestions(work: Work, hasImage = Boolean(work.img)): Question[] {
  const questions: Question[] = [];
  if (work.artist) questions.push('artist');
  if (hasImage && work.title) questions.push('title');
  if (parseYear(work.date) !== null) questions.push('year');
  if (work.movement) questions.push('movement');
  return questions;
}

const answerFor = (question: Question, work: Work): string =>
  ({ artist: work.artist, title: work.title, year: work.date, movement: work.movement ?? '' })[question];

function choicesFor(question: Question, work: Work, exam: Exam): string[] {
  const answer = answerFor(question, work);
  switch (question) {
    case 'artist': return withDistractors(answer, [...exam.works.map((other) => other.artist), ...FAMOUS_ARTISTS]);
    case 'title': return withDistractors(answer, [...exam.works.map((other) => other.title), ...FAMOUS_TITLES]);
    case 'year': return withDistractors(answer, decoyDates(answer, 8));
    case 'movement': return withDistractors(answer, [...exam.works.map((other) => other.movement ?? ''), ...FAMOUS_MOVEMENTS]);
  }
}

/** A card, or { error } when nothing can be shown. */
export async function drawCard(exam: Exam, kind: Kind, mode: Mode): Promise<Card | CardError> {
  const quiz = mode === 'quiz';

  if (kind === 'terms') {
    const pool = quiz ? exam.terms.filter((candidate) => candidate.def) : exam.terms;
    if (!pool.length) return { error: 'No terms with definitions for quiz mode.' };
    const term = pick(pool);
    return {
      kind, term: term.term, def: quiz ? maskTerm(term.def, term.term) : term.def, src: term.src, answer: term.term,
      choices: quiz ? withDistractors(term.term, exam.terms.map((other) => other.term)) : null,
    };
  }

  const work = await drawWork(exam, kind);
  if (!work) return { error: 'No artwork found for this exam. Edit filters or check connection.' };

  // Quiz: ask about a random fact we know. A work with nothing to ask about is shown as a flashcard.
  const questions = quiz ? availableQuestions(work) : [];
  const question: Question = questions.length ? pick(questions) : 'artist';
  return {
    kind, question, id: work.id, title: work.title, artist: work.artist, nationality: work.nationality,
    movement: work.movement, date: work.date, img: work.img, src: work.src,
    answer: answerFor(question, work),
    choices: questions.length ? choicesFor(question, work, exam) : null,
  };
}
