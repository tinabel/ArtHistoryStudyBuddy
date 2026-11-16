// Pure text parsing: markdown exam files and the editor's "term: definition" format.
// No DOM, no network.
import type { Term } from './types.js';

export interface ParsedWork {
  artist: string;
  title: string;
  date: string;
  /** Only when the line says "(movement: ...)". */
  movement?: string;
}

export interface ParsedExam {
  title: string;
  terms: Term[];
  works: ParsedWork[];
}

export const stripMd = (text: string): string =>
  text.replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*/g, '')
    .trim();

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

/** "Term: definition", "Term - definition", or bare "Term" -> { term, def } */
export function parseTermLine(line: string): Term {
  const match = /^(.+?)\s*(?::|\s[—–-]\s)\s*(.+)$/.exec(line);
  return match ? { term: (match[1] ?? '').trim(), def: (match[2] ?? '').trim() } : { term: line, def: '' };
}

/**
 * Parse an exam markdown file.
 * `# Title`, then `## ...Terms` / `## ...Works` sections of bullet or numbered lists.
 */
export function parseExamMarkdown(text: string): ParsedExam {
  const result: ParsedExam = { title: '', terms: [], works: [] };
  let section: 'terms' | 'works' | null = null;

  for (const raw of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)/.exec(raw);
    if (heading) {
      const hashes = heading[1] ?? '';
      const label = heading[2] ?? '';
      const lower = label.toLowerCase();
      if (hashes === '#' && !result.title) result.title = stripMd(label);
      if (lower.includes('term')) section = 'terms';
      else if (lower.includes('work')) section = 'works';
      else if (hashes !== '#') section = null;
      continue;
    }
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)/.exec(raw);
    if (!bullet || !section) continue;
    const line = stripMd(bullet[1] ?? '');
    if (!line) continue;
    if (section === 'terms') result.terms.push(parseTermLine(line));
    else result.works.push(parseWork(line));
  }
  return result;
}

/** Editor textarea ("term: definition" per line) -> terms */
export function parseTermLines(text: string): Term[] {
  return text.split('\n')
    .map((line): Term => {
      const colonIndex = line.indexOf(':');
      return colonIndex > 0
        ? { term: line.slice(0, colonIndex).trim(), def: line.slice(colonIndex + 1).trim() }
        : { term: line.trim(), def: '' };
    })
    .filter((term) => term.term);
}

export const formatTermLines = (terms: readonly Term[]): string =>
  terms.map((term) => `${term.term}: ${term.def}`).join('\n');
