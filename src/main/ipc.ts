// Main-process IPC handlers: what the sandboxed page can't do itself (read files, use the database).
import { dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StudyData } from '../shared/data.js';
import type { Database } from './database.js';
import { normalizePath } from './paths.js';

const IMPORT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Only the app's own page may call these. */
function checkSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!event.senderFrame?.url.startsWith('file://')) throw new Error('Untrusted sender');
}

/** What a synchronous call sends back: an error can't cross as a thrown exception, so it travels as a value. */
export type SyncReply = { ok: true; value: unknown } | { ok: false; error: string };

/** Answers a synchronous call from the page (`ipcRenderer.sendSync`), which waits for `returnValue`. */
function answerSync(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    let reply: SyncReply;
    try {
      checkSender(event);
      reply = { ok: true, value: handler(...args) };
    } catch (error) {
      reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    event.returnValue = reply;
  });
}

export function registerIpc(database: Database): void {
  // The renderer supplies the path, so treat it as untrusted: markdown-ish files only, regular files only, size-capped.
  ipcMain.handle('read-md', async (event, requestedPath: unknown) => {
    checkSender(event);
    if (typeof requestedPath !== 'string') throw new Error('Invalid path');
    const file = normalizePath(requestedPath);
    if (!IMPORT_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      throw new Error('Only .md, .markdown and .txt files can be imported.');
    }
    const info = await fs.promises.stat(file);
    if (!info.isFile()) throw new Error('Not a regular file');
    if (info.size > MAX_IMPORT_BYTES) throw new Error('File is too large');
    return fs.promises.readFile(file, 'utf8');
  });

  ipcMain.handle('pick-md', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // The page's store reads and writes its data synchronously, so these two answer synchronously.
  // The database checks every value it is given (see database.ts), and a failed save changes nothing.
  answerSync('data-load', () => database.load());
  answerSync('data-save', (data) => { database.save(data as StudyData); return null; });
}
