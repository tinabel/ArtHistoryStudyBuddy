// Switches between the app's top-level views. Imports nothing, so any UI module can use it.

export type View = 'home' | 'editor' | 'study' | 'readingList';

const VIEWS: readonly View[] = ['home', 'editor', 'study', 'readingList'];
const onEnter: Partial<Record<View, () => void>> = {};

export function register(view: View, callback: () => void): void {
  onEnter[view] = callback;
}

export function go(view: View): void {
  for (const id of VIEWS) {
    const element = document.getElementById(id);
    if (element) element.hidden = id !== view;
  }
  onEnter[view]?.();
}
