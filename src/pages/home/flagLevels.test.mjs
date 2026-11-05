// Run with: node --test src/pages/home/flagLevels.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagLevels } from './flagLevels.ts';

test('markers with room stay on the bottom level', () => {
  assert.deepEqual(flagLevels([20, 100, 200], 36), [0, 0, 0]);
});

test('only the marker that would collide lifts, and the next one drops back', () => {
  // the desktop bar: $100 and $250 are 32px apart with 36px flags
  assert.deepEqual(flagLevels([142, 174, 226], 36), [0, 1, 0]);
});

test('a marker just inside the gap lifts, and one exactly clear of it stays', () => {
  assert.deepEqual(flagLevels([100, 141], 36), [0, 1]);
  assert.deepEqual(flagLevels([100, 142], 36), [0, 0]);
});

test('a tight cluster stacks as high as it needs', () => {
  assert.deepEqual(flagLevels([100, 110, 120], 36), [0, 1, 2]);
});
