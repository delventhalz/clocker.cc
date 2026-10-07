import { h } from 'preact';
import { ClockerProvider } from './context.js';
import { Controls } from './controls.js';
import { Times } from './times.js';

export function Clocker() {
  return h(ClockerProvider, null,
    h(Controls),
    h(Times)
  );
}
