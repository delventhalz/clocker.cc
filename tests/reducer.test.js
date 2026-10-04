import assert from 'node:assert/strict';
import test from 'node:test';
import { clockerReducer } from '../public/scripts/reducer.js';
import { mockDays, mockGroup, mockTime } from './mocks.js';

test('reducer', () => {
  test('Loads state', () => {
    const groups = [
      mockGroup(),
      mockGroup()
    ];
    const times = [
      mockTime(groups[0]),
      mockTime(groups[0]),
      mockTime(groups[1])
    ];

    const state = clockerReducer({ groups: [], times: [] }, {
      type: 'LOAD_STATE',
      payload: {
        groups,
        times
      }
    });

    assert.deepEqual(state, {
      groups,
      times
    });
  });

  test('Clocks in', () => {
    const group = mockGroup();
    const initialTime = mockTime(group);
    const initialState = { groups: [group], times: [initialTime] };
    const inTs = Date.now();

    const state = clockerReducer(initialState, {
      type: 'CLOCK_IN',
      payload: {
        group: group.id,
        in: inTs
      }
    });

    assert.deepEqual(state, {
      groups: [group],
      times: [{ group: group.id, in: inTs }, initialTime]
    });
  });

  test('Clocks out', () => {
    const group = mockGroup();
    const initialTime = mockTime(group, { out: null });

    const initialState = { groups: [group], times: [initialTime] };
    const outTs = Date.now();

    const state = clockerReducer(initialState, {
      type: 'CLOCK_OUT',
      payload: {
        index: 0,
        out: outTs
      }
    });

    assert.deepEqual(state, {
      groups: [group],
      times: [
        { ...initialTime, out: outTs },
      ]
    });
  });

  test('Adds a group', () => {
    const initialGroup = mockGroup();
    const initialState = { groups: [initialGroup], times: [] };
    const newGroup = mockGroup();

    const state = clockerReducer(initialState, {
      type: 'ADD_GROUP',
      payload: newGroup
    });

    assert.deepEqual(state, {
      groups: [newGroup, initialGroup],
      times: []
    });
  });
});
