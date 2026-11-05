// Run with: node --test src/pages/visualizations/wholeRows.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wholeRowsHeight } from './wholeRows.ts';

test('stops at two rows even when more would fit', () => {
  assert.equal(wholeRowsHeight([250, 250, 518, 518, 786, 786], 100, 2000), 618);
});

test('drops to one row rather than cutting the second', () => {
  assert.equal(wholeRowsHeight([250, 250, 518, 518], 100, 500), 350);
});

test('a card with a single chart hugs it', () => {
  assert.equal(wholeRowsHeight([250], 100, 800), 350);
});

test('a row that fits exactly still counts', () => {
  assert.equal(wholeRowsHeight([250, 518], 100, 618), 618);
});

test('rounds up, so a fraction of a pixel never clips a chart', () => {
  assert.equal(wholeRowsHeight([250.2], 100, 800), 351);
});

test('leaves the height alone with no charts, or when not even one row fits', () => {
  assert.equal(wholeRowsHeight([], 100, 800), null);
  assert.equal(wholeRowsHeight([250, 518], 100, 300), null);
});
