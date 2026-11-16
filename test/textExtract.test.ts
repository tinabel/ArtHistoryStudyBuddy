/**
 * @jest-environment jsdom
 */
import { bookOpening, pageText, plainText, shorten } from '../src/renderer/js/textExtract.js';

describe('shorten', () => {
  it('collapses white space and leaves short text alone', () => {
    expect(shorten('  One   sentence.\n\nTwo. ')).toBe('One sentence. Two.');
  });

  it('cuts long text at the end of a sentence', () => {
    const text = `${'First sentence here. '.repeat(10)}${'x'.repeat(300)}`;
    const short = shorten(text, 100);
    expect(short.length).toBeLessThanOrEqual(100);
    expect(short.endsWith('.')).toBe(true);
  });

  it('cuts at a space, with an ellipsis, when there is no sentence end to use', () => {
    expect(shorten('word '.repeat(100), 50)).toMatch(/word…$/);
  });
});

describe('plainText', () => {
  it('removes tags and keeps entities readable', () => {
    expect(plainText('<p>A <b>bold</b> &amp; plain claim</p>')).toBe('A bold & plain claim');
    expect(plainText('no tags')).toBe('no tags');
  });
});

describe('pageText', () => {
  const paragraph = 'This paragraph is long enough to count as real writing rather than a menu or a caption.';

  it('takes title, author and the opening paragraphs, ignoring menus, scripts and short lines', () => {
    const page = pageText(`<html><head><title>Fallback title</title>
      <meta property="og:title" content="The Real Title"><meta name="author" content="A. Writer"></head>
      <body><nav><p>${paragraph} (menu)</p></nav><script>var hidden = 1;</script>
      <article><p>Short.</p><p>${paragraph}</p><p>${paragraph} Second.</p></article></body></html>`);
    expect(page.title).toBe('The Real Title');
    expect(page.author).toBe('A. Writer');
    expect(page.excerpt).toBe(`${paragraph} ${paragraph} Second.`);
  });

  it('falls back to the page title and all the text when there are no paragraphs', () => {
    const page = pageText('<html><head><title>Plain</title></head><body><div>Just some words in a div.</div></body></html>');
    expect(page).toEqual({ title: 'Plain', author: '', excerpt: 'Just some words in a div.' });
  });

  it('never runs a script in the page', () => {
    (globalThis as { pageScriptRan?: boolean }).pageScriptRan = false;
    pageText('<body><script>globalThis.pageScriptRan = true</script><img src="x" onerror="globalThis.pageScriptRan = true"></body>');
    expect((globalThis as { pageScriptRan?: boolean }).pageScriptRan).toBe(false);
  });
});

describe('bookOpening', () => {
  it('skips the licence and title page to the first real paragraph', () => {
    const sentence = 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, and so it went on for a long while after that.';
    const book = `The Project Gutenberg eBook of Something\n\nLicence text.\n\n*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***\n\nTITLE PAGE\n\nChapter 1\n\n${sentence}\n\nSecond paragraph.`;
    expect(bookOpening(book)).toBe(`${sentence} Second paragraph.`);
  });

  it('works on text with no licence marker', () => {
    expect(bookOpening('Just a short note.')).toBe('Just a short note.');
  });
});
