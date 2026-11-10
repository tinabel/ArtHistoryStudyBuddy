// Turns an exam markdown file into ready-to-save exam content:
// parses it, fills missing definitions (Wikipedia) and finds images and nationalities for works.
import { define } from '../api/wikipedia.js';
import { parseExamMarkdown } from '../markdown.js';
import type { Term, Work } from '../types.js';
import { findWorkImage } from './imageFinder.js';
import { lookupWorkInfo } from './workInfo.js';

export interface ImportedExam {
  title: string;
  terms: Term[];
  works: Work[];
  /** Titles of works no image was found for. */
  noImage: string[];
}

export async function importExam(text: string, onProgress: (message: string) => void = () => undefined): Promise<ImportedExam> {
  const parsed = parseExamMarkdown(text);

  const terms: Term[] = [];
  for (const [index, term] of parsed.terms.entries()) {
    let { def } = term;
    let src = '';
    if (!def) {
      onProgress(`Defining term ${index + 1}/${parsed.terms.length}...`);
      ({ def, src } = await define(term.term));
    }
    terms.push({ term: term.term, def, src });
  }

  const works: Work[] = [];
  const noImage: string[] = [];
  for (const [index, work] of parsed.works.entries()) {
    onProgress(`Looking up work ${index + 1}/${parsed.works.length}...`);
    const [{ img, src }, info] = await Promise.all([findWorkImage(work), lookupWorkInfo(work)]);
    if (!img) noImage.push(work.title);
    // After a failed lookup (null) leave the fields unset (not ''), so studying the exam fills them in later.
    works.push({
      id: `md-${work.artist}|${work.title}`, title: work.title, artist: work.artist, nationality: info?.nationality,
      movement: work.movement ?? info?.movement, date: work.date, img, src,
    });
  }

  return { title: parsed.title, terms, works, noImage };
}
