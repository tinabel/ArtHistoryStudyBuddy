// Study view: renders cards and records answers. Question logic lives in quiz.ts,
// persistence in store.ts, the "Edit details" form in editDetails.ts.
import { drawCard, isCardError, resolveKind, studySources } from '../quiz.js';
import { enrichWorks, lookupWorkInfo } from '../services/workInfo.js';
import { kindStats, recordResult, saveExams } from '../store.js';
import type { Card, Exam, Kind, Mode, Question, Source, WorkCard } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { $, esc, field, sourceLink } from './dom.js';
import * as details from './editDetails.js';
import { go } from './router.js';

let exam: Exam | null = null;
let card: Card | null = null;
let kind: Kind = 'works';
let answered = false;
let session = { correct: 0, total: 0 };
let drawId = 0; // guards against out-of-order async draws
/** What the answer area currently shows, so it can be redrawn after the details are edited. */
let shown: { kind: 'feedback'; correct: boolean } | { kind: 'reveal' } | null = null;

const setCard = (html: string): void => { $('card').innerHTML = html; };
const modeSelect = (): HTMLSelectElement => field('mode', HTMLSelectElement);
const sourceSelect = (): HTMLSelectElement => field('source', HTMLSelectElement);
const currentMode = (): Mode => modeSelect().value as Mode;

export function start(selected: Exam): void {
  exam = selected;
  session = { correct: 0, total: 0 };
  $('studyTitle').textContent = exam.name;
  sourceSelect().innerHTML = studySources(exam)
    .map((s) => `<option value="${s.value}">${esc(s.label)}</option>`).join('');
  go('study');
  void next();
  // Fill in nationality / movement for works saved before those existed, in the background.
  void enrichWorks(exam.works, saveExams);
}

async function next(): Promise<void> {
  if (!exam) return;
  const ticket = ++drawId;
  answered = false;
  shown = null;
  kind = resolveKind(sourceSelect().value as Source);
  setCard('<div class="small">Loading...</div>');
  updateScore();

  const drawn = await drawCard(exam, kind, currentMode());
  if (!isCardError(drawn)) await backfillArtistInfo(exam, drawn);
  if (ticket !== drawId) return;

  if (isCardError(drawn)) {
    card = null;
    details.track(null);
    setCard(`<div class="small">${esc(drawn.error)}</div>`);
  } else {
    card = drawn;
    details.track({ exam, card: drawn, onSaved: redrawAfterEdit });
    setCard(cardHtml(drawn));
  }
}

/** The card's facts were corrected in place: show the new image and redraw whatever answer is on screen. */
function redrawAfterEdit(): void {
  const media = document.querySelector('.card-media');
  if (card && card.kind !== 'terms' && media) media.innerHTML = mediaInnerHtml(card);
  if (shown?.kind === 'feedback') showFeedback(shown.correct);
  else if (shown?.kind === 'reveal') reveal();
}

/**
 * Works saved before nationality / movement existed: look them up once and remember them ('' = looked up, unknown).
 * The background pass started in `start` does this for every work; this makes sure the card on screen has them.
 */
async function backfillArtistInfo(owner: Exam, c: Card): Promise<void> {
  if (c.kind !== 'works' || !c.artist || (c.nationality !== undefined && c.movement !== undefined)) return;
  const info = await lookupWorkInfo(c);
  if (!info) return; // couldn't ask: leave the fields unset so a later session retries
  c.nationality ??= info.nationality;
  c.movement ??= info.movement;
  const saved = owner.works.find((w) => w.id === c.id);
  if (saved) {
    saved.nationality ??= info.nationality;
    saved.movement ??= info.movement;
    saveExams();
  }
}

// ---- rendering ----

function mediaInnerHtml(c: WorkCard): string {
  return c.img
    ? `<img src="${esc(c.img)}">`
    : `<h3>${esc(c.title)}</h3><div class="small">(no image)</div>`;
}

function mediaHtml(c: Card): string {
  return c.kind === 'terms' ? '' : `<div class="card-media">${mediaInnerHtml(c)}</div>`;
}

const QUESTION_TEXT: Record<Question, string> = {
  artist: 'Who is the artist?',
  title: 'What is the title of this work?',
  year: 'When was this made?',
  movement: 'What art movement is this?',
};

function questionHtml(c: Card): string {
  if (c.kind === 'terms') {
    return c.choices
      ? `<div class="prompt">${esc(c.def)}</div><div>Which term?</div>`
      : `<h3 class="prompt">${esc(c.term)}</h3>`;
  }
  return c.choices ? `<div>${QUESTION_TEXT[c.question]}</div>` : '';
}

