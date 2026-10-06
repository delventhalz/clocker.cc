import assert from 'node:assert/strict';
import test from 'node:test';
import { sortTimes, sortGroups } from '../public/scripts/sorting.js';
import { mockDays, mockGroup, mockTime } from './mocks.js';

test.suite('sorting', () => {
  test.suite('sortTimes', () => {
    test('Sorts times by clock in', () => {
      const group = mockGroup();
      const orderedTimes = [];
      orderedTimes.push(mockTime(group, { in: Date.now() - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));

      const sorted = sortTimes([
        orderedTimes[3],
        orderedTimes[1],
        orderedTimes[0],
        orderedTimes[2]
      ]);

      assert.deepEqual(sorted, [
        orderedTimes[0],
        orderedTimes[1],
        orderedTimes[2],
        orderedTimes[3]
      ]);
    });

    test('Sorts active times with no clock out first', () => {
      const group = mockGroup();
      const orderedTimes = [];
      orderedTimes.push(mockTime(group, { in: Date.now() - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays(), out: null }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays(), out: null }));
      orderedTimes.push(mockTime(group, { in: orderedTimes.at(-1).in - mockDays() }));

      const sorted = sortTimes([
        orderedTimes[3],
        orderedTimes[1],
        orderedTimes[4],
        orderedTimes[5],
        orderedTimes[0],
        orderedTimes[2]
      ]);

      assert.deepEqual(sorted, [
        orderedTimes[2],
        orderedTimes[4],
        orderedTimes[0],
        orderedTimes[1],
        orderedTimes[3],
        orderedTimes[5]
      ]);
    });

    test('Maintains order when timestamps are the same', () => {
      const inTs = Date.now() - mockDays();
      const times = [
        mockTime(mockGroup(), { in: inTs }),
        mockTime(mockGroup(), { in: inTs }),
        mockTime(mockGroup(), { in: inTs })
      ];

      const sorted = sortTimes(times);

      assert.deepEqual(sorted, [
        times[0],
        times[1],
        times[2]
      ]);
    });

    test('Handles an array with a single item', () => {
      const time = mockTime(mockGroup());
      const sorted = sortTimes([time]);

      assert.deepEqual(sorted, [time]);
    });

    test('Handles an empty array', () => {
      const sorted = sortTimes([]);
      assert.deepEqual(sorted, []);
    });
  });

  test.suite('sortGroups', () => {
    test('Sorts groups by their times', () => {
      const groups = [
        mockGroup(),
        mockGroup(),
        mockGroup(),
        mockGroup()
      ];

      const sortedTimes = [
        mockTime(groups[3]),
        mockTime(groups[0]),
        mockTime(groups[2]),
        mockTime(groups[1]),
        mockTime(groups[3]),
        mockTime(groups[2])
      ];

      const sorted = sortGroups(sortedTimes, groups);

      assert.deepEqual(sorted, [
        groups[3],
        groups[0],
        groups[2],
        groups[1]
      ]);
    });

    test('Sorts groups with no times at the end', () => {
      const groups = [
        mockGroup(),
        mockGroup(),
        mockGroup(),
        mockGroup()
      ];

      const sortedTimes = [
        mockTime(groups[2]),
        mockTime(groups[1]),
        mockTime(groups[2])
      ];

      const sorted = sortGroups(sortedTimes, groups);

      assert.deepEqual(sorted, [
        groups[2],
        groups[1],
        groups[0],
        groups[3]
      ]);
    });

    test('Handles an array with a single item', () => {
      const group = mockGroup();
      const sorted = sortGroups([mockTime(group)], [group]);
      assert.deepEqual(sorted, [group]);
    });

    test('Handles an empty array', () => {
      const sorted = sortGroups([], []);
      assert.deepEqual(sorted, []);
    });

  });
});
