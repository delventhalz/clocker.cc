/**
 * Sort times from newest to oldest, with active times before clocked out times
 */
export function sortTimes(times) {
  return times.toSorted((a, b) => {
    if (a.out === undefined && b.out !== undefined) {
      return -1;
    }
    if (a.out !== undefined && b.out === undefined) {
      return 1;
    }
    return b.in - a.in;
  });
}

/**
 * Sort groups from first associated time to last
 */
export function sortGroups(sortedTimes, groups) {
  return groups.toSorted((a, b) => {
    const aIndex = sortedTimes.findIndex(time => time.group === a.id);
    const bIndex = sortedTimes.findIndex(time => time.group === b.id);
    return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
  });
}