function interactionHtml(c: Card): string {
  if (c.choices) {
    return `<div id="choices">${c.choices.map((choice, i) =>
      `<div><button type="button" class="sec choice" data-action="study.pick" data-i="${i}">${esc(choice)}</button></div>`).join('')}</div>`;
  }
  const label = c.kind === 'terms' ? 'Definition' : 'Answer';
  return `<div id="answer"><button type="button" data-action="study.reveal">Show ${label}</button></div>`;
}

function cardHtml(c: Card): string {
  return `<div class="card-layout${c.kind === 'terms' ? '' : ' with-media'}">
    ${mediaHtml(c)}
    <div class="card-body">
      ${questionHtml(c)}${interactionHtml(c)}
      <div id="feedback"></div>
      <div id="editBar"></div>
      <button type="button" class="sec" data-action="study.next">Next</button>
      <div id="editArea"></div>
    </div>
  </div>`;
}

const gradeButtonsHtml = (): string => answered ? '' : `
  <div id="selfgrade">
    <button type="button" data-action="study.grade" data-ok="true">Got it</button>
    <button type="button" class="del" data-action="study.grade" data-ok="false">Missed</button>
  </div>`;

const workDetails = (c: WorkCard): string =>
  `${esc(c.title)}, ${esc(c.date)}${c.movement ? ` · ${esc(c.movement)}` : ''}`;
const artistLabel = (c: WorkCard): string => `${esc(c.artist || 'Unknown')}${c.nationality ? ` (${esc(c.nationality)})` : ''}`;

/** The answer first, then the rest of the work's citation (so the answer isn't repeated). */
function answerSummary(c: Card): string {
  if (c.kind === 'terms') return esc(c.answer);
  const movement = c.movement ? ` · ${esc(c.movement)}` : '';
  switch (c.question) {
    case 'artist': return `${artistLabel(c)} — ${esc(c.title)}, ${esc(c.date)}${movement}`;
    case 'title': return `${esc(c.title)} — ${artistLabel(c)}, ${esc(c.date)}${movement}`;
    case 'year': return `${esc(c.date)} — ${esc(c.title)}, ${artistLabel(c)}${movement}`;
    case 'movement': return `${esc(c.movement)} — ${esc(c.title)}, ${artistLabel(c)}, ${esc(c.date)}`;
  }
}

function updateScore(): void {
  const all = exam ? kindStats(exam, kind) : undefined;
  const pct = all?.t ? Math.round(100 * all.c / all.t) : 0;
  $('score').textContent = `Session: ${session.correct} / ${session.total}` +
    (all ? ` · All-time: ${all.c} / ${all.t} (${pct}%)` : '');
}

// ---- answering ----

function record(correct: boolean): void {
  if (answered || !exam) return;
  answered = true;
  session.total++;
  if (correct) session.correct++;
  recordResult(exam, kind, correct);
  updateScore();
  document.getElementById('selfgrade')?.remove();
  details.showEditButton();
}

function reveal(): void {
  if (!card) return;
  const body = card.kind === 'terms'
    ? esc(card.def || '(no definition — edit exam to add)')
    : `<strong>${artistLabel(card)}</strong><br>${workDetails(card)}`;
  $('answer').innerHTML = body + sourceLink(card.src) + gradeButtonsHtml();
  shown = { kind: 'reveal' };
  details.showEditButton();
}

function showFeedback(correct: boolean): void {
  if (!card) return;
  const feedback = $('feedback');
  feedback.className = correct ? 'correct' : 'incorrect';
  feedback.innerHTML = `${correct ? 'Correct! ' : 'Answer: '}${answerSummary(card)}${sourceLink(card.src)}`;
  shown = { kind: 'feedback', correct };
}

function pickChoice(index: number): void {
  if (answered || !card?.choices) return;
  const correct = card.choices[index] === card.answer;
  showFeedback(correct);
  const choices = card.choices;
  document.querySelectorAll('#choices button').forEach((button, i) => {
    if (choices[i] === card?.answer) button.classList.add('right');
    else if (i === index) button.classList.add('wrong');
  });
  record(correct);
}

export const actions: ActionMap = {
  'study.back': () => { go('home'); },
  'study.next': next,
  'study.reveal': reveal,
  'study.pick': (el) => { pickChoice(indexOf(el)); },
  'study.grade': (el) => { record(el.dataset.ok === 'true'); },
  ...details.actions,
};
