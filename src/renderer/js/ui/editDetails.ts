// "Edit details" form on the study screen: corrects a card's facts (and a work's image) when they turn out
// to be wrong, and saves the correction to the exam. study.ts says which card is on screen via `track`.
import { validateImageUrl } from '../imageUrl.js';
import { findWorkImage } from '../services/imageFinder.js';
import { saveExams } from '../store.js';
import type { Card, Exam, WorkCard, WorkImage } from '../types.js';
import type { ActionMap } from './actions.js';
import { byId, escapeHtml, field } from './dom.js';
import { fileToDataUrl } from './image.js';

interface Target {
  exam: Exam;
  card: Card;
  /** Called after a successful save, so the study view can redraw the card. */
  onSaved: () => void;
}

let target: Target | null = null;

/** Sets the card the form edits (null when no card is on screen). The card object is corrected in place. */
export function track(next: Target | null): void {
  target = next;
}

/** Cards from the exam's own lists can be edited; random Met art isn't saved in the exam. */
const isEditable = (card: Card | null): card is Card => card !== null && card.kind !== 'pool';

/** The fact a work question is about, as it is now. */
const factOf = (card: WorkCard): string =>
  ({ artist: card.artist, title: card.title, year: card.date, movement: card.movement ?? '' })[card.question];

/** Offers "Edit details" for the tracked card, once its answer is on screen. */
export function showEditButton(): void {
  if (isEditable(target?.card ?? null)) byId('editBar').innerHTML = '<button type="button" class="secondary" data-action="study.edit">Edit details</button>';
}

/** The image the open form would save: set by "Find automatically", a chosen file or Remove. */
let editImage: WorkImage = { img: '', src: '' };

const editField = (id: string, label: string, value: string | undefined): string =>
  `<label class="field">${label}<input type="text" id="${id}" value="${escapeHtml(value)}"></label>`;

const previewHtml = (image: WorkImage): string =>
  image.img ? `<img src="${escapeHtml(image.img)}" alt="">` : '<span class="small">No image</span>';

const imageUrlFor = (image: WorkImage): string => (image.img.startsWith('https://') ? image.img : '');

const imageFieldsHtml = (image: WorkImage): string => `
  <div class="field">Image
    <div id="editPreview" class="edit-preview">${previewHtml(image)}</div>
    <input type="text" id="editImageUrl" aria-label="Image link" placeholder="Paste an image link (https://…)" value="${escapeHtml(imageUrlFor(image))}">
    <div class="edit-actions">
      <button type="button" class="secondary" data-action="study.findImage">Find automatically</button>
      <button type="button" class="secondary" data-action="study.chooseImageFile">Choose a file…</button>
      <button type="button" class="secondary" data-action="study.removeImage">Remove</button>
    </div>
    <input type="file" id="editImageFile" accept="image/*" hidden data-change="study.imageFileChosen">
    <div id="editImageMsg" class="small"></div>
  </div>`;

function editFormHtml(card: Card): string {
  const fields = card.kind === 'terms'
    ? `${editField('editTerm', 'Term', card.term)}
       <label class="field">Definition<textarea id="editDef" rows="4">${escapeHtml(card.def)}</textarea></label>`
    : `${editField('editArtist', 'Artist', card.artist)}${editField('editNationality', 'Nationality', card.nationality)}
       ${editField('editTitle', 'Title', card.title)}${editField('editDate', 'Date', card.date)}
       ${editField('editMovement', 'Art movement', card.movement)}${imageFieldsHtml(editImage)}`;
  return `<div class="edit-form">
    ${fields}
    <div id="editMsg" class="small">Saved to this exam. Leave a field empty if it's unknown.</div>
    <button type="button" data-action="study.saveEdit">Save</button>
    <button type="button" class="secondary" data-action="study.cancelEdit">Cancel</button>
  </div>`;
}

function openEdit(): void {
  const card = target?.card ?? null;
  if (!isEditable(card)) return;
  if (card.kind !== 'terms') editImage = { img: card.img, src: card.src ?? '' };
  byId('editBar').innerHTML = '';
  byId('editArea').innerHTML = editFormHtml(card);
}

function closeEdit(): void {
  byId('editArea').innerHTML = '';
  showEditButton();
}

