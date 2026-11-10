// Exposes a small, typed API to the page. The renderer never gets direct Node access.
import { contextBridge, ipcRenderer } from 'electron';
import type { StudyApi } from '../shared/api.js';
import type { StudyData } from '../shared/data.js';
import type { SyncReply } from './ipc.js';

/** Makes a synchronous call to the main process (see `answerSync` in ipc.ts) and returns its answer or throws its error. */
function callSync(channel: string, ...args: unknown[]): unknown {
  const reply = ipcRenderer.sendSync(channel, ...args) as SyncReply;
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

const api: StudyApi = {
  readMd: (path) => ipcRenderer.invoke('read-md', path) as Promise<string>,
  pickMd: () => ipcRenderer.invoke('pick-md') as Promise<string | null>,
  loadData: () => callSync('data-load') as StudyData | null,
  saveData: (data) => { callSync('data-save', data); },
};

contextBridge.exposeInMainWorld('api', api);
