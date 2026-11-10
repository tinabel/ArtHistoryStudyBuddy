// Main process: opens the database and creates the window. File and database access for the page is in ipc.ts.
//
// Security settings live here. The page is treated as untrusted: it runs sandboxed without Node, can't navigate
// away, can't open windows, and is refused every device permission (camera, location, ...).
import { app, BrowserWindow, session, shell } from 'electron';
import * as path from 'node:path';
import { openDatabase } from './database.js';
import { registerIpc } from './ipc.js';

const PAGE_FILE = path.join(__dirname, '..', 'renderer', 'index.html');

/** Opens a link in the user's browser, if it is an ordinary secure web address. Anything else is ignored. */
function openInBrowser(url: string): void {
  if (URL.canParse(url) && new URL(url).protocol === 'https:') void shell.openExternal(url);
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 560,
    height: 780,
    title: 'Art History Study Buddy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // These four are Electron's defaults, written out so that changing one is a deliberate act.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Links (source citations) open in the default browser, never in a new app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });

  // The app is a single page: never let a stray link or redirect navigate the window away.
  window.webContents.on('will-navigate', (event) => { event.preventDefault(); });

  void window.loadFile(PAGE_FILE);
}

function start(): void {
  // Exams and classes live in one file in the app's data folder (~/Library/Application Support/art-history-study).
  registerIpc(openDatabase(path.join(app.getPath('userData'), 'study.sqlite')), PAGE_FILE);

  void app.whenReady().then(() => {
    // The app needs no camera, microphone, location, notifications...: refuse them all.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, decide) => { decide(false); });
    session.defaultSession.setPermissionCheckHandler(() => false);

    // The packaged app gets its icon from the .icns; this covers running from source (`npm start`).
    app.dock?.setIcon(path.join(__dirname, '..', '..', 'assets', 'icon.png'));
    createWindow();
  });

  // A second launch brings the first window forward instead (see the lock below).
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// Only one copy of the app may run: each save replaces the whole database, so two copies would undo each other's changes.
if (app.requestSingleInstanceLock()) start();
else app.quit();