const inputValue = (id: string): string => field(id, HTMLInputElement).value.trim();
const formIsOpen = (): boolean => document.querySelector('#editArea .edit-form') !== null;

// -- the image part of the form --

const imageMessage = (text: string): void => { byId('editImageMsg').textContent = text; };

function setEditImage(image: WorkImage, message: string): void {
  editImage = image;
  byId('editPreview').innerHTML = previewHtml(image);
  field('editImageUrl', HTMLInputElement).value = imageUrlFor(image);
  imageMessage(message);
}

async function findImageAutomatically(): Promise<void> {
  const title = inputValue('editTitle');
  if (!title) { imageMessage('Enter a title first.'); return; }
  imageMessage('Searching…');
  const found = await findWorkImage({ artist: inputValue('editArtist'), title });
  if (!formIsOpen()) return; // closed while searching
  if (found.img) setEditImage(found, 'Found an image. Check it looks right, then Save.');
  else imageMessage('No image found. Paste a link or choose a file instead.');
}

async function imageFileChosen(element: HTMLElement): Promise<void> {
  const input = element as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  imageMessage('Reading image…');
  try {
    const img = await fileToDataUrl(file);
    if (formIsOpen()) setEditImage({ img, src: '' }, 'Image added from your file. Save to keep it.');
  } catch (error) {
    if (formIsOpen()) imageMessage(error instanceof Error ? error.message : 'Could not read that image.');
  } finally {
    input.value = ''; // lets the same file be chosen again
  }
}

/** The image to save: a link typed into the box wins over the one chosen or found. */
function imageToSave(): WorkImage {
  const typed = inputValue('editImageUrl');
  return typed && typed !== editImage.img ? { img: typed, src: typed } : editImage;
}

// -- saving --

function saveEdit(): void {
  if (!target || target.card.kind === 'pool') return;
  const { exam: owner, card: current, onSaved } = target;
  const message = (text: string): void => { byId('editMsg').textContent = text; };
  const undo: (() => void)[] = []; // put everything back if saving fails

  /** Applies `values` to `target`, remembering how to undo it. */
  const change = <T extends object>(target: T, values: Partial<T>): void => {
    const before = { ...target };
    Object.assign(target, values);
    undo.push(() => { Object.assign(target, before); });
  };

  if (current.kind === 'terms') {
    const term = inputValue('editTerm');
    if (!term) { message('A term needs a name.'); return; }
    const def = field('editDef', HTMLTextAreaElement).value.trim();
    const saved = owner.terms.find((term) => term.term === current.term);
    if (saved) change(saved, { term, def });
    change(current, { term, def, answer: term });
  } else {
    const image = imageToSave();
    // Only check an image the user changed: one saved earlier must not block editing something else.
    const problem = image.img === current.img ? null : validateImageUrl(image.img);
    if (problem) { message(problem); return; }
    const details = {
      artist: inputValue('editArtist'), nationality: inputValue('editNationality'), title: inputValue('editTitle'),
      date: inputValue('editDate'), movement: inputValue('editMovement'), img: image.img, src: image.src,
    };
    if (!details.title) { message('A work needs a title.'); return; }
    const saved = owner.works.find((work) => work.id === current.id);
    if (saved) change(saved, details);
    change(current, details);
    change(current, { answer: factOf(current) });
    // Nationality belongs to the artist, so fix it on their other works too.
    if (details.artist) {
      for (const work of owner.works) if (work.artist === details.artist) change(work, { nationality: details.nationality });
    }
  }

  try {
    saveExams();
  } catch {
    undo.reverse().forEach((revert) => { revert(); });
    message("Couldn't save your changes, so nothing was changed. Try again.");
    return;
  }
  onSaved();
  closeEdit();
}

export const actions: ActionMap = {
  'study.edit': openEdit,
  'study.saveEdit': saveEdit,
  'study.cancelEdit': closeEdit,
  'study.findImage': findImageAutomatically,
  'study.chooseImageFile': () => { field('editImageFile', HTMLInputElement).click(); },
  'study.imageFileChosen': imageFileChosen,
  'study.removeImage': () => { setEditImage({ img: '', src: '' }, 'Image removed. Save to keep that.'); },
};
