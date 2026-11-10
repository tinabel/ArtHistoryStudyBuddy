# Art History Study Buddy

Art history study and review app for macOS (Electron + TypeScript). Build exams from "must know" works and terms, then drill them with flashcards or multiple-choice quizzes. Scores are saved per exam.

## Requirements

- macOS
- [Node.js](https://nodejs.org) 22.13 or newer (includes `npm`)
- [Git](https://git-scm.com)
- Internet connection (artwork images, definitions and nationalities are fetched live)

## Installation

```bash
git clone https://github.com/tinabel/ArtHistoryStudyBuddy.git
cd ArtHistoryStudyBuddy
npm install
```

## Run

```bash
npm start
```

This compiles the TypeScript to `build/` and launches the app.

## Build the installer

```bash
npm run dist
```

This packages the app and wraps it in `dist/Art-History-Study-Buddy-<version>-<arch>.dmg` for your Mac's architecture (Apple Silicon or Intel). Open the `.dmg` and drag **Art History Study Buddy** onto **Applications**.

The app icon lives in `assets/` (`icon.png` is the 1024 px master, `icon.icns` is generated from it).

To build just the `.app` without the installer, run `npm run package`; it lands in `dist/Art History Study Buddy-darwin-<arch>/`.

**First launch on another Mac:** the app is only ad-hoc signed (no paid Apple Developer ID), so macOS will say it can't verify the developer. Right-click the app → **Open** → **Open**. If macOS says the app is "damaged", run `xattr -cr "/Applications/Art History Study Buddy.app"` once.

An installer built on Apple Silicon only runs on Apple Silicon; build on an Intel Mac for an Intel installer.

Exams, classes and scores are saved in a SQLite database, `~/Library/Application Support/art-history-study/study.sqlite`. The installed app and `npm start` share that file, so they see the same exams. To back up or move your exams, copy that file while the app is closed.

Earlier versions kept exams in the app's browser storage. The first time this version starts it copies them into the database; the old copy is left where it was.

## Usage

1. **+ Add Exam**, then name it.
2. Add content:
   - **Must Know Works:** search the Met and click Add, or import a markdown file.
   - **Must Know Terms:** one per line as `term: definition`, or import a markdown file.
   - **Random art pool (optional):** pull random Met art by department and year range.
3. **Save Exam**, then **Study**. Choose Flashcard or Quiz, and Works, Terms, or mixed.
   - Flashcards: reveal the answer, then mark **Got it** or **Missed**.
   - Quizzes: pick from four choices.
     - **Works** are asked about at random: the **artist**, the **title**, the **year** and the **art movement** (Impressionism, Realism, …). A question is only asked when the app knows the answer, so a work with no movement never gets a movement question.
     - **Terms** show the definition with the term blanked out of it.
   - After you answer (or reveal), **Edit details** lets you correct that work's artist, nationality, title, date and movement, or a term's name and definition. Edits are saved to the exam. A corrected nationality also applies to that artist's other works.
     - A work with no picture (or the wrong one) can be given one there: paste an `https://` image link, **Choose a file…** from your Mac (it is scaled down to 640 px and saved inside the exam, about 35 KB each), or **Find automatically** to search Wikimedia Commons and the Met again with the title and artist as you've corrected them. **Remove** clears it.
     - Pictures you choose from your Mac are saved in the database with the exam. If saving ever fails, the edit is undone and you're told.

Use ↺ on the home screen to reset an exam's scores.

### Classes

Group exams by class (for example *Art History 101* or *Art History 200: Western Romanticism*):

- Type a name under the exam list and click **+ Add Class**. Classes are listed in order, so 101 comes before 200.
- **+ Add Exam** beside a class name creates an exam in that class. The editor also has a class dropdown.
- The dropdown on each exam moves it to another class, or to **No class**.
- ✕ beside a class name removes the class only. Its exams are kept and move to **No class**.

Classes are optional: with none, the home screen is a plain list of exams.

### Markdown import

Type a file path (or use **Browse…**) in the exam editor. See [`sample-exam.md`](sample-exam.md).

```md
# Exam Name

## Must Know Works
- Artist, Title, Date (p. 123)

## Must Know Terms
- Term
- Term: definition
```

- Works get images from Wikimedia Commons, then the Met. Some may have no image.
- Terms without a definition are auto-filled from Wikipedia. Review them, since they can be generic or wrong.
- Every work and term links to its source.
- Each artist's nationality (e.g. "French") and each work's art movement come from Wikidata (the Met record, for nationality, when searching the Met). The movement is taken from the artwork's own Wikidata entry when it has one, otherwise from the artist's. Exams saved before these existed are filled in as you study.
- **Check them.** They are best guesses and sometimes differ from your course (Wikidata may say "Prussian" where your course says "German", or file a Manet under "Impressionism" when you need "Realism"). Fix any of them with **Edit details**, or state the movement in your markdown so it's right from the start:

  ```md
  - Édouard Manet, Olympia, 1863 (p. 1016) (movement: Realism)
  ```

## Development

| Command | What it does |
|---|---|
| `npm start` | Build, then launch the app |
| `npm run build` | Compile TypeScript to `build/` and copy HTML/CSS |
| `npm run typecheck` | Type-check source and tests (no output files) |
| `npm run lint` | ESLint with `typescript-eslint` (strict, type-checked) |
| `npm test` | Run the Jest tests |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run check:apis` | Live check that the Met, Wikimedia and Wikidata services still answer as the app expects (the tests stub the network, so they can't notice a service changing) |
| `npm run package` | Build and package the `.app` |
| `npm run dist` | Package, then build the `.dmg` installer |

Tests never touch the network: `fetch` is stubbed. UI tests run the real UI modules in jsdom.

Pull requests run typecheck, lint, tests and build in GitHub Actions (`.github/workflows/ci.yml`).

### Dependency notes

- `package.json` forces `minimatch` to `^11.0.1` (`overrides`) to resolve a denial-of-service advisory (GHSA-g3hv-75wg-m249). ESLint, typescript-eslint, `@electron/asar` and Jest's coverage helper still ask for `minimatch` 9 or 10, and none of their latest releases has moved on. Remove the override once they do.
- `deepmerge` (low severity, prototype poisoning, GHSA-gcqx-w48m-w2h4) is pulled in by Jest, and no patched version exists. It only merges Jest's own configuration during development and is not part of the app.

### Project structure

```
src/
  main/            Electron main process (CommonJS)
    database.ts      the SQLite database: tables, load, save, and checks on every value
    main.ts          creates the window
    ipc.ts           what the sandboxed page can't do itself: read files, reach the database
    paths.ts         path normalisation (pure)
    preload.ts       exposes a typed window.api to the page
  shared/          contracts shared by main and renderer
    api.d.ts         window.api
    data.d.ts        the shapes that get saved (exam, work, term…)
  renderer/        the page (ES modules, runs in the browser)
    index.html       markup only
    styles.css       styles only
    js/
      app.ts           entry point: event dispatch, view registration
      ui/              DOM rendering and event handlers (home, editor, study, editDetails, router, dom helpers)
      quiz.ts          study logic: sources, cards, multiple-choice answers
      store.ts         exams, classes and scores; loads and saves them through window.api
      legacyStorage.ts read-only: exams from versions that used browser storage
      markdown.ts      pure parsing of markdown and term text
      textMask.ts      pure: hides a term inside its definition
      years.ts         pure: find the year in a date, make plausible wrong dates
      services/        multi-step workflows: import, image lookup, work info (nationality, movement), random art
      api/             one client per data source: Met, Wikimedia Commons, Wikipedia, Wikidata
      data/            fallback quiz answers (famous artists, titles, movements)
      types.ts, util.ts
test/              Jest tests (unit, plus jsdom UI tests)
build/             compiled output (git-ignored)
```

Dependencies point one way: `ui` → `quiz` / `store` / `services` → `api`. Only `ui` touches the DOM, only `store` loads and saves data, and only `main/database.ts` touches SQLite.

Lookup failures follow one rule: the Wikidata client (`api/wikidata.ts`) returns `''` for "not on Wikidata" and throws when it can't be reached; `services/workInfo.ts` turns a throw into `null`. Nothing saves a `null` result, so the next study session asks again.

### Saved data (SQLite)

The database uses Node's built-in `node:sqlite`, so there is no extra package to install or rebuild. You can inspect it with any SQLite tool, for example `sqlite3 ~/Library/Application\ Support/art-history-study/study.sqlite .schema`.

| Table | Holds |
|---|---|
| `courses` | Class names, in display order |
| `exams` | One row per exam: name, class, random-art filter and scores (the last two as JSON) |
| `works` | Each exam's works, one row each |
| `terms` | Each exam's terms, one row each |

- The page keeps the whole list in memory (`store.ts`) and every change saves all of it again in one transaction, so a failed save leaves the previous data intact.
- To save a new field: add it to `src/shared/data.d.ts`, then to the table, the `INSERT` and the row-reading function in `src/main/database.ts`. An existing database also needs an `ALTER TABLE … ADD COLUMN` there.
- SQL is only ever run with bound `?` parameters, and every value from the page is type-checked before it is stored.

### Styling

All styles are in `src/renderer/styles.css`; the code contains no inline styles. Run `npm start` to see a change.

- **Colours, corners, font:** edit the variables in section 1 ("Theme") at the top of the file. Every colour in the app comes from one of them, so changing `--color-button` restyles every main button.
- **Overall size:** the `font-size` line at the end of the Theme block scales the whole interface.
- **One part of the app:** the file is in numbered sections (page, helpers, controls, lists, study, edit details), listed at its top.

| Class | Use |
|---|---|
| `button` (no class) | Main action |
| `button.secondary` | Cancel, Next, Browse… |
| `button.danger` | Delete, Missed |
| `.small` | Hints, counts, status messages |
| `.panel` | The rounded box each view sits in |
| `.course`, `.course-head` | One class on the home screen, and its name-and-buttons line |
| `.choice.right`, `.choice.wrong`, `.correct`, `.incorrect` | Added by the app when you answer (`ui/study.ts`) |

Images may only load from `https:` and `data:` addresses, and fonts and stylesheets only from the app itself (the Content-Security-Policy in `index.html`). A web font needs to be added to `src/renderer/` and allowed there with `font-src 'self'`.

## Data sources

[Met Museum Open Access API](https://metmuseum.github.io/), [Wikimedia Commons](https://commons.wikimedia.org), [Wikipedia](https://en.wikipedia.org), [Wikidata](https://www.wikidata.org).

## License

See [LICENSE](LICENSE).
