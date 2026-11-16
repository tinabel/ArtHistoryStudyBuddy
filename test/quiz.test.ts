import { availableQuestions, drawCard, isCardError, resolveKind, studySources } from '../src/renderer/js/quiz.js';
import type { Card, Exam, Mode, Kind, Term, Work } from '../src/renderer/js/types.js';
import { restoreFetch, stubFetch } from './helpers/fakeFetch.js';

afterEach(restoreFetch);

const term = (name: string, def = `${name} is a thing.`): Term => ({ term: name, def, src: 'https://example.org' });
const work = (artist: string, title = `${artist} work`): Work =>
  ({ id: title, title, artist, nationality: 'French', date: '1800', img: 'i.png', src: 's' });
const exam = (over: Partial<Exam> = {}): Exam => ({ name: 'E', works: [], terms: [], filter: null, stats: {}, ...over });
const FIVE_TERMS = ['Realism', 'Sublime', 'Japonisme', 'Primitivism', 'Orientalism'].map((name) => term(name));

/** drawCard, failing the test if it returned an error. */
async function draw(testExam: Exam, kind: Kind, mode: Mode): Promise<Card> {
  const card = await drawCard(testExam, kind, mode);
  if (isCardError(card)) throw new Error(card.error);
  return card;
}

describe('studySources', () => {
  it('lists only what the exam has', () => {
    expect(studySources(exam())).toEqual([]);
    expect(studySources(exam({ works: [work('A')] })).map((source) => source.value)).toEqual(['works']);
    expect(studySources(exam({ terms: [term('A')] })).map((source) => source.value)).toEqual(['terms']);
    expect(studySources(exam({ works: [work('A')], terms: [term('B')], filter: { deptId: '', from: '', to: '', q: '' } })).map((source) => source.value))
      .toEqual(['mix', 'works', 'terms', 'pool']);
  });
});

describe('resolveKind', () => {
  it('passes plain sources through and splits "mix" between works and terms', () => {
    expect(resolveKind('works')).toBe('works');
    expect(resolveKind('pool')).toBe('pool');
    const kinds = new Set(Array.from({ length: 80 }, () => resolveKind('mix')));
    expect([...kinds].sort()).toEqual(['terms', 'works']);
  });
});

describe('term cards', () => {
  it('flashcard: no choices, definition shown as written', async () => {
    const card = await draw(exam({ terms: [term('Realism', 'Realism was a movement.')] }), 'terms', 'flash');
    expect(card.choices).toBeNull();
    expect(card).toMatchObject({ def: 'Realism was a movement.', answer: 'Realism' });
  });

  it('quiz: four distinct choices including the answer, and the definition hides the term', async () => {
    const testExam = exam({ terms: FIVE_TERMS.map((entry) => ({ ...entry, def: `${entry.term} was a movement in art.` })) });
    for (let round = 0; round < 25; round++) {
      const card = await draw(testExam, 'terms', 'quiz');
      if (card.kind !== 'terms') throw new Error('expected a term card');
      expect(card.choices).toHaveLength(4);
      expect(new Set(card.choices).size).toBe(4);
      expect(card.choices).toContain(card.answer);
      expect(card.def.toLowerCase()).not.toContain(card.answer.toLowerCase());
    }
  });

  it('quiz with few terms offers as many choices as exist', async () => {
    expect((await draw(exam({ terms: [term('A'), term('B')] }), 'terms', 'quiz')).choices).toHaveLength(2);
  });

  it('quiz skips terms without a definition, and errors if none have one', async () => {
    const mixed = exam({ terms: [term('NoDef', ''), term('HasDef', 'HasDef means x.')] });
    for (let round = 0; round < 20; round++) expect((await draw(mixed, 'terms', 'quiz')).answer).toBe('HasDef');
    const none = await drawCard(exam({ terms: [term('A', '')] }), 'terms', 'quiz');
    expect(isCardError(none) && none.error).toMatch(/definitions/);
  });

  it('flashcards still include terms without a definition', async () => {
    expect((await draw(exam({ terms: [term('NoDef', '')] }), 'terms', 'flash')).answer).toBe('NoDef');
  });
});

