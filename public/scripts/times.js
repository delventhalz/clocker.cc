import { h } from 'preact';
import { useClockerContext } from './context.js';

export function Times() {
  const { times } = useClockerContext();

  return h('div', null,
    h('ul', null, times.map(t => {
      const inStr = new Date(t.in).toISOString();
      const outStr = t.out === undefined ? '' : new Date(t.out).toISOString();
      return h('li', null, `${inStr} | ${outStr}`);
    }))
  );
}
