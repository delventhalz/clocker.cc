import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export function mockAscii(maxLength, minLength = 1) {
  const length = minLength === maxLength ? maxLength : randomInt(minLength, maxLength);
  const codes = Array(length).fill(0).map(() => randomInt(32, 127));
  return String.fromCharCode(...codes);
}

function roundToSecond(ms) {
  return Math.round(Math.floor(ms / 1000) * 1000);
}

export function mockHours() {
  return roundToSecond(randomInt(10 * 60 * 60 * 1000));
}

export function mockDays() {
  return roundToSecond(randomInt(10 * 24 * 60 * 60 * 1000));
}

export function mockYears() {
  return roundToSecond(randomInt(10 * 365.25 * 24 * 60 * 60 * 1000));
}

export function mockTimestamp() {
  return roundToSecond(Date.now() - mockYears());
}

export function mockGroup(partial = {}) {
  return {
    id: partial.id ?? randomUUID(),
    touched: partial.touched ?? mockTimestamp(),
    color: partial.color ?? '#' + randomBytes(3).toString('hex'),
    label: partial.label ?? mockAscii(127)
  };
}

export function mockTime(group, partial = {}) {
  const outTs = partial.out !== undefined
    ? partial.out
    : partial.in !== undefined
    ? partial.in + mockHours()
    : group.touched;

  const inTs = typeof partial.in === 'number'
    ? partial.in
    : outTs !== null
    ? outTs - mockHours()
    : group.touched;

  return {
    group: group.id,
    in: inTs,
    ...(outTs === null ? {} : { out: outTs })
  };
}
