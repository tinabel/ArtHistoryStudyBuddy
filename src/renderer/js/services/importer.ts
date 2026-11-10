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
    let { definition } = term;
    let source = '';
    if (!definition) {
      onProgress(`Defining term ${index + 1}/${parsed.terms.length}...`);
      ({ definition, source } = await define(term.term));
    }
    terms.push({ term: term.term, definition, source });
  }

  const works: Work[] = [];
  const noImage: string[] = [];
  for (const [index, work] of parsed.works.entries()) {
    onProgress(`Looking up work ${index + 1}/${parsed.works.length}...`);
    const [{ image, source }, info] = await Promise.all([findWorkImage(work), lookupWorkInfo(work)]);
    if (!image) noImage.push(work.title);
    // After a failed lookup (null) leave the fields unset (not ''), so studying the exam fills them in later.
    works.push({
      id: `md-${work.artist}|${work.title}`, title: work.title, artist: work.artist, nationality: info?.nationality,
      movement: work.movement ?? info?.movement, date: work.date, image, source,
    });
  }

  return { title: parsed.title, terms, works, noImage };
}
