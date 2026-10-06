import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import test from 'node:test';
import { clockerReducer } from '../public/scripts/reducer.js';
import {
  mockDays,
  mockHours,
  mockGroup,
  mockTime,
  mockOrderedState
} from './mocks.js';

test.suite('reducer', () => {
  test('Loads state', () => {
    const { times, groups } = mockOrderedState();

    const state = clockerReducer({ times: [], groups: [] }, {
      type: 'LOAD_STATE',
      payload: {
        times,
        groups
      }
    });

    assert.deepEqual(state, {
      times,
      groups
    });
  });

  test('Sorts disordered state on load', () => {
    const { times, groups } = mockOrderedState();

    const state = clockerReducer({ times: [], groups: [] }, {
      type: 'LOAD_STATE',
      payload: {
        times: [times[2], times[4], times[0], times[1], times[3]],
        groups: [groups[1], groups[0], groups[2]]
      }
    });

    assert.deepEqual(state, {
      times,
      groups
    });
  });

  test('Clocks in and touches group', () => {
    const group = mockGroup();
    const inTs = group.touched + mockDays();

    const state = clockerReducer({ times: [], groups: [group] }, {
      type: 'CLOCK_IN',
      payload: {
        group: group.id,
        in: inTs
      }
    });

    assert.deepEqual(state, {
      times: [{ group: group.id, in: inTs }],
      groups: [{ ...group, touched: inTs }]
    });
  });

  test('Rounds to the second when clocking in', () => {
    const group = mockGroup();
    const inTs = group.touched + mockDays();

    const state = clockerReducer({ times: [], groups: [group] }, {
      type: 'CLOCK_IN',
      payload: {
        group: group.id,
        in: inTs + randomInt(1, 999)
      }
    });

    assert.deepEqual(state, {
      times: [{ group: group.id, in: inTs }],
      groups: [{ ...group, touched: inTs }]
    });
  });

  test('Sorts times and groups when clocking in', () => {
    const { times, groups } = mockOrderedState();
    const inTs = groups[0].touched + mockDays();

    const state = clockerReducer({ times, groups }, {
      type: 'CLOCK_IN',
      payload: {
        group: groups[1].id,
        in: inTs
      }
    });

    assert.deepEqual(state, {
      times: [{ group: groups[1].id, in: inTs }, ...times],
      groups: [{ ...groups[1], touched: inTs }, groups[0], ...groups.slice(2)]
    });
  });

  test('Clocks out and touches group', () => {
    const group = mockGroup();
    const time = mockTime(group, { out: null });
    const outTs = time.in + mockHours();

    const state = clockerReducer({ times: [time], groups: [group] }, {
      type: 'CLOCK_OUT',
      payload: {
        index: 0,
        out: outTs
      }
    });

    assert.deepEqual(state, {
      times: [{ ...time, out: outTs }],
      groups: [{ ...group, touched: outTs }]
    });
  });

  test('Rounds to the second when clocking out', () => {
    const group = mockGroup();
    const time = mockTime(group, { out: null });
    const outTs = time.in + mockHours();

    const state = clockerReducer({ times: [time], groups: [group] }, {
      type: 'CLOCK_OUT',
      payload: {
        index: 0,
        out: outTs + randomInt(1, 999)
      }
    });

    assert.deepEqual(state, {
      times: [{ ...time, out: outTs }],
      groups: [{ ...group, touched: outTs }]
    });
  });

  test('Sorts times and groups when clocking out', () => {
    const { times, groups } = mockOrderedState();
    const outTs = times[0].in + mockHours();
    times.unshift(mockTime(groups[1], { in: times[2].in + 1000, out: null }));

    const state = clockerReducer({ times, groups }, {
      type: 'CLOCK_OUT',
      payload: {
        index: 0,
        out: outTs
      }
    });

    assert.deepEqual(state, {
      times: [times[1], times[2], { ...times[0], out: outTs }, ...times.slice(3)],
      groups: [{ ...groups[1], touched: outTs }, groups[0], ...groups.slice(2)]
    });
  });

  test('Clocks out one of many times', () => {
    const { times, groups } = mockOrderedState({
      times: [{ out: null }, { out: null }, { out: null }],
      groups: [{}, {}, {}]
    });
    const outTs = times[0].in + mockDays();

    const state = clockerReducer({ times, groups }, {
      type: 'CLOCK_OUT',
      payload: {
        index: 2,
        out: outTs
      }
    });

    assert.deepEqual(state, {
      times: [times[0], times[1], { ...times[2], out: outTs }],
      groups: [{ ...groups[2], touched: outTs }, groups[0], groups[1]]
    });
  });

  test('Adds a group', () => {
    const { times, groups } = mockOrderedState({
      groups: [{}, {}]
    });

    const state = clockerReducer({ times, groups: [groups[1]] }, {
      type: 'ADD_GROUP',
      payload: groups[0]
    });

    assert.deepEqual(state, {
      times,
      groups
    });
  });

  test('Sorts groups on add', () => {
    const { times, groups } = mockOrderedState({
      groups: [{}, {}, {}]
    });

    const state = clockerReducer({ times, groups: [groups[0], groups[2]] }, {
      type: 'ADD_GROUP',
      payload: groups[1]
    });

    assert.deepEqual(state, {
      times,
      groups
    });
  });
});
