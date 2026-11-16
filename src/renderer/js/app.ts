// Entry point: registers views and routes DOM events to UI actions.
//
// Markup declares behaviour with attributes instead of inline handlers:
//   data-action="view.name"  -> click
//   data-change="view.name"  -> change
//   data-enter="view.name"   -> Enter key
import * as editor from './ui/editor.js';
import * as home from './ui/home.js';
import * as readingList from './ui/readingList.js';
import { go, register } from './ui/router.js';
import * as study from './ui/study.js';
import type { ActionMap } from './ui/actions.js';

const actions: ActionMap = { ...home.actions, ...editor.actions, ...study.actions, ...readingList.actions };

function dispatch(eventType: 'click' | 'change' | 'keydown', attribute: string): void {
  document.addEventListener(eventType, (event) => {
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
    if (!(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>(`[${attribute}]`);
    const handler = element ? actions[element.getAttribute(attribute) ?? ''] : undefined;
    if (element && handler) Promise.resolve(handler(element, event)).catch(console.error);
  });
}

dispatch('click', 'data-action');
dispatch('change', 'data-change');
dispatch('keydown', 'data-enter');

register('home', home.render);
go('home');
