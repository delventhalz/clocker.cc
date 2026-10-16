import { h } from 'preact';
import { useClockerContext } from './context.js';

export function Times() {
  const { times } = useClockerContext();

  return h('div', null,
    h('ul', null, times.map(Time))
  );
}

function Time(time) {
  const inStr = new Date(time.in).toLocaleString();

  if (time.out === undefined) {
    return h('li', null, `${inStr} — ...`) ;
  }

  const outStr = new Date(time.out).toLocaleString();
  const inMinutes = Math.floor(time.in / 1000 / 60);
  const outMinutes = Math.floor(time.out / 1000 / 60);
  const hoursStr = ((outMinutes - inMinutes) / 60).toFixed(2);

  return h('li', null, `${inStr} — ${outStr} (${hoursStr}h)`);
}
