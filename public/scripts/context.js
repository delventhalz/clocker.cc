import { h, createContext } from 'preact';
import { useCallback, useContext, useEffect, useReducer } from 'preact/hooks';
import { encode, decode } from './encoding.js';
import { clockerReducer } from './reducer.js';

const ClockerContext = createContext(null);
const initialState = { times: [], groups: [] };

export function useClockerContext() {
  return useContext(ClockerContext);
}

export function ClockerProvider({ children }) {
  const [state, dispatch] = useReducer(clockerReducer, initialState);

  useEffect(() => {
    const urlEncoded = new URLSearchParams(document.location.search).get('t');
    const urlDecoded = urlEncoded ? tryDecode(urlEncoded) : null;
    const storageEncoded = urlDecoded ? null : window.localStorage.getItem('t');
    const storageDecoded = storageEncoded ? tryDecode(storageEncoded) : null;
    const decoded = urlDecoded ?? storageDecoded;

    if (decoded) {
      loadState(dispatch, decoded.times, decoded.groups);
    } else {
      // Add a dummy group for now if this is fresh state
      addGroup(dispatch, 'Test Group');
    }
  }, []);

  useEffect(() => {
    const encoded = encode(nowSeconds(), state.times, state.groups);
    window.history.replaceState(null, null, `?t=${encoded}`);
    window.localStorage.setItem('t', encoded);
  }, [state]);

  return h(ClockerContext.Provider, {
    value: {
      state,
      dispatch,
      groups: state.groups,
      times: state.times,
      getActiveGroup: useCallback(() => getActiveGroup(state), [state]),
      getActiveTimes: useCallback(() => getActiveTimes(state), [state]),
      clockIn: useCallback(groupId => clockIn(dispatch, groupId), [dispatch]),
      clockOut: useCallback(index => clockOut(dispatch, index), [dispatch]),
      addGroup: useCallback(label => addGroup(dispatch, label), [dispatch])
    }
  }, children);
}

function tryDecode(encoded) {
  try {
    return decode(encoded);
  } catch (err) {
    console.warn(err);
    return null;
  }
}

function getActiveGroup(state) {
  return state.groups[0];
}

function getActiveTimes(state) {
  return state.times.filter(time => time.out === undefined);
}

function loadState(dispatch, times, groups) {
  dispatch({
    type: 'LOAD_STATE',
    payload: {
      times,
      groups
    }
  });
}

function clockIn(dispatch, groupId) {
  dispatch({
    type: 'CLOCK_IN',
    payload: {
      group: groupId,
      in: nowSeconds()
    }
  });
}

function clockOut(dispatch, index) {
  dispatch({
    type: 'CLOCK_OUT',
    payload: {
      index,
      out: nowSeconds()
    }
  });
}

function addGroup(dispatch, label) {
  dispatch({
    type: 'ADD_GROUP',
    payload: {
      id: self.crypto.randomUUID(),
      touched: nowSeconds(),
      color: '#ff6a00',
      label
    }
  });
}

function nowSeconds() {
  return Math.round(Math.floor(Date.now() / 1000) * 1000);
}
