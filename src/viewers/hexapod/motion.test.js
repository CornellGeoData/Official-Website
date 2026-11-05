import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { animationPose } from './motion.js';

test('tripod walk alternates legs, stays in the CAD limits, and blends without a jump', () => {
  const model = new URL('../../../public/hexapod/model/', import.meta.url);
  const active = JSON.parse(readFileSync(new URL('active_model.json', model)));
  const stance = JSON.parse(readFileSync(new URL(`${active.id}/stance.json`, model)));
  const urdf = readFileSync(new URL(active.urdf.path.replace(/^robot\//, ''), model), 'utf8');
  const limits = Object.fromEntries([...urdf.matchAll(/<joint name="([^"]+)"[\s\S]*?<limit lower="([^"]+)" upper="([^"]+)"/g)].map(([, name, lower, upper]) => [name, { lower: Number(lower), upper: Number(upper) }]));
  const legs = ['lf', 'lm', 'lr', 'rf', 'rm', 'rr'];
  const kinds = ['coxa_yaw', 'femur_pitch', 'tibia_pitch'];
  const stancePose = Object.fromEntries(stance.joint_names.map((name, index) => [name, stance.nominal_joint_position_rad[index]]));
  assert.equal(Object.keys(limits).length, 18);
  const options = { mode: 'gait', basePose: stancePose, stancePose, legs, kinds, limits };
  const pose = phase => animationPose({ ...options, phase });
  for (let step = 0; step <= 64; step++) {
    const values = pose(step * Math.PI / 32);
    assert.equal(Object.keys(values).length, 18);
    for (const leg of legs) for (const kind of kinds) {
      const name = `${leg}_${kind}`;
      assert.ok(values[name] >= limits[name].lower && values[name] <= limits[name].upper);
    }
  }
  const first = pose(Math.PI / 2), second = pose(3 * Math.PI / 2);
  for (const leg of legs) {
    const name = `${leg}_femur_pitch`, groupA = ['lf', 'lr', 'rm'].includes(leg);
    assert.equal(first[name] > stancePose[name] + 0.1, groupA);
    assert.equal(second[name] > stancePose[name] + 0.1, !groupA);
  }
  for (const name of Object.keys(stancePose)) assert.ok(Math.abs(pose(0)[name] - pose(2 * Math.PI)[name]) < 1e-12);
  const manualPose = { ...stancePose, lf_coxa_yaw: 0.4, rf_femur_pitch: 0.1 };
  assert.deepEqual(animationPose({ ...options, basePose: manualPose, phase: 1, transition: 0 }), manualPose);
  const swept = animationPose({ ...options, mode: 'joint', joint: 'coxa_yaw', leg: 'lf', phase: Math.PI });
  assert.equal(swept.lf_coxa_yaw, limits.lf_coxa_yaw.upper);
  for (const name of Object.keys(stancePose).filter(name => name !== 'lf_coxa_yaw')) assert.equal(swept[name], stancePose[name]);
});
