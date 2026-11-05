// Run with: node --test src/pages/home/smoothScroll.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { springStep } from './smoothScroll.ts';

const run = (targetAt, frames, dt = 16.7, lag = 260) => {
  const out = [];
  let y = 0, v = 0;
  for (let i = 0; i < frames; i++) { ({ y, v } = springStep(y, v, targetAt(i), dt, lag)); out.push({ y, v }); }
  return out;
};

test('a wheel notch never kicks: the speed builds up instead of jumping', () => {
  const [first, second] = run(() => 100, 2);
  // a plain ease toward the target would be moving at 0.38 px/ms by the end of frame one
  assert.ok(first.v < 0.1, `first frame speed ${first.v}`);
  assert.ok(second.v > first.v);
});

test('settles on the target without overshooting it', () => {
  const path = run(() => 100, 400);
  assert.ok(path.every((p) => p.y <= 100.001));
  assert.ok(Math.abs(path.at(-1).y - 100) < 0.2);
});

test('a dropped frame stays on the same path', () => {
  const smooth = run(() => 100, 8)[7].y;
  const dropped = run(() => 100, 4, 33.4)[3].y;
  assert.ok(Math.abs(smooth - dropped) < 0.01, `${smooth} vs ${dropped}`);
});

test('stair-stepped input comes out as an even speed', () => {
  // scrollY holding for three frames then leaping, as it does when the main thread is busy
  const speeds = run((i) => Math.floor(i / 3) * 48, 300).slice(200).map((p) => p.v);
  assert.ok(Math.max(...speeds) / Math.min(...speeds) < 1.3, `${Math.min(...speeds)} to ${Math.max(...speeds)}`);
});
