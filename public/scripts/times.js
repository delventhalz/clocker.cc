import { h } from 'preact';
import { useClockerContext } from './context.js';

export function Times() {
  const { times } = useClockerContext();

  return h('div', null,
    h('ul', null, times.map(t => {
      const inStr = new Date(t.in).toLocaleString();
      const outStr = t.out === undefined ? '' : new Date(t.out).toLocaleString();
      return h('li', null, `${inStr} — ${outStr}`);
    }))
  );
}