describe('work cards', () => {
  // Only the artist can be asked about: no image (so no title question), no year, no movement.
  const artistOnly = (artist: string, title = `${artist} work`): Work => ({ id: title, title, artist, date: '', img: '' });

  it('quiz: artist choices include the answer and are distinct (case-insensitive)', async () => {
    const testExam = exam({ works: [artistOnly('Édouard Manet'), artistOnly('Claude Monet'), artistOnly('claude monet', 'dup')] });
    for (let round = 0; round < 25; round++) {
      const card = await draw(testExam, 'works', 'quiz');
      expect(card).toMatchObject({ question: 'artist' });
      expect(card.choices).toHaveLength(4);
      expect(card.choices).toContain(card.answer);
      const lower = (card.choices ?? []).map((choice) => choice.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    }
  });

  it('carries everything the UI shows', async () => {
    const card = await draw(exam({ works: [{ ...work('Goya', 'Third of May'), movement: 'Romanticism' }] }), 'works', 'flash');
    expect(card).toMatchObject({
      kind: 'works', question: 'artist', title: 'Third of May', artist: 'Goya', nationality: 'French', movement: 'Romanticism',
      date: '1800', img: 'i.png', src: 's', answer: 'Goya', choices: null,
    });
  });

  it('flashcards always carry the artist as the answer', async () => {
    const testExam = exam({ works: [{ ...work('Goya'), movement: 'Romanticism' }] });
    for (let round = 0; round < 20; round++) expect(await draw(testExam, 'works', 'flash')).toMatchObject({ question: 'artist', answer: 'Goya', choices: null });
  });

  it('a work with nothing to ask about is shown as a flashcard even in quiz mode', async () => {
    const card = await draw(exam({ works: [{ id: 1, title: 'Mona Lisa', artist: '', date: '', img: '' }] }), 'works', 'quiz');
    expect(card.choices).toBeNull();
  });
});

describe('availableQuestions', () => {
  const base: Work = { id: 1, title: 'Olympia', artist: 'Manet', date: '1863', img: 'i.png', movement: 'Realism' };

  it('offers every question when everything is known', () => {
    expect(availableQuestions(base).sort()).toEqual(['artist', 'movement', 'title', 'year']);
  });

  it('skips what is unknown', () => {
    expect(availableQuestions({ ...base, artist: '' })).not.toContain('artist');
    expect(availableQuestions({ ...base, movement: '' })).not.toContain('movement');
    expect(availableQuestions({ ...base, movement: undefined })).not.toContain('movement');
    expect(availableQuestions({ ...base, date: 'undated' })).not.toContain('year');
    expect(availableQuestions({ ...base, date: '' })).not.toContain('year');
  });

  it('does not ask for the title when there is no image, since the title is shown instead', () => {
    expect(availableQuestions({ ...base, img: '' })).not.toContain('title');
    expect(availableQuestions(base, false)).not.toContain('title');
  });

  it('offers nothing for a work with no facts', () => {
    expect(availableQuestions({ id: 1, title: 'Untitled', artist: '', date: '', img: '' })).toEqual([]);
  });
});

describe('work quiz questions', () => {
  const full = (over: Partial<Work> = {}): Work => ({
    id: 1, title: 'Liberty Leading the People', artist: 'Eugène Delacroix', nationality: 'French', movement: 'Romanticism',
    date: '1830', img: 'liberty.png', src: 's', ...over,
  });
  const others = [
    full({ id: 2, title: 'Olympia', artist: 'Édouard Manet', movement: 'Realism', date: '1863' }),
    full({ id: 3, title: 'The Hay Wain', artist: 'John Constable', movement: 'Romanticism', date: '1821' }),
  ];
  const testExam = exam({ works: [full(), ...others] });
  const factOf = (artwork: Work, question: string): string => ({ artist: artwork.artist, title: artwork.title, year: artwork.date, movement: artwork.movement ?? '' })[question] ?? '';

  it('asks about the artist, title, year and movement', async () => {
    const seen = new Set<string>();
    for (let round = 0; round < 150; round++) seen.add((await draw(testExam, 'works', 'quiz') as { question: string }).question);
    expect([...seen].sort()).toEqual(['artist', 'movement', 'title', 'year']);
  });

  it('every question has the right answer, and four distinct choices that include it', async () => {
    for (let round = 0; round < 120; round++) {
      const card = await draw(testExam, 'works', 'quiz');
      if (card.kind === 'terms') throw new Error('expected a work card');
      const source = testExam.works.find((artwork) => artwork.id === card.id);
      expect(card.answer).toBe(factOf(source!, card.question));
      expect(card.choices).toHaveLength(4);
      expect(card.choices).toContain(card.answer);
      const lower = (card.choices ?? []).map((choice) => choice.toLowerCase());
      expect(new Set(lower).size).toBe(4);
    }
  });

  it('title choices come from the exam and from a pool of famous works', async () => {
    const onlyTitle = exam({ works: [{ id: 1, title: 'Obscure Piece', artist: '', date: '', img: 'x.png' }] });
    const card = await draw(onlyTitle, 'works', 'quiz');
    expect(card).toMatchObject({ question: 'title', answer: 'Obscure Piece' });
    expect(card.choices).toHaveLength(4);
  });

  it('never asks for the title of a work with no image', async () => {
    const noImage = exam({ works: [full({ img: '' })] });
    for (let round = 0; round < 60; round++) expect((await draw(noImage, 'works', 'quiz') as { question: string }).question).not.toBe('title');
  });

  it('year choices are dates formatted like the answer', async () => {
    for (const [date, pattern] of [['1814', /^\d{4}$/], ['1796-98', /^\d{4}-\d{2}$/], ['c. 1890-94', /^c\. \d{4}-\d{2}$/]] as const) {
      const onlyYear = exam({ works: [{ id: 1, title: 'T', artist: '', date, img: '' }] });
      const card = await draw(onlyYear, 'works', 'quiz');
      expect(card).toMatchObject({ question: 'year', answer: date });
      for (const choice of card.choices ?? []) expect(choice).toMatch(pattern);
    }
  });

  it('movement choices are other movements from the exam or famous ones, never duplicates of the answer', async () => {
    const onlyMovement = exam({ works: [
      { id: 1, title: 'T', artist: '', date: '', img: '', movement: 'Romanticism' },
      { id: 2, title: 'U', artist: '', date: '', img: '', movement: 'romanticism' },
    ] });
    for (let round = 0; round < 20; round++) {
      const card = await draw(onlyMovement, 'works', 'quiz');
      expect(card).toMatchObject({ question: 'movement' });
      const lower = (card.choices ?? []).map((choice) => choice.toLowerCase());
      expect(lower.filter((choice) => choice === 'romanticism')).toHaveLength(1);
      expect(card.choices).toHaveLength(4);
    }
  });

  it('carries the movement for the answer screen', async () => {
    expect(await draw(testExam, 'works', 'flash')).toMatchObject({ movement: expect.stringMatching(/Romanticism|Realism/) as string });
  });
});

describe('random pool cards', () => {
  const pool = (question: string): Exam => exam({ filter: { deptId: '11', from: '1600', to: '1700', q: question } });

  it('come from the Met search', async () => {
    const calls = stubFetch([
      ['/objects/7', { objectID: 7, title: 'Pool Piece', artistDisplayName: 'Someone', artistNationality: 'Dutch', primaryImageSmall: 'p.jpg', objectDate: '1650', objectURL: 'https://met/7' }],
      ['/search', { objectIDs: [7] }],
    ]);
    const card = await draw(pool('pool-test-a'), 'pool', 'quiz');
    expect(card).toMatchObject({ title: 'Pool Piece', nationality: 'Dutch' });
    expect(card.choices).toHaveLength(4);
    const search = calls.find((call) => call.includes('/search')) ?? '';
    for (const part of ['hasImages=true', 'departmentId=11', 'dateBegin=1600', 'dateEnd=1700', 'q=pool-test-a']) {
      expect(search).toContain(part);
    }
  });

  it('give an error card when there are no results, or when offline', async () => {
    stubFetch([['/search', { objectIDs: [] }]]);
    const none = await drawCard(pool('pool-test-b'), 'pool', 'flash');
    expect(isCardError(none) && none.error).toMatch(/No artwork/);
    stubFetch([['/search', new Error('down')]]);
    const offline = await drawCard(pool('pool-test-c'), 'pool', 'flash');
    expect(isCardError(offline) && offline.error).toMatch(/No artwork/);
  });

  it('only use objects that have an image and an artist', async () => {
    stubFetch([
      ['/objects/1', { objectID: 1, title: 'No image', artistDisplayName: 'A', primaryImageSmall: '' }],
      ['/objects/2', { objectID: 2, title: 'No artist', artistDisplayName: '', primaryImageSmall: 'x' }],
      ['/search', { objectIDs: [1, 2] }],
    ]);
    const card = await drawCard(pool('pool-test-d'), 'pool', 'flash');
    expect(isCardError(card)).toBe(true);
  });
});
