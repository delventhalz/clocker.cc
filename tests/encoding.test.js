import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { encode, decode } from '../public/scripts/encoding.js';
import {
  mockAscii,
  mockDays,
  mockYears,
  mockTimestamp,
  mockGroup,
  mockTime
} from './mocks.js';

test.suite('encoding', () => {
  test('Encodes into a url-safe base64 string', () => {
    const group = mockGroup();
    const time = mockTime(group);

    const encoded = encode(Date.now(), [time], [group]);
    assert.match(encoded, /^[0-9A-Za-z_-]*$/);
  });

  test('Decodes basic encoded data', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup();
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Rounds overly precise timestamps to the second', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup();
    const time = mockTime(group);

    const encoded = encode(
      timestamp + randomInt(1, 999),
      [
        {
          ...time,
          in: time.in + randomInt(1, 999),
          out: time.out + randomInt(1, 999)
        }
      ],
      [
        {
          ...group,
          touched: group.touched + randomInt(1, 999)
        }
      ]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes times with no clock out', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup();
    const time = mockTime(group, { out: null });

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes short timestamp differences', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup({ touched: timestamp - 1000 });
    const time = mockTime(group, { in: timestamp - 3000, out: timestamp - 2000 });

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes long timestamp differences', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup({ touched: timestamp - (2 ** 24 - 1) * 1000 });
    const inTs = group.touched - (2 ** 24 - 1) * 1000;
    const time = mockTime(group, { in: inTs, out: inTs + (2 ** 40 - 1) * 1000 });

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes too long timestamp differences', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup({ touched: timestamp - (2 ** 28 - 1) * 1000 });
    const time = mockTime(group, { in: group.touched - (2 ** 28 - 1) * 1000 });

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes a far future timestamp', () => {
    const timestamp = Number.MAX_SAFE_INTEGER * 1000;
    const group = mockGroup();
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes far past timestamps', () => {
    const timestamp = -Number.MAX_SAFE_INTEGER * 1000 + mockYears();
    const group = mockGroup();
    const time = mockTime(group, { in: -Number.MAX_SAFE_INTEGER * 1000 });

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes groups with no label', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup({ label: '' });
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes groups with a long label', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup({ label: mockAscii(255, 255) });
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Truncates a too long label', () => {
    const label = mockAscii(1024, 256);
    const timestamp = mockTimestamp();
    const group = mockGroup({ label });
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);

    assert.partialDeepStrictEqual(decoded.groups, [
      {
        id: group.id,
        color: group.color
      }
    ]);
    assert.equal(decoded.groups[0].label, label.slice(0, 255));
  });

  test('Encodes and decodes groups with utf8 labels', () => {
    // A lousy way to generate a UTF-8 string but it will work
    const label = Buffer.from(randomBytes(255).toString('utf8')).slice(0, 255).toString('utf8');
    const timestamp = mockTimestamp();
    const group = mockGroup({ label });
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Encodes and decodes many times and groups', () => {
    const timestamp = mockTimestamp();
    const groups = [];
    const times = [];

    groups.push(mockGroup({ touched: timestamp - mockDays() }));
    times.push(mockTime(groups[0]));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));

    groups.push(mockGroup({ touched: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[1]));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));

    groups.push(mockGroup({ touched: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[2]));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));

    const encoded = encode(timestamp, times, groups);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, times);
    assert.deepEqual(decoded.groups, groups);
  });

  test('Sorts times and groups', () => {
    const timestamp = mockTimestamp();
    const times = [];
    const groups = [];

    groups.push(mockGroup({ touched: timestamp - mockDays() }));
    times.push(mockTime(groups[0]));
    groups.push(mockGroup({ touched: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[1]));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
    times.unshift(mockTime(groups[0], { in: times.at(-1).in - mockDays(), out: null }));

    const encoded = encode(
      timestamp,
      [times[3], times[0], times[1], times[2]],
      [groups[1], groups[0]]
    );
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, times);
    assert.deepEqual(decoded.groups, groups);
  });

  test('Encodes and decodes empty arrays of groups and times', () => {
    const timestamp = mockTimestamp();

    const encoded = encode(timestamp, [], []);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.groups, []);
    assert.deepEqual(decoded.times, []);
  });

  test('Encodes and decodes groups with no times', () => {
    const timestamp = mockTimestamp();
    const groups = [];
    groups.push(mockGroup({ touched: timestamp - mockYears() }));
    groups.push(mockGroup({ touched: groups.at(-1).touched - mockDays() }));
    groups.push(mockGroup({ touched: groups.at(-1).touched - mockDays() }));
    const time = mockTime(groups[1]);

    const encoded = encode(timestamp, [time], groups);
    const decoded = decode(encoded);

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, [time]);
    assert.deepEqual(decoded.groups, groups);
  });

  test('Drops partial times', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup();
    const time = mockTime(group);

    const encoded = encode(timestamp, [time], [group]);
    const decoded = decode(encoded.slice(0, -3));

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, []);
    assert.deepEqual(decoded.groups, [group]);
  });

  test('Drops partial groups', () => {
    const timestamp = mockTimestamp();
    const group = mockGroup();

    const encoded = encode(timestamp, [], [group]);
    const decoded = decode(encoded.slice(0, -3));

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.groups, []);
    assert.deepEqual(decoded.times, []);
  });

  test('Retains newest data when decoding truncated strings', () => {
    const timestamp = mockTimestamp();
    const times = [];
    const groups = [];

    groups.push(mockGroup({ touched: timestamp - mockDays(), label: 'fixed size' }));
    times.push(mockTime(groups[0], { in: groups[0].touched }));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[0], { in: times.at(-1).in - mockDays() }));

    groups.push(mockGroup({ touched: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[1], { in: groups[1].touched - mockDays() }));
    times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));
    times.push(mockTime(groups[1], { in: times.at(-1).in - mockDays() }));

    const encoded = encode(timestamp, times, groups);

    // Truncate part-way through second group and leave a single orphan character
    const decoded = decode(encoded.slice(0, 81));

    assert.equal(decoded.timestamp, timestamp);
    assert.deepEqual(decoded.times, times.slice(0, 3));
    assert.deepEqual(decoded.groups, [groups[0]]);
  });

  test('Throws if encoded string is too short', () => {
    const encoded = Buffer.from('00', 'hex').toString('base64url');
    assert.throws(() => decode(encoded));
  });

  test('Throws if encoded version is unknown', () => {
    const encoded = Buffer.from('ff' + '00ffffffff', 'hex').toString('base64url');
    assert.throws(() => decode(encoded));
  });

  test('Throws if initial checkpoint is truncated', () => {
    const encoded = Buffer.from('00' + '00ffff', 'hex').toString('base64url');
    assert.throws(() => decode(encoded));
  });

  test('Throws if initial checkpoint is missing', () => {
    // Correct version followed immediately by a valid group
    const byteString = '00' + '8061cade67be254c08ac11489cb2a9672900ff00';
    const encoded = Buffer.from(byteString, 'hex').toString('base64url');
    assert.throws(() => decode(encoded));
  });

  test('Throws if passed an unrecognized header type', () => {
    // Valid version and checkpoint followed by a header type 3
    const byteString = '00' + '00ffffffff' + 'c0ffffffff';
    const encoded = Buffer.from(byteString, 'hex').toString('base64url');
    assert.throws(() => decode(encoded));
  });
});
