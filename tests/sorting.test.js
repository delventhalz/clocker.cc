import assert from 'node:assert/strict';
import test from 'node:test';
import { sortTimes, sortGroups } from '../public/scripts/sorting.js';
import { mockDays, mockGroup, mockTime, mockOrderedState } from './mocks.js';

test.suite('sorting', () => {
  test.suite('sortTimes', () => {
    test('Sorts times by clock in', () => {
      const { times } = mockOrderedState({
        times: [{}, {}, {}, {}]
      });

      const sorted = sortTimes([
        times[3],
        times[1],
        times[0],
        times[2]
      ]);

      assert.deepEqual(sorted, times);
    });

    test('Sorts active times with no clock out first', () => {
      const { times } = mockOrderedState({
        times: [{}, {}, { out: null }, {}, { out: null }, {}]
      });

      const sorted = sortTimes([
        times[3],
        times[1],
        times[4],
        times[5],
        times[0],
        times[2]
      ]);

      assert.deepEqual(sorted, times);
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
    test('Sorts groups by their touched time', () => {
      const { groups } = mockOrderedState({
        groups: [{}, {}, {}, {}]
      });

      const sorted = sortGroups([
        groups[3],
        groups[0],
        groups[2],
        groups[1]
      ]);

      assert.deepEqual(sorted, groups);
    });

    test('Handles an array with a single item', () => {
      const group = mockGroup();
      const sorted = sortGroups([group]);
      assert.deepEqual(sorted, [group]);
    });

    test('Handles an empty array', () => {
      const sorted = sortGroups([]);
      assert.deepEqual(sorted, []);
    });

  });
});
