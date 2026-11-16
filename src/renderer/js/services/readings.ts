// Turns what was found (a search result, or a link in a markdown file) into a saved reading with its excerpt.
import { bookOpening, pageText } from '../textExtract.js';
import type { Reading, ReadingCandidate } from '../types.js';
import { READING_SOURCES, searchReadings } from './readingSearch.js';

/** The text of a web page or file, as the main process downloads it. Throws a message fit to show the user. */
export async function downloadText(address: string): Promise<{ text: string; url: string }> {
  try {
    return await window.api.fetchText(address);
  } catch (error) {
    // Electron wraps the main process's message: "Error invoking remote method 'fetch-text': Error: <message>".
    const message = error instanceof Error ? error.message : '';
    throw new Error(message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') || 'Could not download that page.', { cause: error });
  }
}

/** True for a Project Gutenberg book file, which starts with licence text. */
const isGutenbergBook = (text: string): boolean => /\*\*\* ?START OF/i.test(text.slice(0, 20_000));

/** The excerpt of a downloaded file: a book's opening, or the opening paragraphs of a web page. */
function excerptOf(text: string): string {
  return isGutenbergBook(text) || !/<(p|div|body|html)\b/i.test(text) ? bookOpening(text) : pageText(text).excerpt;
}

/** The candidate as a saved reading, fetching its excerpt first when the search didn't give one. */
export async function completeReading({ reading, textUrl }: ReadingCandidate): Promise<Reading> {
  if (reading.excerpt || !textUrl) return reading;
  try {
    return { ...reading, excerpt: excerptOf((await downloadText(textUrl)).text) };
  } catch {
    return reading; // still worth keeping: the title and the link to read it
  }
}

/** A web page as a reading: its title, author and opening. Throws if the page can't be downloaded. */
export async function readingFromLink(address: string, knownTitle = ''): Promise<Reading> {
  const { text, url } = await downloadText(address);
  const page = pageText(text);
  return {
    id: `link-${url}`,
    title: knownTitle || page.title || new URL(url).hostname,
    author: page.author,
    excerpt: page.excerpt,
    source: url,
  };
}

/** What to look for when a markdown line names a reading. */
export interface ReadingRequest {
  title: string;
  author: string;
  /** An https address written in the file, or ''. */
  link: string;
}

export interface FoundReading {
  reading: Reading;
  /** False when nothing could be found or downloaded, so the reading holds only what the file said. */
  complete: boolean;
}

const lowerTitle = (reading: Reading): string => reading.title.toLowerCase();

/**
 * The reading a markdown line is about. A link in the line is downloaded; otherwise the title (and author) is
 * searched for in every place, taking the first match whose title agrees, or else the first result.
 */
export async function findReading({ title, author, link }: ReadingRequest): Promise<FoundReading> {
  // What the file says is kept as written (it is the course's wording); a bare link with no title gets its host name.
  const bare: Reading = { id: `text-${title || link}|${author}`, title: title || (URL.canParse(link) ? new URL(link).hostname : ''), author, excerpt: '', source: link };
  if (link) {
    try {
      const fromLink = await readingFromLink(link, title);
      return { reading: { ...fromLink, author: author || fromLink.author }, complete: true };
    } catch {
      return { reading: bare, complete: false };
    }
  }
  const { found } = await searchReadings(`${title} ${author}`.trim(), READING_SOURCES.map((source) => source.id));
  const best = found.find((listed) => lowerTitle(listed.item.reading).includes(title.toLowerCase())) ?? found[0];
  if (!best) return { reading: bare, complete: false };
  const reading = await completeReading(best.item);
  return { reading: { ...reading, title, author: author || reading.author }, complete: true };
}
