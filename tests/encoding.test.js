import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { encode, decode } from '../public/scripts/encoding.js';

function mockAscii(maxLength, minLength = 1) {
  const length = minLength === maxLength ? maxLength : randomInt(minLength, maxLength);
  const codes = Array(length).fill(0).map(() => randomInt(32, 127));
  return String.fromCharCode(...codes);
}

function mockHours() {
  return randomInt(10 * 60 * 60 * 1000);
}

function mockDays() {
  return randomInt(10 * 24 * 60 * 60 * 1000);
}

function mockYears() {
  return randomInt(10 * 365.25 * 24 * 60 * 60 * 1000);
}

function mockGroup(partial = {}) {
  return {
    id: partial.id ?? randomUUID(),
    color: partial.color ?? '#' + randomBytes(3).toString('hex'),
    label: partial.label ?? mockAscii(127)
  };
}

function mockTime(group, partial = {}) {
  const inTs = partial.in ?? Date.now() - mockYears();
  const outTs = partial.out ?? (partial.out === null ? null : inTs + mockHours());

  return {
    group: group.id,
    in: inTs,
    ...(outTs === null ? {} : { out: outTs })
  };
}

function assertSecondsEqual(actualSeconds, expectedMs) {
  assert.equal(
    actualSeconds,
    Math.round(Math.floor(expectedMs / 1000) * 1000),
    'Expected second-precision timestamps to be equal'
  );
}

function assertNotHasProp(actualObject, expectedPropName) {
  assert.equal(
    expectedPropName in actualObject,
    false,
    `Expected "${expectedPropName}" not to be in ${JSON.stringify(actualObject)}`
  );
}

function assertLength(actualArray, expectedLength) {
  assert.equal(
    actualArray.length,
    expectedLength,
    `Expected Array(${actualArray.length}) to have length ${expectedLength}`
  );
}

test('Encodes into a url-safe base64 string', () => {
  const group = mockGroup();
  const time = mockTime(group);

  const encoded = encode(Date.now(), [time], [group]);
  assert.match(encoded, /^[0-9A-Za-z_-]*$/);
});

test('Decodes basic encoded data', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup();
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes times with no clock out', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup();
  const time = mockTime(group, { out: null });

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertNotHasProp(decoded.times[0], 'out');
});

test('Encodes and decodes times with a short clock in', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup();
  const time = mockTime(group, { in: timestamp - 1000 });

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes times with a short clock out', () => {
  const timestamp = Date.now() - mockYears();
  const inTs = timestamp - mockDays();
  const group = mockGroup();
  const time = mockTime(group, { in: inTs, out: inTs + 1000 });

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes times with a long clock in', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup();
  const time = mockTime(group, { in: timestamp - (2 ** 24 + 1) * 1000 });

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes times with a long clock out', () => {
  const timestamp = Date.now() - mockYears();
  const inTs = timestamp - mockDays();
  const group = mockGroup();
  const time = mockTime(group, { in: inTs, out: inTs + (2 ** 40 - 1) * 1000 });

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes a far future timestamp', () => {
  const timestamp = Number.MAX_SAFE_INTEGER * 1000;
  const group = mockGroup();
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes groups with no label', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup({ label: '' });
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes groups with a long label', () => {
  const timestamp = Date.now() - mockYears();
  const group = mockGroup({ label: mockAscii(127, 127) });
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Truncates a too long label', () => {
  const label = mockAscii(1024, 128);
  const timestamp = Date.now() - mockYears();
  const group = mockGroup({ label });
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);

  assert.partialDeepStrictEqual(decoded.groups, [{ id: group.id, color: group.color }]);
  assert.equal(decoded.groups[0].label, label.slice(0, 127));

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes groups with utf8 labels', () => {
  // A lousy way to generate a UTF-8 string but it will work
  const label = Buffer.from(randomBytes(128).toString('utf8')).slice(0, 127).toString('utf8');
  const timestamp = Date.now() - mockYears();
  const group = mockGroup({ label });
  const time = mockTime(group);

  const encoded = encode(timestamp, [time], [group]);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [group]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Encodes and decodes many times and groups', () => {
  const timestamp = Date.now() - mockYears();
  const groups = [mockGroup(), mockGroup(), mockGroup()];

  const times = [mockTime(groups[0], { in: timestamp - mockDays() })];
  times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[2], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));

  const encoded = encode(timestamp, times, groups);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, groups);
  assertLength(decoded.times, times.length);

  for (const [i, time] of Object.entries(times)) {
    assert.partialDeepStrictEqual(decoded.times[i], { group: time.group });
    assertSecondsEqual(decoded.times[i].in, time.in);
    assertSecondsEqual(decoded.times[i].out, time.out);
  }
});

test('Orders times and groups', () => {
  const timestamp = Date.now() - mockYears();
  const groups = [mockGroup(), mockGroup()];

  const times = [mockTime(groups[0], { in: timestamp - mockDays() })];
  times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));
  times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));

  const encoded = encode(
    timestamp,
    [times[3], times[0], times[1], times[2]],
    [groups[1], groups[0]]
  );
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, groups);
  assertLength(decoded.times, times.length);

  for (const [i, time] of Object.entries(times)) {
    assert.partialDeepStrictEqual(decoded.times[i], { group: time.group });
    assertSecondsEqual(decoded.times[i].in, time.in);
    assertSecondsEqual(decoded.times[i].out, time.out);
  }
});

test('Encodes and decodes empty arrays of groups and times', () => {
  const timestamp = Date.now() - mockYears();

  const encoded = encode(timestamp, [], []);
  const decoded = decode(encoded);


  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, []);
  assert.deepEqual(decoded.times, []);
});

test('Encodes and decodes groups with no times', () => {
  const timestamp = Date.now() - mockYears();
  const groups = [mockGroup(), mockGroup()];
  const time = mockTime(groups[1]);

  const encoded = encode(timestamp, [time], groups);
  const decoded = decode(encoded);

  assertSecondsEqual(decoded.timestamp, timestamp);
  assert.deepEqual(decoded.groups, [groups[1], groups[0]]);

  assert.partialDeepStrictEqual(decoded.times, [{ group: time.group }]);
  assertSecondsEqual(decoded.times[0].in, time.in);
  assertSecondsEqual(decoded.times[0].out, time.out);
});

test('Throws if encoded string is too short', () => {
  const encoded = Buffer.from('00', 'hex').toString('base64url');
  assert.throws(() => decode(encoded));
});

test('Throws if encoded version is unknown', () => {
  const encoded = Buffer.from('ff00ffffffff', 'hex').toString('base64url');
  assert.throws(() => decode(encoded));
});

test('Throws if initial checkpoint is truncated', () => {
  const encoded = Buffer.from('0000ffff', 'hex').toString('base64url');
  assert.throws(() => decode(encoded));
});

test('Throws if initial checkpoint is missing', () => {
  // Correct version followed immediately by a valid group
  const byteString = '008061cade67be254c08ac11489cb2a9672900ff00';
  const encoded = Buffer.from(byteString, 'hex').toString('base64url');
  assert.throws(() => decode(encoded));
});
