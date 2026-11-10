// Pure text helper: hide a term inside its own definition so a quiz question doesn't give away the answer.

const BLANK = '_____';
const STEM_MIN_LENGTH = 7; // single-word terms at least this long also mask related forms (Impressionism -> Impressionist)
const STEM_TRIM = 3;

const stripAccents = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '');
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words/phrases that identify `term`: the whole term, its parts, and without a trailing date or parenthetical. */
function variantsOf(term: string): string[] {
  const cleaned = term.replace(/\([^)]*\)/g, ' ').replace(/,\s*\d{3,4}.*$/, '').trim();
  const parts = cleaned.split('/').map((part) => part.trim());
  return [...new Set([term, cleaned, ...parts].filter((variant) => variant.length > 2))];
}

/** Regex source for a variant: hyphens and spaces are interchangeable. */
const phrasePattern = (variant: string): string =>
  stripAccents(variant).split(/[-\s]+/).filter(Boolean).map(escapeRegex).join('[-\\s]+');

function patternsFor(term: string): string[] {
  const variants = variantsOf(term);
  const patterns = variants.map(phrasePattern);
  for (const variant of variants) {
    const word = stripAccents(variant);
    if (/^\p{L}+$/u.test(word) && word.length >= STEM_MIN_LENGTH) {
      patterns.push(`${escapeRegex(word.slice(0, word.length - STEM_TRIM))}\\p{L}*`);
    }
  }
  return patterns;
}

/** Replaces every match of `patterns` in `text` (matching on its accent-free twin `plain`). */
function maskMatches(text: string, plain: string, patterns: string[]): string {
  const regex = new RegExp(`(?<![\\p{L}])(?:${patterns.join('|')})`, 'giu');
  let masked = '';
  let last = 0;
  for (const match of plain.matchAll(regex)) {
    masked += text.slice(last, match.index) + BLANK;
    last = match.index + match[0].length;
  }
  return masked + text.slice(last);
}

/** Distinctive words of a term (long words and years), for when the full phrase isn't found verbatim. */
const wordPatterns = (term: string): string[] =>
  stripAccents(term).split(/[^\p{L}\d]+/u)
    .filter((word) => word.length >= 5 || /^\d{4}$/.test(word))
    .map(escapeRegex);

/** Returns `definition` with every mention of `term` replaced by a blank. */
export function maskTerm(definition: string, term: string): string {
  const text = definition.normalize('NFC');
  const plain = stripAccents(text); // same length as `text` for precomposed Latin letters
  if (plain.length !== text.length) return text; // unusual characters: don't risk misaligned masking

  const masked = maskMatches(text, plain, patternsFor(term));
  if (masked !== text) return masked;

  const words = wordPatterns(term);
  return words.length ? maskMatches(text, plain, words) : text;
}
