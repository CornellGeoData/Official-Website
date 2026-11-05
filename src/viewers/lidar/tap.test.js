import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onTap } from './tap.js';

test('only deliberate taps select; orbit, pinch and cancellation do not', () => {
  const element = new EventTarget();
  let selected = 0;
  onTap(element, () => selected++);
  const send = (type, x = 10, id = 1, primary = true) => {
    const event = Object.assign(new Event(type), { pointerId: id, isPrimary: primary, button: 0, pointerType: 'touch', clientX: x, clientY: 10 });
    element.dispatchEvent(event);
  };
  send('pointerdown'); send('pointerup', 12);
  assert.equal(selected, 1);
  send('pointerdown'); send('pointermove', 40); send('pointerup');
  assert.equal(selected, 1, 'orbit returning to its start');
  send('pointerdown'); send('pointerdown', 80, 2, false);
  send('pointermove', 60); send('pointerup', 80, 2, false); send('pointerup', 60);
  assert.equal(selected, 1, 'stationary finger lifted after pinch');
  send('pointerdown'); send('pointercancel'); send('pointerup');
  assert.equal(selected, 1, 'cancelled touch');
  send('pointerdown'); send('pointerup');
  assert.equal(selected, 2, 'next gesture remains usable');
});
