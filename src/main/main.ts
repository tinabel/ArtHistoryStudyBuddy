// Main process: opens the database and creates the window. File and database access for the page is in ipc.ts.
import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import { openDatabase } from './database.js';
import { registerIpc } from './ipc.js';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 560,
    height: 780,
    title: 'Art History Study Buddy',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });

  // Open external links (source citations) in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The app is a single page: never let a stray link or redirect navigate the window away.
  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });

  void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// Exams and classes live in one file in the app's data folder (~/Library/Application Support/art-history-study).
registerIpc(openDatabase(path.join(app.getPath('userData'), 'study.sqlite')));
void app.whenReady().then(() => {
  // The packaged app gets its icon from the .icns; this covers running from source (`npm start`).
  app.dock?.setIcon(path.join(__dirname, '..', '..', 'assets', 'icon.png'));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
