// Pure helpers for dates like "1814", "1796-98" or "c. 1890-94": find the year, and make plausible wrong dates
// in the same format for multiple-choice questions.
import { shuffle } from './util.js';

// prefix, first year, optional "-end" (2 or 4 digits), suffix
const DATE = /^(.*?)(\d{3,4})(?:(\s*[-–]\s*)(\d{2,4}))?(.*)$/;

const OFFSETS = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40];
const MIN_YEAR = 500;
const MAX_YEAR = 2030;

/** The first year in a date string, or null when there isn't one. */
export function parseYear(date: string): number | null {
  const match = DATE.exec(date);
  return match ? Number(match[2]) : null;
}

/** Offsets grow for older work, where a few years either way would be too easy to rule out. */
const scaleFor = (year: number): number => (year < 1000 ? 20 : year < 1500 ? 3 : 1);

function shift(date: string, years: number): string | null {
  const match = DATE.exec(date);
  if (!match) return null;
  const [, prefix = '', start = '', dash = '', end, suffix = ''] = match;
  const newStart = Number(start) + years;
  if (newStart < MIN_YEAR || newStart > MAX_YEAR) return null;
  let endText = '';
  if (end !== undefined) {
    const full = end.length === 2 ? Math.floor(Number(start) / 100) * 100 + Number(end) : Number(end);
    const newEnd = full + years;
    endText = dash + (end.length === 2 ? String(newEnd % 100).padStart(2, '0') : String(newEnd));
  }
  return `${prefix}${newStart}${endText}${suffix}`;
}

/** Up to `count` different dates near `date`, formatted like it. */
export function decoyDates(date: string, count: number): string[] {
  const year = parseYear(date);
  if (year === null) return [];
  const scale = scaleFor(year);
  const decoys: string[] = [];
  for (const offset of shuffle(OFFSETS.flatMap((step) => [step * scale, -step * scale]))) {
    const decoy = shift(date, offset);
    if (decoy && decoy !== date && !decoys.includes(decoy)) decoys.push(decoy);
    if (decoys.length === count) break;
  }
  return decoys;
}
