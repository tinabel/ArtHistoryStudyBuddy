// Pure text clean-up for readings: turns web pages, book files and descriptions into a short excerpt to study from.
// Uses DOMParser to read HTML. That only builds a document: it never runs scripts or loads anything.

const DEFAULT_EXCERPT_CHARACTERS = 1200;

/** Collapses runs of white space into single spaces. */
const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** `text` cut at the end of a sentence at or before `maxCharacters` (or at a space, or hard, if there is none). */
export function shorten(text: string, maxCharacters = DEFAULT_EXCERPT_CHARACTERS): string {
  const clean = tidy(text);
  if (clean.length <= maxCharacters) return clean;
  const cut = clean.slice(0, maxCharacters);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentenceEnd > maxCharacters / 3) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`;
}

const documentOf = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** The text of an HTML snippet (a description with tags in it). Text with no tags comes back unchanged. */
export const plainText = (html: string): string => tidy(documentOf(html).body.textContent);

export interface PageText {
  title: string;
  author: string;
  excerpt: string;
}

/** A paragraph shorter than this is probably a caption, menu or button, not the writing itself. */
const MIN_PARAGRAPH = 60;

const metaContent = (page: Document, name: string): string =>
  page.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content')?.trim() ?? '';

/** Title, author and the opening paragraphs of a web page. */
export function pageText(html: string): PageText {
  const page = documentOf(html);
  for (const clutter of page.querySelectorAll('script, style, noscript, nav, header, footer, aside, form')) clutter.remove();
  const main = page.querySelector('article, main, [role="main"]') ?? page.body;
  const paragraphs = [...main.querySelectorAll('p')].map((paragraph) => tidy(paragraph.textContent)).filter((text) => text.length >= MIN_PARAGRAPH);
  return {
    title: tidy(metaContent(page, 'og:title') || page.title),
    author: tidy(metaContent(page, 'author') || metaContent(page, 'article:author')),
    excerpt: shorten(paragraphs.length ? paragraphs.join(' ') : main.textContent),
  };
}

/** A Project Gutenberg book file begins with licence text: skip to the first real paragraph of the book. */
export function bookOpening(bookText: string): string {
  const start = /\*\*\* ?START OF[^\n]*\n/i.exec(bookText);
  const body = start ? bookText.slice(start.index + start[0].length) : bookText;
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map(tidy);
  // Skip the title page and contents: the first paragraph with real sentences in it, then the ones after it.
  const firstReal = paragraphs.findIndex((paragraph) => paragraph.length >= 150 && /[.!?]/.test(paragraph));
  return shorten(paragraphs.slice(Math.max(firstReal, 0)).join(' '));
}
