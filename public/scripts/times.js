import { h } from 'preact';
import { useClockerContext } from './context.js';

const TIME_FORMAT = Intl.DateTimeFormat(undefined, {
  hour12: true,
  hour: 'numeric',
  minute: '2-digit'
});

const DATE_TIME_FORMAT = Intl.DateTimeFormat(undefined, {
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  month: 'numeric',
  day: 'numeric',
});

const DAY_DATE_TIME_FORMAT = Intl.DateTimeFormat(undefined, {
  hour12: true,
  hour: 'numeric',
  minute: '2-digit',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short'
});

const DURATION_FORMAT = Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
  style: 'unit',
  unit: 'hour',
  unitDisplay: 'narrow'
})

export function Times() {
  const { times } = useClockerContext();

  return h('div', null,
    h('ul', null, times.map(Time))
  );
}

function Time(time) {
  const inDate = new Date(time.in);
  const inStr = toInString(inDate);

  if (time.out === undefined) {
    return h('li', null, `${inStr} — ...`) ;
  }

  const outDate = new Date(time.out);
  const outStr = toOutString(inDate, outDate);
  const duration = toDurationString(time.in, time.out);

  return h('li', null, `${inStr} — ${outStr} (${duration})`);
}

function toInString(inDate) {
  return DAY_DATE_TIME_FORMAT.format(inDate).replaceAll(',', '');
}

function toOutString(inDate, outDate) {
  const formatter = isSameDay(inDate, outDate) ? TIME_FORMAT : DATE_TIME_FORMAT;
  return formatter.format(outDate).replaceAll(',', '');
}

function toDurationString(startMs, endMs) {
  const inMinutes = Math.floor(startMs / 1000 / 60);
  const outMinutes = Math.floor(endMs / 1000 / 60);
  const hours = ((outMinutes - inMinutes) / 60);
  return DURATION_FORMAT.format(hours);
}

function isSameDay(dateA, dateB) {
  return dateA.getDate() === dateB.getDate()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getFullYear() === dateB.getFullYear();
}
