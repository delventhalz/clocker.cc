import { sortTimes, sortGroups } from './sorting.js';

export function clockerReducer(state, action) {
  switch (action.type) {
  case 'LOAD_STATE':
    return {
      ...state,
      times: action.payload.times,
      groups: action.payload.groups
    };

  case 'CLOCK_IN':
    return {
      ...state,
      times: [makeTime(action.payload), ...state.times]
    };

  case 'CLOCK_OUT':
    return {
      ...state,
      times: clockOutTimeAtIndex(state.times, action.payload)
    };

  case 'ADD_GROUP':
    return {
      ...state,
      groups: [action.payload, ...state.groups]
    };
  }
}

function makeTime(time) {
  return { group: time.group, in: time.in };
}

function clockOutTimeAtIndex(times, { index, out }) {
  return [
    ...times.slice(0, index),
    { ...times[index], out },
    ...times.slice(index + 1)
  ];
}
