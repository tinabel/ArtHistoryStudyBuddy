import type { StudyData } from './data.js';

/** What the preload script exposes to the page as `window.api`. */
export interface StudyApi {
  /** Read a markdown file (accepts ~, quotes and shell-escaped spaces). */
  readMd: (path: string) => Promise<string>;
  /** Show a file picker; resolves to the chosen path or null if cancelled. */
  pickMd: () => Promise<string | null>;
  /**
   * Everything saved in the database, or null if nothing has ever been saved to it.
   * Waits for the answer (it is not a promise), so the page can read its data while it starts up.
   */
  loadData: () => StudyData | null;
  /** Replaces what is saved with `data`. Waits until it is written; throws if it can't be. */
  saveData: (data: StudyData) => void;
}
