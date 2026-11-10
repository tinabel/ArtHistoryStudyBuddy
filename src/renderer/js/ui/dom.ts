// Tiny DOM helpers shared by the UI modules.

/** getElementById that fails loudly instead of returning null. */
export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} not found`);
  return element;
}

/** Like `$`, but also checks the element's type (e.g. `field('exName', HTMLInputElement)`). */
export function field<T extends HTMLElement>(id: string, type: abstract new () => T): T {
  const element = byId(id);
  if (!(element instanceof type)) throw new Error(`Element #${id} is not a ${type.name}`);
  return element;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

export const sourceLink = (url: string | undefined): string =>
  url && /^https?:/.test(url)
    ? `<div class="small"><a class="source" href="${escapeHtml(url)}" target="_blank">Source ↗</a></div>`
    : '';

export const thumb = (src: string | undefined): string => (src ? `<img src="${escapeHtml(src)}">` : '<div class="thumb"></div>');

interface ResultRow {
  img: string | undefined;
  title: string;
  subtitle?: string;
  /** Trusted HTML for the action button. */
  button: string;
}

/** One thumbnail + text + action row, shared by search results and the added-works list. */
export const resultRow = ({ img, title, subtitle = '', button }: ResultRow): string => `
  <div class="result">${thumb(img)}
    <div class="text">${escapeHtml(title)}${subtitle ? `<br><span class="small">${escapeHtml(subtitle)}</span>` : ''}</div>
    ${button}
  </div>`;
