import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const HEADER = read('site/js/header.js');
const SHELL_CSS = read('site/css/shell.css');

function accessibilityOffences(source) {
  const required = [
    ['popup type', "setAttribute('aria-haspopup', 'dialog')"],
    ['expanded state', "setAttribute('aria-expanded'"],
    ['popup relation', "setAttribute('aria-controls'"],
    ['dialog role', "setAttribute('role', 'dialog')"],
    ['Escape close', "event.key === 'Escape'"],
    ['focus return', 'trigger.focus()'],
    ['calendar inputs', "input.type = 'date'"],
    ['inline error', "setAttribute('role', 'alert')"],
  ];
  return required.filter(([, token]) => !source.includes(token)).map(([name]) => name);
}

test('AC-7 controls SHOULD expose popup state, keyboard close, focus return and date semantics', () => {
  assert.deepEqual(accessibilityOffences(HEADER), []);
});

test('AC-7 positive control: an inert button MUST fail every controls accessibility guard', () => {
  assert.deepEqual(accessibilityOffences("const trigger = element('button');"), [
    'popup type',
    'expanded state',
    'popup relation',
    'dialog role',
    'Escape close',
    'focus return',
    'calendar inputs',
    'inline error',
  ]);
});

test('AC-8 popovers SHOULD stay anchored to their filter item without changing the rail width', () => {
  assert.match(SHELL_CSS, /\.filters__item\s*\{[^}]*position:\s*relative/s);
  assert.match(SHELL_CSS, /\.control-popover\s*\{[^}]*position:\s*absolute/s);
  assert.doesNotMatch(SHELL_CSS, /--content-max\s*:/);
});

test('AC-8 interactive controls SHOULD expose visible hover states', () => {
  assert.match(SHELL_CSS, /\.filters__control:hover/);
  assert.match(SHELL_CSS, /\.control-popover__preset:hover/);
  assert.match(SHELL_CSS, /\.control-popover__option:hover/);
});

test('AC-7 a closed popover MUST override its authored flex display', () => {
  assert.match(SHELL_CSS, /\.control-popover\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test('AC-8 decorative dividers MUST remain empty and hidden from the accessibility tree (V-04)', () => {
  assert.match(HEADER, /divider\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(HEADER, /return divider;/);
  assert.doesNotMatch(HEADER, /divider\.(append|textContent)/);
});
