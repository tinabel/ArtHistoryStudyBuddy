import * as os from 'node:os';
import * as path from 'node:path';
import { isInsideFolder, normalizePath } from '../src/main/paths.js';

describe('isInsideFolder', () => {
  it('accepts files in the folder or below it', () => {
    expect(isInsideFolder('/notes/a.png', '/notes')).toBe(true);
    expect(isInsideFolder('/notes/pictures/a.png', '/notes')).toBe(true);
  });

  it('refuses files outside it, including a sibling with a similar name', () => {
    expect(isInsideFolder('/other/a.png', '/notes')).toBe(false);
    expect(isInsideFolder('/notes-old/a.png', '/notes')).toBe(false);
    expect(isInsideFolder('/notes', '/notes')).toBe(false);
  });
});

describe('normalizePath', () => {
  it('trims whitespace and strips surrounding quotes', () => {
    expect(normalizePath('  "/tmp/a b.md"  ')).toBe('/tmp/a b.md');
    expect(normalizePath("'/tmp/a.md'")).toBe('/tmp/a.md');
  });

  it('unescapes shell-escaped spaces (drag-and-drop paths)', () => {
    expect(normalizePath('/Users/me/Obsidian\\ Vault/Exam.md')).toBe('/Users/me/Obsidian Vault/Exam.md');
  });

  it('expands ~ to the home directory', () => {
    expect(normalizePath('~/Documents/exam.md')).toBe(path.join(os.homedir(), '/Documents/exam.md'));
  });

  it('leaves absolute paths unchanged', () => {
    expect(normalizePath('/Users/me/Exam, Oct. 20-Nov 10.md')).toBe('/Users/me/Exam, Oct. 20-Nov 10.md');
  });
});
