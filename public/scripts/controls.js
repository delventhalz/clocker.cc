import { h } from 'preact';
import { useClockerContext } from './context.js';

export function Controls() {
  const {
    getActiveGroup,
    getActiveTimes,
    addGroup,
    clockIn,
    clockOut
  } = useClockerContext();

  const isClockedIn = getActiveTimes().length > 0;

  const onClockIn = () => {
    clockIn(getActiveGroup().id);
  };

  const onClockOut = () => {
    clockOut(0);
  };

  return h('div', null,
    h('button', { disabled: isClockedIn, onClick: onClockIn }, 'Clock in'),
    h('button', { disabled: !isClockedIn, onClick: onClockOut }, 'Clock out')
  );
}
