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
 * Sort groups starting from most recently updated or clocked in/out
 */
export function sortGroups(groups) {
  return groups.toSorted((a, b) => b.touched - a.touched);
}
