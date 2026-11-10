/**
 * @jest-environment jsdom
 */
// Drives the real UI modules in jsdom: markup from index.html, events through the app's dispatcher.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as Store from '../src/renderer/js/store.js';
import type { Exam, Term, Work } from '../src/renderer/js/types.js';
import { fileToDataUrl } from '../src/renderer/js/ui/image.js';
import { fakeDatabase } from './helpers/fakeDatabase.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

// Resizing needs a real <canvas>, which jsdom lacks; the file-to-thumbnail step is replaced here and checked in Electron.
jest.mock('../src/renderer/js/ui/image.js', () => ({ fileToDataUrl: jest.fn() }));

jest.setTimeout(20_000);

let store: typeof Store;
const database = fakeDatabase();
/** The exams as last saved to the (fake) database. */
const savedExams = (): Exam[] => database.saved?.exams ?? [];
let go: (view: 'home' | 'editor' | 'study') => void;

// ---- helpers ----

const $ = (selector: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No element matches ${selector}`);
  return el;
};
const all = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];
const text = (selector: string): string => $(selector).textContent.replace(/\s+/g, ' ').trim();
const click = (selector: string | HTMLElement): void => { (typeof selector === 'string' ? $(selector) : selector).click(); };
const act = (name: string, index?: number): HTMLElement =>
  all(`[data-action="${name}"]`)[index ?? 0] ?? (() => { throw new Error(`No action ${name}`); })();
const setValue = (selector: string, value: string): void => { ($(selector) as HTMLInputElement).value = value; };
const choose = (selector: string, value: string): void => {
  const el = $(selector) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });
async function waitFor(condition: () => boolean, what = 'condition'): Promise<void> {
  for (let i = 0; i < 1000; i++) { // up to 10 s: generous, because a loaded CI machine can be slow
    if (condition()) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
/** Waits until the study card has finished loading (a fixed sleep is too short on a busy machine). */
const settle = async (): Promise<void> => {
  await sleep(0);
  await waitFor(() => !$('#card').textContent.includes('Loading...'), 'the card to load');
};

const view = (): string => (['home', 'editor', 'study'].find((id) => !$(`#${id}`).hidden) ?? 'none');

const TERM_NAMES = ['Realism', 'Sublime', 'Japonisme', 'Primitivism'];
// The code in each definition identifies its term even though the quiz masks the term's own name.
const termsOf = (...names: string[]): Term[] => names.map((n, i) => ({ term: n, def: `${n} was a movement (code ${i}).`, src: 'https://en.wikipedia.org/wiki/x' }));
const termInPrompt = (prompt: string): string => TERM_NAMES[Number(/code (\d+)/.exec(prompt)?.[1])] ?? '';
const works: Work[] = [
  { id: 1, title: 'Third of May', artist: 'Francisco Goya', nationality: 'Spanish', movement: 'Romanticism', date: '1814', img: 'img-goya.png', src: 'https://commons/goya' },
  { id: 2, title: 'Olympia', artist: 'Edouard Manet', nationality: 'French', movement: 'Realism', date: '1863', img: 'img-manet.png', src: 'https://commons/manet' },
  { id: 3, title: 'The Hay Wain', artist: 'John Constable', nationality: 'British', movement: 'Romanticism', date: '1821', img: 'img-constable.png', src: '' },
];
const seed = (over: Partial<Exam> = {}): Exam => {
  const exam = store.makeExam({ name: 'Nineteenth Century', works, terms: termsOf(...TERM_NAMES), ...over });
  store.addExam(exam);
  go('home');
  return exam;
};
async function study(sourceValue: string, mode: 'flash' | 'quiz'): Promise<void> {
  click(act('home.study'));
  await settle();
  choose('#mode', mode);
  choose('#source', sourceValue);
  await settle();
}

// ---- setup ----

beforeAll(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  document.body.innerHTML = (/<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');
  window.api = { readMd: jest.fn(), pickMd: jest.fn(), ...database };
  stubFetch([['/departments', { departments: [{ departmentId: 11, displayName: 'European Paintings' }] }]]);
  await import('../src/renderer/js/app.js');
  store = await import('../src/renderer/js/store.js');
  go = (await import('../src/renderer/js/ui/router.js')).go;
});

beforeEach(() => {
  store.getExams().splice(0);
  for (const name of [...store.getCourses()]) store.removeCourse(name);
  database.saved = null;
  stubFetch([['/departments', { departments: [{ departmentId: 11, displayName: 'European Paintings' }] }]]);
  ($('#mode') as HTMLSelectElement).value = 'flash'; // the dropdown keeps its value between tests
  go('home');
});

afterEach(restoreFetch);

// ---- tests ----

describe('home', () => {
  it('starts on the home view with an empty state', () => {
    expect(view()).toBe('home');
    expect(text('#examList')).toBe('No exams yet. Add one.');
  });

  it('lists exams with counts, and shows a score once there is one', () => {
    const exam = seed();
    expect(text('#examList')).toContain('3 works · 4 terms');
    expect(text('#examList')).not.toContain('%');
    store.recordResult(exam, 'terms', true);
    store.recordResult(exam, 'terms', false);
    go('home');
    expect(text('#examList')).toContain('50% (1/2)');
  });

  it('resets scores and deletes exams', () => {
    const exam = seed();
    store.recordResult(exam, 'works', true);
    go('home');
    click(act('home.reset'));
    expect(text('#examList')).not.toContain('%');
    click(act('home.delete'));
    expect(text('#examList')).toBe('No exams yet. Add one.');
    expect(store.getExams()).toHaveLength(0);
  });
});

describe('classes', () => {
  const addClass = (name: string): void => {
    setValue('#newCourse', name);
    click(act('home.addCourse'));
  };
  const headings = (): string[] => all('#examList h3').map((h) => h.textContent);

  it('adds classes in order, ignoring blanks and duplicates', () => {
    addClass('Art History 400: Indian and Southeast Asian Art');
    addClass('Art History 101');
    addClass('  ');
    addClass('Art History 101');
    expect(headings()).toEqual(['Art History 101', 'Art History 400: Indian and Southeast Asian Art']);
    expect(text('#examList')).toContain('No exams in this class yet.');
    expect(($('#newCourse') as HTMLInputElement).value).toBe('Art History 101'); // the duplicate stays for correcting
  });

  it("adds an exam to a class from that class's own button", () => {
    addClass('Art History 101');
    addClass('Art History 200: Western Romanticism');
    click(act('home.new', 1)); // the second class's "+ Add Exam"
    expect(($('#exCourse') as HTMLSelectElement).value).toBe('Art History 200: Western Romanticism');
    setValue('#exName', 'Romanticism Midterm');
    setValue('#exTerms', 'Sublime: awe mixed with terror');
    click(act('editor.save'));
    expect(store.getExams()[0]?.course).toBe('Art History 200: Western Romanticism');
    expect(text('#examList .course:nth-of-type(2)')).toContain('Romanticism Midterm');
    expect(text('#examList .course:nth-of-type(1)')).not.toContain('Romanticism Midterm');
  });

  it('hides the class choice in the editor until a class exists', () => {
    click(act('home.new'));
    expect($('#exCourse').hidden).toBe(true);
    click(act('editor.cancel'));
    addClass('Art History 101');
    click(act('home.new', 1)); // the general "+ Add Exam" under the list
    expect($('#exCourse').hidden).toBe(false);
    expect(($('#exCourse') as HTMLSelectElement).value).toBe('');
  });

  it('moves an exam between classes, and lists exams outside any class under "No class"', () => {
    seed();
    expect(all('[data-change="home.setCourse"]')).toHaveLength(0); // nothing to move to yet
    addClass('Art History 101');
    expect(headings()).toEqual(['Art History 101', 'No class']);
    choose('[data-change="home.setCourse"]', 'Art History 101');
    expect(store.getExams()[0]?.course).toBe('Art History 101');
    expect(headings()).toEqual(['Art History 101']);
    expect(text('#examList .course')).toContain('Nineteenth Century');
    choose('[data-change="home.setCourse"]', '');
    expect(store.getExams()[0]?.course).toBeUndefined();
  });

  it('removing a class keeps its exams', () => {
    seed({ course: 'Art History 101' });
    expect(headings()).toEqual(['Art History 101']);
    click(act('home.removeCourse'));
    expect(headings()).toEqual([]);
    expect(text('#examList')).toContain('Nineteenth Century');
    expect(store.getExams()[0]?.course).toBeUndefined();
  });

  it('study, reset and delete act on the right exam inside a class', async () => {
    seed({ name: 'Loose Exam' });
    seed({ name: 'Class Exam', course: 'Art History 101' });
    click(act('home.study')); // the class section comes first
    await settle();
    expect(text('#studyTitle')).toBe('Class Exam');
    click(act('study.back'));
    click(act('home.delete'));
    expect(store.getExams().map((e) => e.name)).toEqual(['Loose Exam']);
  });
});

describe('editor', () => {
  it('opens with a clean form and loads departments', async () => {
    click(act('home.new'));
    expect(view()).toBe('editor');
    await waitFor(() => ($('#exDept') as HTMLSelectElement).options.length > 1, 'departments');
    expect(($('#exName') as HTMLInputElement).value).toBe('');
  });

  it('validates before saving', () => {
    click(act('home.new'));
    click(act('editor.save'));
    expect(text('#editorMsg')).toBe('Name required.');
    setValue('#exName', 'Midterm');
    click(act('editor.save'));
    expect(text('#editorMsg')).toBe('Add works, terms, or a random pool.');
    click('#useFilter');
    expect($('#filterFields').hidden).toBe(false);
    setValue('#exFrom', '1400');
    click(act('editor.save'));
    expect(text('#editorMsg')).toBe('Set both years or neither.');
    expect(view()).toBe('editor');
  });

  it('saves an exam from typed terms (a term without a definition is kept)', () => {
    click(act('home.new'));
    setValue('#exName', 'Midterm');
    setValue('#exTerms', 'Realism: art of everyday life\nSublime');
    click(act('editor.save'));
    expect(view()).toBe('home');
    expect(text('#examList')).toContain('Midterm');
    expect(text('#examList')).toContain('0 works · 2 terms');
    expect(store.getExams()[0]?.terms).toEqual([
      { term: 'Realism', def: 'art of everyday life', src: '' },
      { term: 'Sublime', def: '', src: '' },
    ]);
    expect(savedExams()).toHaveLength(1);
  });

  it('saves a random-art pool exam', () => {
    click(act('home.new'));
    setValue('#exName', 'Pool');
    click('#useFilter');
    setValue('#exFrom', '1800');
    setValue('#exTo', '1900');
    setValue('#exQ', 'landscape');
    click(act('editor.save'));
    expect(store.getExams()[0]?.filter).toMatchObject({ from: '1800', to: '1900', q: 'landscape' });
    expect(text('#examList')).toContain('random pool');
  });

  it('cancel returns home without saving', () => {
    click(act('home.new'));
    setValue('#exName', 'Nope');
    click(act('editor.cancel'));
    expect(view()).toBe('home');
    expect(store.getExams()).toHaveLength(0);
  });

  it('searches the Met, adds and removes works (Enter key searches too)', async () => {
    stubFetch([
      ['/objects/5', { objectID: 5, title: 'Haystacks', artistDisplayName: 'Claude Monet', artistNationality: 'French', objectDate: '1891', primaryImageSmall: 'h.jpg', objectURL: 'https://met/5' }],
      ['/search', { objectIDs: [5] }],
      ['/departments', { departments: [] }],
    ]);
    click(act('home.new'));
    setValue('#searchQ', 'monet');
    $('#searchQ').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => text('#searchResults').includes('Haystacks'), 'search results');
    expect(text('#searchResults')).toContain('Claude Monet (French) · 1891');
    click(act('editor.addResult'));
    expect(text('#addedCount')).toBe('1');
    click(act('editor.addResult')); // adding the same work again is ignored
    expect(text('#addedCount')).toBe('1');
    click(act('editor.removeWork'));
    expect(text('#addedCount')).toBe('0');
  });

  it('imports a markdown file: terms get definitions, works get images and nationality', async () => {
    (window.api.readMd as jest.Mock).mockResolvedValue('# Imported Exam\n## Must Know Works\n- Gustave Courbet, The Stone Breakers, 1849 (p. 1)\n## Must Know Terms\n- Realism');
    stubFetch([
      ['rest_v1/page/summary', { extract: 'Realism was a movement. It began in France.' }],
      ['list=search', { query: { search: [{ title: 'Realism' }] } }],
      ['commons.wikimedia.org', { query: { pages: { a: { index: 1, title: 'File:Courbet.jpg', imageinfo: [{ thumburl: 'courbet.jpg', descriptionurl: 'https://commons/c' }] } } } }],
      [/search=Gustave\+Courbet&/, { search: [{ id: 'Q701', description: 'painter' }] }],
      [/ids=Q701\b/, { entities: { Q701: { claims: { P27: [{ mainsnak: { datavalue: { value: { id: 'Q801' } } } }] } } } }],
      [/ids=Q801\b/, { entities: { Q801: { claims: { P1549: [{ mainsnak: { datavalue: { value: { text: 'French', language: 'en' } } } }] }, labels: {} } } }],
      ['/departments', { departments: [] }],
    ]);
    click(act('home.new'));
    setValue('#mdPath', '~/exam.md');
    click(act('editor.importPath'));
    await waitFor(() => text('#editorMsg').startsWith('Imported'), 'import');

    expect(window.api.readMd).toHaveBeenCalledWith('~/exam.md');
    expect(($('#exName') as HTMLInputElement).value).toBe('Imported Exam');
    expect(($('#exTerms') as HTMLTextAreaElement).value).toBe('Realism: Realism was a movement. It began in France.');
    expect(text('#addedCount')).toBe('1');

    click(act('editor.save'));
    const saved = store.getExams()[0];
    expect(saved?.works[0]).toMatchObject({ artist: 'Gustave Courbet', nationality: 'French', img: 'courbet.jpg', src: 'https://commons/c' });
    expect(saved?.terms[0]?.src).toBe('https://en.wikipedia.org/wiki/Realism');
  });

  it('reports an unreadable file', async () => {
    (window.api.readMd as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    click(act('home.new'));
    setValue('#mdPath', '/nope.md');
    click(act('editor.importPath'));
    await waitFor(() => text('#editorMsg').startsWith('Cannot read file'), 'error message');
  });
});

describe('studying terms', () => {
  it('quiz: four choices, the definition hides its term, a correct pick is graded and scored once', async () => {
    seed({ works: [] });
    await study('terms', 'quiz');
    for (let round = 0; round < 6; round++) {
      const prompt = text('#card .prompt');
      expect(all('#choices button')).toHaveLength(4);
      const answer = termInPrompt(prompt);
      expect(answer).not.toBe('');
      expect(prompt).toContain('_____'); // the term itself is masked
      expect(prompt.toLowerCase()).not.toContain(answer.toLowerCase());
      const right = all('#choices button').find((b) => b.textContent === answer);
      if (!right) throw new Error(`no choice for ${answer}`);
      click(right);
      expect(right.classList.contains('right')).toBe(true);
      expect(text('#feedback')).toContain('Correct!');
      click(right); // answering twice does not count twice
      expect(text('#score')).toContain(`Session: ${round + 1} / ${round + 1}`);
      click(act('study.next'));
      await settle();
    }
  });

  it('quiz: a wrong pick is marked and shows the answer', async () => {
    seed({ works: [] });
    await study('terms', 'quiz');
    const prompt = text('#card .prompt');
    const answer = termInPrompt(prompt);
    const wrong = all('#choices button').find((b) => b.textContent !== answer);
    if (!wrong) throw new Error('no wrong choice');
    click(wrong);
    expect(wrong.classList.contains('wrong')).toBe(true);
    expect(all('#choices .right')).toHaveLength(1);
    expect(text('#feedback')).toMatch(/^Answer: /);
    expect(text('#feedback')).toContain('Source');
    expect(text('#score')).toContain('Session: 0 / 1');
  });

  it('flashcard: reveal the definition, then self-grade', async () => {
    seed({ works: [] });
    await study('terms', 'flash');
    expect(all('#choices')).toHaveLength(0);
    click(act('study.reveal'));
    expect(text('#answer')).toContain('was a movement');
    expect($('#selfgrade')).toBeTruthy();
    click(act('study.grade', 0)); // Got it
    expect(all('#selfgrade')).toHaveLength(0);
    expect(text('#score')).toContain('Session: 1 / 1 · All-time: 1 / 1 (100%)');
  });

  it('flashcard shows a placeholder for a term with no definition', async () => {
    seed({ works: [], terms: [{ term: 'Sublime', def: '' }] });
    await study('terms', 'flash');
    click(act('study.reveal'));
    expect(text('#answer')).toContain('no definition');
  });

  it('quiz mode with no defined terms explains why there is no question', async () => {
    seed({ works: [], terms: [{ term: 'Sublime', def: '' }] });
    await study('terms', 'quiz');
    expect(text('#card')).toContain('No terms with definitions for quiz mode.');
  });
});

describe('studying works', () => {
  const QUESTION_TEXT = {
    artist: 'Who is the artist?',
    title: 'What is the title of this work?',
    year: 'When was this made?',
    movement: 'What art movement is this?',
  } as const;
  type Q = keyof typeof QUESTION_TEXT;

  const workOnScreen = (): Work => {
    const src = $('#card img').getAttribute('src');
    const w = works.find((x) => x.img === src);
    if (!w) throw new Error(`unknown image ${src}`);
    return w;
  };
  const questionOnScreen = (): Q => {
    const q = (Object.keys(QUESTION_TEXT) as Q[]).find((k) => text('#card').includes(QUESTION_TEXT[k]));
    if (!q) throw new Error(`no known question in: ${text('#card')}`);
    return q;
  };
  const factOf = (w: Work, q: Q): string => ({ artist: w.artist, title: w.title, year: w.date, movement: w.movement ?? '' })[q];

  it('quiz asks about the artist, title, year and movement, and grades each correctly', async () => {
    seed({ terms: [] });
    await study('works', 'quiz');
    const seen = new Set<Q>();
    for (let round = 1; round <= 80; round++) {
      const work = workOnScreen();
      const question = questionOnScreen();
      const answer = factOf(work, question);
      seen.add(question);

      const choices = all('#choices button');
      expect(choices).toHaveLength(4);
      expect(choices.map((b) => b.textContent)).toContain(answer);
      click(choices.find((b) => b.textContent === answer) ?? choices[0]!);

      expect(all('#choices .right')).toHaveLength(1);
      expect(text('#feedback')).toContain('Correct!');
      expect(text('#feedback')).toContain(answer);
      expect(text('#score')).toContain(`Session: ${round} / ${round}`);
      click(act('study.next'));
      await settle();
    }
    expect([...seen].sort()).toEqual(['artist', 'movement', 'title', 'year']);
  });

  it('the answer screen shows the full citation: artist and nationality, title, date, movement', async () => {
    seed({ terms: [] });
    await study('works', 'quiz');
    const work = workOnScreen();
    const choices = all('#choices button');
    click(choices.find((b) => b.textContent === factOf(work, questionOnScreen())) ?? choices[0]!);
    const feedback = text('#feedback');
    for (const part of [work.artist, `(${work.nationality ?? ''})`, work.title, work.date, work.movement ?? '']) {
      expect(feedback).toContain(part);
    }
    if (work.src) expect($('#feedback a.source').getAttribute('href')).toBe(work.src);
  });

  it('a wrong answer is marked, and the right one is shown', async () => {
    seed({ terms: [] });
    await study('works', 'quiz');
    const work = workOnScreen();
    const answer = factOf(work, questionOnScreen());
    const wrong = all('#choices button').find((b) => b.textContent !== answer)!;
    click(wrong);
    expect(wrong.classList.contains('wrong')).toBe(true);
    expect(all('#choices .right')[0]?.textContent).toBe(answer);
    expect(text('#feedback')).toMatch(/^Answer: /);
    expect(text('#score')).toContain('Session: 0 / 1');
  });

  it('never asks for the title of a work shown without an image', async () => {
    seed({ terms: [], works: [{ id: 9, title: 'Lost Painting', artist: 'Unknown Hand', nationality: '', movement: 'Baroque', date: '1700', img: '' }] });
    await study('works', 'quiz');
    for (let i = 0; i < 40; i++) {
      expect(text('#card')).not.toContain(QUESTION_TEXT.title);
      click(act('study.next'));
      await settle();
    }
  });

  it('flashcard: the revealed answer includes nationality and movement', async () => {
    seed({ terms: [] });
    await study('works', 'flash');
    const work = workOnScreen();
    click(act('study.reveal'));
    expect(text('#answer')).toContain(`${work.artist} (${work.nationality ?? ''})`);
    expect(text('#answer')).toContain(work.movement ?? '');
    click(act('study.grade', 1)); // Missed
    expect(text('#score')).toContain('Session: 0 / 1');
  });

  it('a work without an image is shown by title', async () => {
    seed({ terms: [], works: [{ id: 9, title: 'Lost Painting', artist: 'Unknown Hand', nationality: '', movement: '', date: '1700', img: '' }] });
    await study('works', 'flash');
    expect(text('#card')).toContain('Lost Painting');
    expect(text('#card')).toContain('(no image)');
  });

  it('looks up a missing nationality and movement once and saves them (exams made before they existed)', async () => {
    seed({ terms: [], works: [{ id: 7, title: 'Olympia', artist: 'Legacy Painter', date: '1863', img: 'x.png' }] });
    stubFetch([
      [/search=Legacy\+Painter&/, { search: [{ id: 'Q711', description: 'painter' }] }],
      [/ids=Q711\b/, { entities: { Q711: { claims: {
        P27: [{ mainsnak: { datavalue: { value: { id: 'Q811' } } } }],
        P135: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q911' } } } }],
      } } } }],
      [/ids=Q811\b/, { entities: { Q811: { claims: { P1549: [{ mainsnak: { datavalue: { value: { text: 'Legacyan', language: 'en' } } } }] }, labels: {} } } }],
      [/ids=Q911\b/, { entities: { Q911: { labels: { en: { value: 'post-impressionism' } } } } }],
    ]);
    click(act('home.study'));
    await waitFor(() => all('[data-action="study.reveal"]').length > 0, 'card');
    click(act('study.reveal'));
    expect(text('#answer')).toContain('Legacy Painter (Legacyan)');
    expect(text('#answer')).toContain('Post-Impressionism');
    const saved = savedExams()[0]?.works[0];
    expect(saved).toMatchObject({ nationality: 'Legacyan', movement: 'Post-Impressionism' });
  });

  it('fills in the other works of an exam in the background while you study', async () => {
    seed({ terms: [], works: [
      { id: 1, title: 'Seen First', artist: 'Known Painter', nationality: 'French', movement: 'Realism', date: '1860', img: 'a.png' },
      { id: 2, title: 'Not On Screen', artist: 'Background Painter', date: '1870', img: 'b.png' },
    ] });
    stubFetch([
      [/search=Background\+Painter&/, { search: [{ id: 'Q721', description: 'painter' }] }],
      [/ids=Q721\b/, { entities: { Q721: { claims: {
        P27: [{ mainsnak: { datavalue: { value: { id: 'Q821' } } } }],
        P135: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q921' } } } }],
      } } } }],
      [/ids=Q821\b/, { entities: { Q821: { claims: { P1549: [{ mainsnak: { datavalue: { value: { text: 'Backgroundish', language: 'en' } } } }] }, labels: {} } } }],
      [/ids=Q921\b/, { entities: { Q921: { labels: { en: { value: 'symbolism' } } } } }],
    ]);
    click(act('home.study'));
    await waitFor(() => store.getExams()[0]?.works[1]?.movement === 'Symbolism', 'background fill-in');
    const saved = savedExams()[0]?.works[1];
    expect(saved).toMatchObject({ nationality: 'Backgroundish', movement: 'Symbolism' });
  });
});

describe('editing details', () => {
  const manet = (id: number, title: string, img: string): Work =>
    ({ id, title, artist: 'Edouard Manet', nationality: 'French', movement: 'Impressionism', date: '1863', img, src: '' });
  const input = (id: string): HTMLInputElement => $(`#${id}`) as HTMLInputElement;
  const savedWorks = (): Work[] => savedExams()[0]?.works ?? [];

  async function revealWork(): Promise<void> {
    await study('works', 'flash');
    click(act('study.reveal'));
  }

  it('offers editing only after the answer is shown', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await study('works', 'flash');
    expect(all('[data-action="study.edit"]')).toHaveLength(0);
    click(act('study.reveal'));
    expect(all('[data-action="study.edit"]')).toHaveLength(1);
  });

  it('opens a form pre-filled with the work\'s details', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    expect(input('editArtist').value).toBe('Edouard Manet');
    expect(input('editNationality').value).toBe('French');
    expect(input('editTitle').value).toBe('Olympia');
    expect(input('editDate').value).toBe('1863');
    expect(input('editMovement').value).toBe('Impressionism');
    expect(all('[data-action="study.edit"]')).toHaveLength(0); // the button gives way to the form
  });

  it('saves a corrected movement, shows it straight away and persists it', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    expect(text('#answer')).toContain('Impressionism');
    click(act('study.edit'));
    setValue('#editMovement', 'Realism');
    click(act('study.saveEdit'));

    expect(text('#answer')).toContain('Realism');
    expect(text('#answer')).not.toContain('Impressionism');
    expect(all('.edit-form')).toHaveLength(0);
    expect(all('[data-action="study.edit"]')).toHaveLength(1); // can edit again
    expect(store.getExams()[0]?.works[0]?.movement).toBe('Realism');
    expect(savedWorks()[0]?.movement).toBe('Realism');
  });

  it('can correct every detail of a work', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    setValue('#editArtist', 'Édouard Manet');
    setValue('#editNationality', 'Parisian');
    setValue('#editTitle', 'Olympia (1863)');
    setValue('#editDate', '1863-65');
    setValue('#editMovement', 'Realism');
    click(act('study.saveEdit'));
    expect(savedWorks()[0]).toMatchObject({ artist: 'Édouard Manet', nationality: 'Parisian', title: 'Olympia (1863)', date: '1863-65', movement: 'Realism' });
    expect(text('#answer')).toContain('Édouard Manet (Parisian)');
    expect(text('#answer')).toContain('Olympia (1863), 1863-65');
  });

  it("a corrected nationality also applies to the artist's other works, and only theirs", async () => {
    const original: Work[] = [
      manet(1, 'Olympia', 'o.png'), manet(2, 'The Fifer', 'f.png'),
      { ...manet(3, 'Other', 'x.png'), artist: 'Someone Else', nationality: 'Dutch' },
    ];
    seed({ terms: [], works: original.map((w) => ({ ...w })) });
    await revealWork();
    const shown = original.find((w) => w.img === $('#card img').getAttribute('src'))!; // whichever card came up
    click(act('study.edit'));
    setValue('#editNationality', 'Edited');
    click(act('study.saveEdit'));
    for (const w of savedWorks()) {
      const before = original.find((o) => o.id === w.id)!;
      expect(w.nationality).toBe(before.artist === shown.artist ? 'Edited' : before.nationality);
    }
  });

  it('cancel leaves everything unchanged', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    setValue('#editMovement', 'Cubism');
    click(act('study.cancelEdit'));
    expect(all('.edit-form')).toHaveLength(0);
    expect(store.getExams()[0]?.works[0]?.movement).toBe('Impressionism');
    expect(text('#answer')).toContain('Impressionism');
    expect(all('[data-action="study.edit"]')).toHaveLength(1);
  });

  it('will not save a work without a title', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    setValue('#editTitle', '   ');
    setValue('#editMovement', 'Realism');
    click(act('study.saveEdit'));
    expect(text('#editMsg')).toBe('A work needs a title.');
    expect(all('.edit-form')).toHaveLength(1);
    expect(store.getExams()[0]?.works[0]).toMatchObject({ title: 'Olympia', movement: 'Impressionism' });
  });

  it('an empty field means "unknown": the movement is cleared and no longer asked about', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    setValue('#editMovement', '');
    click(act('study.saveEdit'));
    expect(store.getExams()[0]?.works[0]?.movement).toBe(''); // "" = looked at, unknown: not refilled
    click(act('study.back'));
    await study('works', 'quiz');
    for (let i = 0; i < 40; i++) {
      expect(text('#card')).not.toContain('What art movement is this?');
      click(act('study.next'));
      await settle();
    }
  });

  it('after a quiz answer, the edit redraws the feedback and keeps it marked right or wrong', async () => {
    seed({ terms: [], works: [{ ...manet(1, 'Olympia', 'o.png'), date: '' }] }); // artist, title and movement can be asked
    await study('works', 'quiz');
    const question = text('#card');
    const wrongButton = all('#choices button').find((b) => b.textContent !== (question.includes('artist') ? 'Edouard Manet' : question.includes('title') ? 'Olympia' : 'Impressionism'))!;
    click(wrongButton);
    expect($('#feedback').className).toBe('incorrect');
    click(act('study.edit'));
    setValue('#editNationality', 'Franco-Parisian');
    click(act('study.saveEdit'));
    expect($('#feedback').className).toBe('incorrect');
    expect(text('#feedback')).toContain('Franco-Parisian');
    expect(text('#score')).toContain('Session: 0 / 1'); // editing does not change the score
  });

  it('edits a term: its name and definition', async () => {
    seed({ works: [], terms: [{ term: 'Sublime', def: 'A wrong definition.', src: 'https://en.wikipedia.org/wiki/Sublime' }] });
    await study('terms', 'flash');
    click(act('study.reveal'));
    click(act('study.edit'));
    expect(input('editTerm').value).toBe('Sublime');
    expect(($('#editDef') as HTMLTextAreaElement).value).toBe('A wrong definition.');
    setValue('#editTerm', 'The Sublime');
    ($('#editDef') as HTMLTextAreaElement).value = 'Awe before overwhelming nature.';
    click(act('study.saveEdit'));
    expect(text('#answer')).toContain('Awe before overwhelming nature.');
    expect(store.getExams()[0]?.terms[0]).toMatchObject({ term: 'The Sublime', def: 'Awe before overwhelming nature.', src: 'https://en.wikipedia.org/wiki/Sublime' });
    expect(savedExams()[0]?.terms[0]?.term).toBe('The Sublime');
  });

  it('will not save a term without a name', async () => {
    seed({ works: [], terms: [{ term: 'Sublime', def: 'x' }] });
    await study('terms', 'flash');
    click(act('study.reveal'));
    click(act('study.edit'));
    setValue('#editTerm', '');
    click(act('study.saveEdit'));
    expect(text('#editMsg')).toBe('A term needs a name.');
    expect(store.getExams()[0]?.terms[0]?.term).toBe('Sublime');
  });

  it('a quiz answer on a term offers editing too', async () => {
    seed({ works: [], terms: termsOf(...TERM_NAMES) });
    await study('terms', 'quiz');
    click(all('#choices button')[0]!);
    expect(all('[data-action="study.edit"]')).toHaveLength(1);
  });

  it('is not offered for random Met art, which is not saved in the exam', async () => {
    seed({ works: [], terms: [], filter: { deptId: '', from: '', to: '', q: 'ui-pool-edit' } });
    stubFetch([
      ['/objects/3', { objectID: 3, title: 'Pool Landscape', artistDisplayName: 'Pool Painter', artistNationality: 'Dutch', primaryImageSmall: 'pool.jpg', objectDate: '1650', objectURL: 'https://met/3' }],
      ['/search', { objectIDs: [3] }],
    ]);
    click(act('home.study'));
    await waitFor(() => all('[data-action="study.reveal"]').length > 0, 'pool card');
    click(act('study.reveal'));
    expect(all('[data-action="study.edit"]')).toHaveLength(0);
  });

  it('keeps the correction on later cards of the same work', async () => {
    seed({ terms: [], works: [manet(1, 'Olympia', 'o.png')] });
    await revealWork();
    click(act('study.edit'));
    setValue('#editMovement', 'Realism');
    click(act('study.saveEdit'));
    click(act('study.next'));
    await settle();
    click(act('study.reveal'));
    expect(text('#answer')).toContain('Realism');
  });
});

