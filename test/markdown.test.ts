import {
  formatTermLines, parseExamMarkdown, parseTermLine, parseTermLines, parseWork, stripMd,
} from '../src/renderer/js/markdown.js';

describe('stripMd', () => {
  it('removes bold, code and link syntax', () => {
    expect(stripMd('**Bold** [a link](http://x.y) `code` *it*')).toBe('Bold a link code it');
  });
});

describe('parseWork', () => {
  it('splits artist, title and date, dropping the page reference', () => {
    expect(parseWork('J.A.D. Ingres, Large Odalisque, 1814 (p. 994)'))
      .toEqual({ artist: 'J.A.D. Ingres', title: 'Large Odalisque', date: '1814' });
  });

  it('keeps commas inside the title', () => {
    expect(parseWork('Francisco Goya, The Sleep of Reason Produces Monsters, Los Caprichos, 1796-98 (p. 982)'))
      .toEqual({ artist: 'Francisco Goya', title: 'The Sleep of Reason Produces Monsters, Los Caprichos', date: '1796-98' });
  });

  it('handles "c." dates, trailing spaces and missing parts', () => {
    expect(parseWork('Paul Cézanne, Still-Life with Basket of Apples, c. 1890-94 (p. 1048)').date).toBe('c. 1890-94');
    expect(parseWork('Moses Jacob Ezekiel, Stonewall Jackson, 1909 ').date).toBe('1909');
    expect(parseWork('Caspar David Friedrich, Monk By the Sea'))
      .toEqual({ artist: 'Caspar David Friedrich', title: 'Monk By the Sea', date: '' });
    expect(parseWork('Mona Lisa')).toEqual({ artist: '', title: 'Mona Lisa', date: '' });
  });
});

describe('parseWork movement', () => {
  it('reads an optional "(movement: ...)" and leaves it out when absent', () => {
    expect(parseWork('Eugène Delacroix, Liberty Leading the People, 1830 (movement: Romanticism)'))
      .toEqual({ artist: 'Eugène Delacroix', title: 'Liberty Leading the People', date: '1830', movement: 'Romanticism' });
    expect(parseWork('Eugène Delacroix, Liberty Leading the People, 1830')).not.toHaveProperty('movement');
  });

  it('works with a page reference in either order, and is case-insensitive', () => {
    expect(parseWork('A, B, 1800 (p. 12) (movement: Realism)')).toMatchObject({ title: 'B', date: '1800', movement: 'Realism' });
    expect(parseWork('A, B, 1800 (Movement: Realism) (p. 12)')).toMatchObject({ title: 'B', date: '1800', movement: 'Realism' });
  });

  it('keeps a parenthetical that is part of the title', () => {
    expect(parseWork('J.M.W. Turner, The Slave Ship (Slavers Throwing Overboard the Dead and Dying), 1840'))
      .toEqual({ artist: 'J.M.W. Turner', title: 'The Slave Ship (Slavers Throwing Overboard the Dead and Dying)', date: '1840' });
  });

  it('flows through parseExamMarkdown', () => {
    const parsed = parseExamMarkdown('## Must Know Works\n- Manet, Olympia, 1863 (movement: Realism)');
    expect(parsed.works[0]).toMatchObject({ title: 'Olympia', movement: 'Realism' });
  });
});

describe('parseTermLine', () => {
  it('accepts colon, spaced dash, or a bare term', () => {
    expect(parseTermLine('Sfumato: soft blending')).toEqual({ term: 'Sfumato', definition: 'soft blending' });
    expect(parseTermLine('Contrapposto - weight on one leg')).toEqual({ term: 'Contrapposto', definition: 'weight on one leg' });
    expect(parseTermLine('Orientalism')).toEqual({ term: 'Orientalism', definition: '' });
  });

  it('only splits on the first separator and ignores unspaced hyphens and commas', () => {
    expect(parseTermLine('Term: definition: more')).toEqual({ term: 'Term', definition: 'definition: more' });
    expect(parseTermLine('Neo-Impressionism/Pointillism')).toEqual({ term: 'Neo-Impressionism/Pointillism', definition: '' });
    expect(parseTermLine('Salon De Refuses, 1863')).toEqual({ term: 'Salon De Refuses, 1863', definition: '' });
  });
});

describe('parseExamMarkdown', () => {
  it('reads the title, sections (any case) and numbered lists', () => {
    const markdown = [
      '# Renaissance Midterm', '',
      '## MUST KNOW WORKS', '',
      '- Leonardo, Mona Lisa, 1503 (p. 1)',
      '2. Raphael, School of Athens, 1511',
      '',
      '## Must Know Terms', '',
      '- Sfumato: soft blending',
      '* Chiaroscuro',
      '',
      '## Notes', '- not a term and not a work',
    ].join('\n');
    const parsed = parseExamMarkdown(markdown);
    expect(parsed.title).toBe('Renaissance Midterm');
    expect(parsed.works.map((work) => work.title)).toEqual(['Mona Lisa', 'School of Athens']);
    expect(parsed.terms).toEqual([{ term: 'Sfumato', definition: 'soft blending' }, { term: 'Chiaroscuro', definition: '' }]);
  });

  it('ignores bullets outside a known section; only the first H1 is the title', () => {
    const parsed = parseExamMarkdown('- stray bullet\n# First\n# Second\n## Must Know Terms\n- A: b');
    expect(parsed.title).toBe('First');
    expect(parsed.terms).toEqual([{ term: 'A', definition: 'b' }]);
    expect(parsed.works).toEqual([]);
  });

  it('returns empty content for empty input', () => {
    expect(parseExamMarkdown('')).toEqual({ title: '', terms: [], works: [] });
  });
});

describe('term lines (editor textarea format)', () => {
  it('parses and round-trips', () => {
    const terms = parseTermLines('a: b\n\n  c  \nd: e: f');
    expect(terms).toEqual([
      { term: 'a', definition: 'b' },
      { term: 'c', definition: '' },
      { term: 'd', definition: 'e: f' },
    ]);
    expect(formatTermLines(terms)).toBe('a: b\nc: \nd: e: f');
  });
});
