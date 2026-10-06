import { sortTimes, sortGroups } from './sorting.js';

export function clockerReducer(state, action) {
  switch (action.type) {
  case 'LOAD_STATE':
    return {
      ...state,
      times: sortTimes(action.payload.times),
      groups: sortGroups(action.payload.groups)
    };

  case 'CLOCK_IN':
    return {
      ...state,
      times: sortTimes([makeTime(action.payload), ...state.times]),
      groups: touchGroup(state.groups, action.payload.group, action.payload.in)
    };

  case 'CLOCK_OUT':
    return clockOutTime(state, action.payload.index, action.payload.out);

  case 'ADD_GROUP':
    return {
      ...state,
      groups: sortGroups([makeGroup(action.payload), ...state.groups])
    };
  }
}

function makeTime(time) {
  return {
    group: time.group,
    in: roundToSecond(time.in)
  };
}

function makeGroup(group) {
  return {
    id: group.id,
    touched: roundToSecond(group.touched),
    color: group.color,
    label: group.label
  };
}

function clockOutTime(state, timeIndex, out) {
  const time = state.times[timeIndex];
  if (!time || time.out !== undefined) {
    return state;
  }

  return {
    times: sortTimes([
      { ...time, out: roundToSecond(out) },
      ...state.times.slice(0, timeIndex),
      ...state.times.slice(timeIndex + 1)
    ]),
    groups: touchGroup(state.groups, time.group, out)
  };
}

function touchGroup(groups, groupId, touched) {
  const groupIndex = groups.findIndex(grp => grp.id === groupId);

  if (groupIndex === -1) {
    return groups;
  }

  return sortGroups([
    { ...groups[groupIndex], touched: roundToSecond(touched) },
    ...groups.slice(0, groupIndex),
    ...groups.slice(groupIndex + 1),
  ]);
}

function roundToSecond(ms) {
  return Math.round(Math.floor(ms / 1000) * 1000);
}
