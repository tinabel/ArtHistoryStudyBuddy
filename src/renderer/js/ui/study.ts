// Study view: renders cards and records answers. Question logic lives in quiz.ts,
// persistence in store.ts, the "Edit details" form in editDetails.ts.
import { drawCard, isCardError, resolveKind, studySources } from '../quiz.js';
import { enrichWorks, lookupWorkInfo } from '../services/workInfo.js';
import { kindStats, recordResult, saveExams } from '../store.js';
import type { Card, Exam, Kind, Mode, Question, Source, WorkCard } from '../types.js';
import { indexOf, type ActionMap } from './actions.js';
import { byId, escapeHtml, field, sourceLink } from './dom.js';
import * as details from './editDetails.js';
import { go } from './router.js';

let currentExam: Exam | null = null;
let currentCard: Card | null = null;
let kind: Kind = 'works';
let answered = false;
let session = { correct: 0, total: 0 };
let drawId = 0; // guards against out-of-order async draws
/** What the answer area currently shows, so it can be redrawn after the details are edited. */
let shown: { kind: 'feedback'; correct: boolean } | { kind: 'reveal' } | null = null;

const setCard = (html: string): void => { byId('card').innerHTML = html; };
const modeSelect = (): HTMLSelectElement => field('mode', HTMLSelectElement);
const sourceSelect = (): HTMLSelectElement => field('source', HTMLSelectElement);
const currentMode = (): Mode => modeSelect().value as Mode;

export function start(selected: Exam): void {
  currentExam = selected;
  session = { correct: 0, total: 0 };
  byId('studyTitle').textContent = currentExam.name;
  sourceSelect().innerHTML = studySources(currentExam)
    .map((source) => `<option value="${source.value}">${escapeHtml(source.label)}</option>`).join('');
  go('study');
  void next();
  // Fill in nationality / movement for works saved before those existed, in the background.
  void enrichWorks(currentExam.works, saveExams);
}

async function next(): Promise<void> {
  if (!currentExam) return;
  const ticket = ++drawId;
  answered = false;
  shown = null;
  kind = resolveKind(sourceSelect().value as Source);
  setCard('<div class="small">Loading...</div>');
  updateScore();

  const drawn = await drawCard(currentExam, kind, currentMode());
  if (!isCardError(drawn)) await backfillArtistInfo(currentExam, drawn);
  if (ticket !== drawId) return;

  if (isCardError(drawn)) {
    currentCard = null;
    details.track(null);
    setCard(`<div class="small">${escapeHtml(drawn.error)}</div>`);
  } else {
    currentCard = drawn;
    details.track({ exam: currentExam, card: drawn, onSaved: redrawAfterEdit });
    setCard(cardHtml(drawn));
  }
}

/** The card's facts were corrected in place: show the new image and redraw whatever answer is on screen. */
function redrawAfterEdit(): void {
  const media = document.querySelector('.card-media');
  if (currentCard && currentCard.kind !== 'terms' && media) media.innerHTML = mediaInnerHtml(currentCard);
  if (shown?.kind === 'feedback') showFeedback(shown.correct);
  else if (shown?.kind === 'reveal') reveal();
}

/**
 * Works saved before nationality / movement existed: look them up once and remember them ('' = looked up, unknown).
 * The background pass started in `start` does this for every work; this makes sure the card on screen has them.
 */
async function backfillArtistInfo(owner: Exam, card: Card): Promise<void> {
  if (card.kind !== 'works' || !card.artist || (card.nationality !== undefined && card.movement !== undefined)) return;
  const info = await lookupWorkInfo(card);
  if (!info) return; // couldn't ask: leave the fields unset so a later session retries
  card.nationality ??= info.nationality;
  card.movement ??= info.movement;
  const saved = owner.works.find((work) => work.id === card.id);
  if (saved) {
    saved.nationality ??= info.nationality;
    saved.movement ??= info.movement;
    saveExams();
  }
}

// ---- rendering ----

function mediaInnerHtml(card: WorkCard): string {
  return card.image
    ? `<img src="${escapeHtml(card.image)}">`
    : `<h3>${escapeHtml(card.title)}</h3><div class="small">(no image)</div>`;
}

function mediaHtml(card: Card): string {
  return card.kind === 'terms' ? '' : `<div class="card-media">${mediaInnerHtml(card)}</div>`;
}

const QUESTION_TEXT: Record<Question, string> = {
  artist: 'Who is the artist?',
  title: 'What is the title of this work?',
  year: 'When was this made?',
  movement: 'What art movement is this?',
};

function questionHtml(card: Card): string {
  if (card.kind === 'terms') {
    return card.choices
      ? `<div class="prompt">${escapeHtml(card.definition)}</div><div>Which term?</div>`
      : `<h3 class="prompt">${escapeHtml(card.term)}</h3>`;
  }
  return card.choices ? `<div>${QUESTION_TEXT[card.question]}</div>` : '';
}