describe('adding images', () => {
  const work = (over: Partial<Work> = {}): Work =>
    ({ id: 1, title: 'Olympia', artist: 'Edouard Manet', nationality: 'French', movement: 'Realism', date: '1863', img: '', src: '', ...over });
  const input = (id: string): HTMLInputElement => $(`#${id}`) as HTMLInputElement;
  const savedWorks = (): Work[] => savedExams()[0]?.works ?? [];
  const COMMONS_HIT: [string, unknown] = ['commons.wikimedia.org', { query: { pages: { a: {
    index: 1, title: 'File:Manet Olympia.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/olympia-600.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Manet_Olympia.jpg' }],
  } } } }];

  async function openForm(...works: Work[]): Promise<void> {
    seed({ terms: [], works });
    await study('works', 'flash');
    click(act('study.reveal'));
    click(act('study.edit'));
  }
  const chooseFile = (file: File): void => {
    const fileInput = input('editImageFile');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => { (fileToDataUrl as jest.Mock).mockReset(); });

  it('shows "No image" for a work without one, and the current image otherwise', async () => {
    await openForm(work());
    expect(text('#editPreview')).toBe('No image');
    expect(input('editImageUrl').value).toBe('');
    click(act('study.cancelEdit'));

    store.getExams()[0]!.works[0]!.img = 'https://example.org/olympia.jpg';
    go('home');
    await study('works', 'flash');
    click(act('study.reveal'));
    click(act('study.edit'));
    expect($('#editPreview img').getAttribute('src')).toBe('https://example.org/olympia.jpg');
    expect(input('editImageUrl').value).toBe('https://example.org/olympia.jpg');
  });

  it("an image saved earlier never blocks editing something else, even if it isn't a link the app would accept now", async () => {
    await openForm(work({ img: 'legacy/olympia.png', src: '' }));
    setValue('#editMovement', 'Impressionism');
    click(act('study.saveEdit'));
    expect(all('.edit-form')).toHaveLength(0);
    expect(savedWorks()[0]).toMatchObject({ movement: 'Impressionism', img: 'legacy/olympia.png' });
  });

  it('adds an image from a link: it is saved, shown on the card, and cited', async () => {
    await openForm(work());
    expect(text('#card')).toContain('(no image)');
    setValue('#editImageUrl', 'https://example.org/olympia.jpg');
    click(act('study.saveEdit'));

    expect($('#card .card-media img').getAttribute('src')).toBe('https://example.org/olympia.jpg');
    expect(text('#card')).not.toContain('(no image)');
    expect(savedWorks()[0]).toMatchObject({ img: 'https://example.org/olympia.jpg', src: 'https://example.org/olympia.jpg' });
  });

  it('keeps the existing source link when the image itself is unchanged', async () => {
    await openForm(work({ img: 'https://example.org/a.jpg', src: 'https://commons.wikimedia.org/wiki/File:A.jpg' }));
    setValue('#editMovement', 'Impressionism');
    click(act('study.saveEdit'));
    expect(savedWorks()[0]).toMatchObject({ movement: 'Impressionism', img: 'https://example.org/a.jpg', src: 'https://commons.wikimedia.org/wiki/File:A.jpg' });
  });

  it('rejects links that are not https, and saves nothing', async () => {
    await openForm(work());
    for (const bad of ['http://example.org/a.jpg', 'javascript:alert(1)', 'example.org/a.jpg']) {
      setValue('#editImageUrl', bad);
      click(act('study.saveEdit'));
      expect(text('#editMsg')).toMatch(/https:\/\//);
      expect(all('.edit-form')).toHaveLength(1);
      expect(store.getExams()[0]?.works[0]?.img).toBe('');
    }
  });

  it('removes an image', async () => {
    await openForm(work({ img: 'https://example.org/a.jpg', src: 'https://example.org/a.jpg' }));
    click(act('study.removeImage'));
    expect(text('#editPreview')).toBe('No image');
    expect(input('editImageUrl').value).toBe('');
    click(act('study.saveEdit'));
    expect(savedWorks()[0]).toMatchObject({ img: '', src: '' });
    expect(text('#card')).toContain('(no image)');
  });

  it('finds an image automatically, using the title and artist as typed in the form', async () => {
    await openForm(work());
    const calls = stubFetch([COMMONS_HIT]);
    setValue('#editTitle', 'Olympia (corrected)');
    click(act('study.findImage'));
    await waitFor(() => $('#editPreview').querySelector('img') !== null, 'the found image');
    expect($('#editPreview img').getAttribute('src')).toBe('https://upload.wikimedia.org/olympia-600.jpg');
    expect(text('#editImageMsg')).toContain('Found an image');
    expect(decodeURIComponent(calls[0] ?? '').replace(/\+/g, ' ')).toContain('Olympia  manet'.replace('  ', ' '));
    click(act('study.saveEdit'));
    expect(savedWorks()[0]).toMatchObject({ img: 'https://upload.wikimedia.org/olympia-600.jpg', src: 'https://commons.wikimedia.org/wiki/File:Manet_Olympia.jpg' });
    expect($('#card .card-media a, #card .card-media img')).toBeTruthy();
  });

  it('says so when nothing is found, and when there is no title to search for', async () => {
    await openForm(work());
    stubFetch([['commons.wikimedia.org', { batchcomplete: '' }], ['/search', { objectIDs: [] }]]);
    click(act('study.findImage'));
    await waitFor(() => text('#editImageMsg').startsWith('No image found'), 'the not-found message');
    expect(text('#editPreview')).toBe('No image');

    const calls = stubFetch([]);
    setValue('#editTitle', '');
    click(act('study.findImage'));
    expect(text('#editImageMsg')).toBe('Enter a title first.');
    expect(calls).toHaveLength(0);
  });

  it('opens the file chooser from the button', async () => {
    await openForm(work());
    const opened = jest.fn();
    input('editImageFile').addEventListener('click', opened);
    click(act('study.chooseImageFile'));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('adds an image from a chosen file, saved inside the exam', async () => {
    (fileToDataUrl as jest.Mock).mockResolvedValue('data:image/jpeg;base64,AAAA');
    await openForm(work());
    const file = new File(['pixels'], 'olympia.png', { type: 'image/png' });
    chooseFile(file);
    await waitFor(() => $('#editPreview').querySelector('img') !== null, 'the chosen image');
    expect(fileToDataUrl).toHaveBeenCalledWith(file);
    expect($('#editPreview img').getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(input('editImageUrl').value).toBe(''); // a data: address is not shown as a link
    expect(text('#editImageMsg')).toContain('from your file');

    click(act('study.saveEdit'));
    expect(savedWorks()[0]).toMatchObject({ img: 'data:image/jpeg;base64,AAAA', src: '' });
    expect($('#card .card-media img').getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
  });

  it('explains when a chosen file cannot be used, and changes nothing', async () => {
    (fileToDataUrl as jest.Mock).mockRejectedValue(new Error('That file is not an image.'));
    await openForm(work());
    chooseFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    await waitFor(() => text('#editImageMsg') === 'That file is not an image.', 'the error message');
    expect(text('#editPreview')).toBe('No image');
    click(act('study.saveEdit'));
    expect(savedWorks()[0]?.img).toBe('');
  });

  it('cancel throws away a found or chosen image', async () => {
    (fileToDataUrl as jest.Mock).mockResolvedValue('data:image/jpeg;base64,AAAA');
    await openForm(work());
    chooseFile(new File(['x'], 'a.png', { type: 'image/png' }));
    await waitFor(() => $('#editPreview').querySelector('img') !== null, 'the chosen image');
    click(act('study.cancelEdit'));
    expect(savedWorks()[0]?.img).toBe('');
    click(act('study.edit'));
    expect(text('#editPreview')).toBe('No image'); // the next form starts from what is saved
  });

  it('puts everything back and explains when saving fails', async () => {
    await openForm(work(), work({ id: 2, title: 'The Fifer', date: '1866' }));
    const shown = $('#card img, #card h3').textContent;
    setValue('#editImageUrl', 'https://example.org/olympia.jpg');
    setValue('#editNationality', 'Parisian');
    setValue('#editMovement', 'Cubism');

    const saveData = jest.spyOn(window.api, 'saveData').mockImplementation(() => {
      throw new Error('database or disk is full');
    });
    click(act('study.saveEdit'));
    expect(text('#editMsg')).toMatch(/^Couldn't save/);
    expect(all('.edit-form')).toHaveLength(1); // the form stays open so nothing typed is lost
    for (const w of store.getExams()[0]!.works) expect(w).toMatchObject({ img: '', nationality: 'French', movement: 'Realism' });
    expect($('#card img, #card h3').textContent).toBe(shown);

    saveData.mockRestore();
    click(act('study.saveEdit')); // and it works once saving does
    expect(savedWorks().every((w) => w.nationality === 'Parisian')).toBe(true);
    expect(all('.edit-form')).toHaveLength(0);
  });

  it('a work given an image can then be asked for its title', async () => {
    await openForm(work({ date: '', movement: '' })); // artist is the only thing to ask about without an image
    setValue('#editImageUrl', 'https://example.org/olympia.jpg');
    click(act('study.saveEdit'));
    choose('#mode', 'quiz');
    await settle();
    let asked = false;
    for (let i = 0; i < 60 && !asked; i++) {
      asked = text('#card').includes('What is the title of this work?');
      click(act('study.next'));
      await settle();
    }
    expect(asked).toBe(true);
  });
});

describe('studying other sources', () => {
  it('lists the sources an exam supports', async () => {
    seed({ filter: { deptId: '', from: '', to: '', q: '' } });
    click(act('home.study'));
    await settle();
    expect(all('#source option').map((o) => o.getAttribute('value'))).toEqual(['mix', 'works', 'terms', 'pool']);
  });

  it('mixed mode draws both works and terms', async () => {
    seed();
    await study('mix', 'flash');
    const seen = new Set<string>();
    for (let i = 0; i < 40 && seen.size < 2; i++) {
      seen.add(all('#card img').length ? 'works' : 'terms');
      click(act('study.next'));
      await settle();
    }
    expect([...seen].sort()).toEqual(['terms', 'works']);
  });

  it('random art pool draws from the Met', async () => {
    seed({ works: [], terms: [], filter: { deptId: '', from: '', to: '', q: 'ui-pool-test' } });
    stubFetch([
      ['/objects/3', { objectID: 3, title: 'Pool Landscape', artistDisplayName: 'Pool Painter', artistNationality: 'Dutch', primaryImageSmall: 'pool.jpg', objectDate: '1650', objectURL: 'https://met/3' }],
      ['/search', { objectIDs: [3] }],
    ]);
    click(act('home.study'));
    await waitFor(() => all('[data-action="study.reveal"]').length > 0, 'pool card');
    click(act('study.reveal'));
    expect(text('#answer')).toContain('Pool Painter (Dutch)');
  });

  it('shows an error card when the pool cannot be reached', async () => {
    seed({ works: [], terms: [], filter: { deptId: '', from: '', to: '', q: 'ui-pool-offline' } });
    stubFetch([['/search', new Error('down')]]);
    click(act('home.study'));
    await waitFor(() => text('#card').includes('No artwork found'), 'error card');
  });
});

describe('navigation and scoring', () => {
  it('back returns home and the exam list shows the new score', async () => {
    seed({ works: [] });
    await study('terms', 'quiz');
    const answer = termInPrompt(text('#card .prompt'));
    click(all('#choices button').find((b) => b.textContent === answer) ?? $('#choices button'));
    click(act('study.back'));
    expect(view()).toBe('home');
    expect(text('#examList')).toContain('100% (1/1)');
  });

  it('scores are saved', async () => {
    seed({ works: [] });
    await study('terms', 'flash');
    click(act('study.reveal'));
    click(act('study.grade', 0));
    const saved = savedExams();
    expect(saved[0]?.stats).toEqual({ terms: { c: 1, t: 1 } });
  });
});
