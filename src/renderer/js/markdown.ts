// Pure text parsing: markdown exam files and the editor's "term: definition" format.
// No DOM, no network.
import type { Term } from './types.js';

export interface ParsedWork {
  artist: string;
  title: string;
  date: string;
  /** Only when the line says "(movement: ...)". */
  movement?: string;
  /** Only when the line holds a picture, `![](picture.jpg)`: an https:// address or a file path, as written. */
  image?: string;
}

export interface ParsedReading {
  title: string;
  /** '' when the line gives none. */
  author: string;
  /** An https address written in the line, or ''. */
  link: string;
}

export interface ParsedExam {
  title: string;
  terms: Term[];
  works: ParsedWork[];
  readings: ParsedReading[];
}

export const stripMd = (text: string): string =>
  text.replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*/g, '')
    .trim();

const IMAGE_MARKDOWN = /!\[[^\]]*\]\(\s*<?([^)>]*?)>?\s*\)/;

/** Splits a picture, `![caption](address)`, off a line. A path with spaces may be written `![](<my picture.jpg>)`. */
export function splitOffImage(line: string): { text: string; image: string } {
  const match = IMAGE_MARKDOWN.exec(line);
  return match ? { text: line.replace(IMAGE_MARKDOWN, ' ').trim(), image: (match[1] ?? '').trim() } : { text: line, image: '' };
}

/**
 * "Artist, Title, 1814 (p. 994)" -> { artist, title, date }.
 * Trailing "(p. 994)" is dropped; trailing "(movement: Romanticism)" sets the movement.
 */
export function parseWork(line: string): ParsedWork {
  let rest = line.trim();
  let movement = '';
  for (;;) {
    const group = /\s*\(([^()]*)\)\s*$/.exec(rest);
    const inner = group?.[1] ?? '';
    const movementMatch = /^movement:\s*(.+)$/i.exec(inner);
    if (!group || !(movementMatch || /^p+\./i.test(inner))) break;
    if (movementMatch) movement = (movementMatch[1] ?? '').trim();
    rest = rest.slice(0, group.index).trim();
  }
  let date = '';
  const dateMatch = /,\s*((?:c\.\s*)?\d{3,4}(?:\s*[-–]\s*\d{2,4})?)\s*$/i.exec(rest);
  if (dateMatch) {
    date = dateMatch[1] ?? '';
    rest = rest.slice(0, dateMatch.index).trim();
  }
  const comma = rest.indexOf(',');
  const work: ParsedWork = comma > 0
    ? { artist: rest.slice(0, comma).trim(), title: rest.slice(comma + 1).trim(), date }
    : { artist: '', title: rest, date };
  return movement ? { ...work, movement } : work;
}

/**
 * A line of the Readings section: "Title by Author", "Title, Author", "[Title](https://…)", "[Title](https://…), Author"
 * or a bare https address. Trailing page references like "(pp. 3-20)" are dropped.
 */
export function parseReading(line: string): ParsedReading {
  let rest = line.trim();
  let link = '';
  const linkMatch = /\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/.exec(rest);
  if (linkMatch) {
    link = linkMatch[2] ?? '';
    rest = rest.replace(linkMatch[0], linkMatch[1] ?? '');
  } else {
    const bare = /https:\/\/[^\s)>]+/.exec(rest);
    if (bare) { link = bare[0]; rest = rest.replace(bare[0], ''); }
  }
  rest = stripMd(rest).replace(/\s*\((?:pp?|ch|chapters?)\.[^()]*\)\s*$/i, '').replace(/^[\s,:–—-]+|[\s,:–—-]+$/g, '');
  const byAuthor = / by (.+)$/i.exec(rest);
  if (byAuthor) return { title: rest.slice(0, byAuthor.index).trim(), author: (byAuthor[1] ?? '').trim(), link };
  const comma = rest.lastIndexOf(','); // "Title, Author": the author is what follows the last comma
  return comma > 0
    ? { title: rest.slice(0, comma).trim(), author: rest.slice(comma + 1).trim(), link }
    : { title: rest, author: '', link };
}

/** "Term: definition", "Term - definition", or bare "Term" -> { term, definition } */
export function parseTermLine(line: string): Term {
  const match = /^(.+?)\s*(?::|\s[—–-]\s)\s*(.+)$/.exec(line);
  return match ? { term: (match[1] ?? '').trim(), definition: (match[2] ?? '').trim() } : { term: line, definition: '' };
}

/**
 * Parse an exam markdown file.
 * `# Title`, then `## ...Terms` / `## ...Works` sections of bullet or numbered lists.
 */
export function parseExamMarkdown(text: string): ParsedExam {
  const result: ParsedExam = { title: '', terms: [], works: [], readings: [] };
  let section: 'terms' | 'works' | 'readings' | null = null;

  for (const raw of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)/.exec(raw);
    if (heading) {
      const hashes = heading[1] ?? '';
      const label = heading[2] ?? '';
      const lower = label.toLowerCase();
      if (hashes === '#' && !result.title) result.title = stripMd(label);
      if (lower.includes('term')) section = 'terms';
      else if (lower.includes('reading')) section = 'readings';
      else if (lower.includes('work')) section = 'works';
      else if (hashes !== '#') section = null;
      continue;
    }
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)/.exec(raw);
    if (!bullet || !section) continue;
    if (section === 'readings') {
      const reading = parseReading(bullet[1] ?? '');
      if (reading.title || reading.link) result.readings.push(reading);
      continue;
    }
    const { text, image } = splitOffImage(bullet[1] ?? '');
    const line = stripMd(text);
    if (!line) continue;
    if (section === 'terms') result.terms.push(parseTermLine(line));
    else result.works.push(image ? { ...parseWork(line), image } : parseWork(line));
  }
  return result;
}

/** Editor textarea ("term: definition" per line) -> terms */
export function parseTermLines(text: string): Term[] {
  return text.split('\n')
    .map((line): Term => {
      const colonIndex = line.indexOf(':');
      return colonIndex > 0
        ? { term: line.slice(0, colonIndex).trim(), definition: line.slice(colonIndex + 1).trim() }
        : { term: line.trim(), definition: '' };
    })
    .filter((term) => term.term);
}

export const formatTermLines = (terms: readonly Term[]): string =>
  terms.map((term) => `${term.term}: ${term.definition}`).join('\n');