function interactionHtml(card: Card): string {
  if (card.choices) {
    return `<div id="choices">${card.choices.map((choice, choiceIndex) =>
      `<div><button type="button" class="secondary choice" data-action="study.pick" data-i="${choiceIndex}">${escapeHtml(choice)}</button></div>`).join('')}</div>`;
  }
  const label = card.kind === 'terms' ? 'Definition' : 'Answer';
  return `<div id="answer"><button type="button" data-action="study.reveal">Show ${label}</button></div>`;
}

function cardHtml(card: Card): string {
  return `<div class="card-layout${card.kind === 'terms' ? '' : ' with-media'}">
    ${mediaHtml(card)}
    <div class="card-body">
      ${questionHtml(card)}${interactionHtml(card)}
      <div id="feedback"></div>
      <div id="editBar"></div>
      <button type="button" class="secondary" data-action="study.next">Next</button>
      <div id="editArea"></div>
    </div>
  </div>`;
}

const gradeButtonsHtml = (): string => answered ? '' : `
  <div id="selfgrade">
    <button type="button" data-action="study.grade" data-ok="true">Got it</button>
    <button type="button" class="danger" data-action="study.grade" data-ok="false">Missed</button>
  </div>`;

const workDetails = (card: WorkCard): string =>
  `${escapeHtml(card.title)}, ${escapeHtml(card.date)}${card.movement ? ` · ${escapeHtml(card.movement)}` : ''}`;
const artistLabel = (card: WorkCard): string => `${escapeHtml(card.artist || 'Unknown')}${card.nationality ? ` (${escapeHtml(card.nationality)})` : ''}`;

/** The answer first, then the rest of the work's citation (so the answer isn't repeated). */
function answerSummary(card: Card): string {
  if (card.kind === 'terms') return escapeHtml(card.answer);
  const movement = card.movement ? ` · ${escapeHtml(card.movement)}` : '';
  switch (card.question) {
    case 'artist': return `${artistLabel(card)} — ${escapeHtml(card.title)}, ${escapeHtml(card.date)}${movement}`;
    case 'title': return `${escapeHtml(card.title)} — ${artistLabel(card)}, ${escapeHtml(card.date)}${movement}`;
    case 'year': return `${escapeHtml(card.date)} — ${escapeHtml(card.title)}, ${artistLabel(card)}${movement}`;
    case 'movement': return `${escapeHtml(card.movement)} — ${escapeHtml(card.title)}, ${artistLabel(card)}, ${escapeHtml(card.date)}`;
  }
}

function updateScore(): void {
  const allTime = currentExam ? kindStats(currentExam, kind) : undefined;
  const percent = allTime?.total ? Math.round(100 * allTime.correct / allTime.total) : 0;
  byId('score').textContent = `Session: ${session.correct} / ${session.total}` +
    (allTime ? ` · All-time: ${allTime.correct} / ${allTime.total} (${percent}%)` : '');
}

// ---- answering ----

function record(correct: boolean): void {
  if (answered || !currentExam) return;
  answered = true;
  session.total++;
  if (correct) session.correct++;
  recordResult(currentExam, kind, correct);
  updateScore();
  document.getElementById('selfgrade')?.remove();
  details.showEditButton();
}

function reveal(): void {
  if (!currentCard) return;
  const body = currentCard.kind === 'terms'
    ? escapeHtml(currentCard.definition || '(no definition — edit exam to add)')
    : `<strong>${artistLabel(currentCard)}</strong><br>${workDetails(currentCard)}`;
  byId('answer').innerHTML = body + sourceLink(currentCard.source) + gradeButtonsHtml();
  shown = { kind: 'reveal' };
  details.showEditButton();
}

function showFeedback(correct: boolean): void {
  if (!currentCard) return;
  const feedback = byId('feedback');
  feedback.className = correct ? 'correct' : 'incorrect';
  feedback.innerHTML = `${correct ? 'Correct! ' : 'Answer: '}${answerSummary(currentCard)}${sourceLink(currentCard.source)}`;
  shown = { kind: 'feedback', correct };
}

function pickChoice(index: number): void {
  if (answered || !currentCard?.choices) return;
  const correct = currentCard.choices[index] === currentCard.answer;
  showFeedback(correct);
  const choices = currentCard.choices;
  document.querySelectorAll('#choices button').forEach((button, choiceIndex) => {
    if (choices[choiceIndex] === currentCard?.answer) button.classList.add('right');
    else if (choiceIndex === index) button.classList.add('wrong');
  });
  record(correct);
}

export const actions: ActionMap = {
  'study.back': () => { go('home'); },
  'study.next': next,
  'study.reveal': reveal,
  'study.pick': (element) => { pickChoice(indexOf(element)); },
  'study.grade': (element) => { record(element.dataset.ok === 'true'); },
  ...details.actions,
};
