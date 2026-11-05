import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PARTS, describePart } from './parts.js';

test('every shipped mesh has a descriptive component label', () => {
  const files = readdirSync(new URL('../../../public/hexapod/model/hexapod_mkii_updated_v1/meshes/', import.meta.url)).filter(file => file.endsWith('.stl'));
  assert.deepEqual(Object.keys(PARTS).sort(), files.map(file => file.slice(0, 8)).sort());
  for (const file of files) {
    const part = describePart(file);
    assert.ok(part.name && part.detail, file);
    assert.doesNotMatch(part.name, /revolve|cirpattern|cut.extrude|\.stl|·/i, file);
  }
  const part = number => describePart(files.find(file => file.startsWith(`mesh_${number}_`)));
  assert.equal(part('004').name, 'Motor');
  assert.ok(part('004').motor);
  assert.equal(part('008').name, 'Motor countersunk screw');
  assert.ok(!part('056').motor);
});
