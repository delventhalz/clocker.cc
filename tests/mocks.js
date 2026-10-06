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

export function mockOrderedState(options = {}) {
  const {
    start = mockTimestamp(),
    times = [{}, {}, {}, {}, {}],
    groups = [{}, {}, {}]
  } = options;

  const orderedTimes = [];
  const orderedGroups = [];

  if (groups.length > 0) {
    orderedGroups.push(mockGroup({ touched: start, ...groups[0] }));
  }
  if (times.length > 0) {
    const partialTime = {
      in: orderedGroups[0].touched,
      ...times[0]
    };
    orderedTimes.push(mockTime(orderedGroups[0], partialTime));
  }

  // Any extra times get assigned to first group
  while (orderedTimes.length <= times.length - groups.length) {
    const partialTime = {
      in: orderedTimes.at(-1).in - mockDays(),
      ...times[orderedTimes.length]
    };
    orderedTimes.push(mockTime(orderedGroups[0], partialTime));
  }

  // Final times each get their own group
  while (orderedTimes.length < times.length) {
    const partialGroup = {
      touched: orderedTimes.at(-1).in - mockDays(),
      ...groups[orderedGroups.length]
    };
    orderedGroups.push(mockGroup(partialGroup));

    const partialTime = {
      in: orderedGroups.at(-1).touched,
      ...times[orderedTimes.length]
    };
    orderedTimes.push(mockTime(orderedGroups.at(-1), partialTime));
  }

  // Any extra groups get no time
  while (orderedGroups.length < groups.length) {
    const partialGroup = {
      touched: orderedGroups.at(-1).touched - mockDays(),
      ...groups[orderedGroups.length]
    };
    orderedGroups.push(mockGroup(partialGroup));
  }

  return {
    times: [
      // Regardless of "in" timestamp, times with no clock out go first
      ...orderedTimes.filter(t => t.out === undefined),
      ...orderedTimes.filter(t => t.out !== undefined)
    ],
    groups: orderedGroups
  }
}
