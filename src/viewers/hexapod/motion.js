// Pure kinematic display motion. No learned policy, dynamics, or contact model.
const TRIPOD_A = new Set(['lf', 'lr', 'rm']);

export function animationPose({mode, phase, basePose, stancePose, legs, kinds, limits, leg, joint, transition = 1}) {
  const blend = (1 - Math.cos(phase)) / 2;
  const result = {...basePose};
  if (mode === 'gait') {
    // ponytail: joint-space walk in place; use foot-path IK for planted feet.
    const fade = (1 - Math.cos(Math.PI * transition)) / 2;
    for (const selectedLeg of legs) {
      const localPhase = phase + (TRIPOD_A.has(selectedLeg) ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(localPhase)) ** 2;
      const yawSign = selectedLeg.startsWith('l') ? 1 : -1;
      const offsets = { coxa_yaw: yawSign * 0.22 * Math.cos(localPhase), femur_pitch: 0.35 * lift, tibia_pitch: -0.25 * lift };
      for (const kind of kinds) {
        const name = `${selectedLeg}_${kind}`;
        result[name] = basePose[name] + fade * (stancePose[name] + offsets[kind] - basePose[name]);
      }
    }
  } else {
    const kind = joint;
    if (!kinds.includes(kind)) throw new Error(`Unknown inspection joint ${kind}`);
    if (!legs.includes(leg)) throw new Error(`Unknown inspection leg ${leg}`);
    const {lower, upper} = limits[`${leg}_${kind}`];
    result[`${leg}_${kind}`] = lower + (upper - lower) * blend;
  }
  for (const name of Object.keys(result)) {
    const {lower, upper} = limits[name];
    result[name] = Math.min(upper, Math.max(lower, result[name]));
  }
  return result;
}

export function phaseForJoint(value, lower, upper) {
  return Math.acos(Math.min(1, Math.max(-1, 1 - 2 * (value - lower) / (upper - lower))));
}
