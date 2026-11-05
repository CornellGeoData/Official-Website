// Labels follow the pinned assembly report and the individual STL geometry. Keys are
// the source's mesh numbers, the start of each file name; the URDF hash pins them.
// Keep vendor references where the export does not provide a descriptive name.
export const PARTS = {
  mesh_000: ['Motor output hub', 'RS05 output-side hub; CAD ref. 0001755650.'],
  mesh_001: ['Motor gearbox pin', '4 mm diameter, 14 mm long; CAD ref. 0001755652.'],
  mesh_002: ['Motor gearbox pin', '4 mm diameter, 14 mm long; CAD ref. GR-2202.'],
  mesh_003: ['Motor housing ring', '46 mm housing ring; CAD ref. EB461-502.'],
  mesh_004: ['Motor', 'RS05 actuator casing; CAD ref. EB463-507.'],
  mesh_005: ['Motor end cover', 'Rear enclosure cover; CAD ref. EB463-509.'],
  mesh_006: ['Motor retaining plate', '2.5 mm end plate; CAD ref. EB463-510.'],
  mesh_007: ['Motor miniature bearing', '11 mm outer diameter, 4 mm wide; CAD ref. 610001.'],
  mesh_008: ['Motor countersunk screw', '4 mm long; CAD ref. 000438.'],
  mesh_009: ['Motor countersunk screw', '6 mm long; CAD ref. 000555.'],
  mesh_010: ['Motor countersunk screw', '10 mm long; CAD ref. 000608.'],
  mesh_011: ['Motor headed fastener', '4 mm head diameter; CAD ref. 020051.'],
  mesh_012: ['Motor fastening pin', '2 mm diameter, 4 mm long; CAD ref. 020051-2.'],
  mesh_013: ['Motor internal plate', 'Shaped internal component; CAD ref. 001425.'],
  mesh_014: ['Motor output bearing', '6706 bearing, 37 mm outer diameter and 4 mm wide.'],
  mesh_015: ['Bearing support insert', '31 mm insert supporting the pivot bearing.'],
  mesh_016: ['Lower chassis enclosure', 'Lower shell around the body.'],
  mesh_017: ['Chassis base plate', '1.6 mm plate inside the enclosure.'],
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`mesh_${String(18 + i).padStart(3, '0')}`, ['Bearing ball', '3.15 mm rolling element inside the pivot bearing.']])),
  mesh_030: ['Bearing shield retaining ring', 'Retains the bearing shield.'],
  mesh_031: ['Femur bracket', 'Upper-leg structure running from the femur motor toward the knee.'],
  mesh_032: ['Coxa lower bracket', 'Lower plate and side support of the hip assembly.'],
  mesh_033: ['Coxa spacer', 'Separates the hip assembly plates.'],
  mesh_034: ['Coxa upper plate', 'Upper plate of the hip assembly.'],
  mesh_035: ['M3 × 10 mm countersunk screw', '0.5 mm thread pitch, hex drive.'],
  mesh_036: ['M3 × 8 mm countersunk screw', 'Hex drive, alloy steel.'],
  mesh_037: ['M3 shoulder screw', '45 mm shoulder and 4 mm threaded length, 18-8 stainless steel.'],
  mesh_038: ['M3 × 5 mm low-profile screw', 'Socket head, high-strength steel.'],
  mesh_039: ['M3 × 6 mm low-profile screw', 'Socket head, 18-8 stainless steel.'],
  mesh_040: ['M3 × 8 mm low-profile screw', 'Socket head, 18-8 stainless steel.'],
  mesh_041: ['M4 × 12 mm countersunk screw', 'Hex drive, alloy steel.'],
  mesh_042: ['M4 × 8 mm low-profile screw', 'Socket head, 18-8 stainless steel.'],
  mesh_043: ['M4 × 8 mm through-hole standoff', 'Hardened steel spacer.'],
  mesh_044: ['Opposite bearing retaining ring', 'Retains the shield on the opposite side.'],
  mesh_045: ['Motor bearing holder', 'Supports the bearing at the actuator mount.'],
  mesh_046: ['Motor mounting flange', 'Connects the actuator output to the supporting structure.'],
  mesh_047: ['M3 × 6 mm clinching standoff', 'PEM BSOS-M3-6 spacer.'],
  mesh_048: ['M4 self-clinching nut', 'PEM nut, 300-series stainless steel.'],
  mesh_049: ['Pivot bearing outer race', '26 mm outer diameter, 5 mm wide.'],
  mesh_050: ['Pivot bearing inner race', 'Inner ring of the leg-pivot bearing.'],
  mesh_051: ['Bearing ball', '3.15 mm rolling element inside the pivot bearing.'],
  mesh_052: ['Pivot bearing shield', 'Cover on one side of the bearing.'],
  mesh_053: ['Pivot bearing opposite shield', 'Cover on the opposite side of the bearing.'],
  mesh_054: ['Chassis side support', '130 mm support between the enclosure plates.'],
  mesh_055: ['Chassis end support', '90 mm support between the enclosure plates.'],
  mesh_056: ['Tibia lower-leg frame', 'Main lower-leg structure, about 154 mm long, ending in the rounded toe.'],
  mesh_057: ['Tibia motor plate', 'Femur plate that carries the tibia motor (CAD name: tibia attachment plate).'],
  mesh_058: ['Upper chassis enclosure', 'Upper shell around the body.'],
};

export function describePart(file) {
  const key = file.slice(0, 8);
  const [name, detail] = PARTS[key] || ['CAD component', `Source part: ${file}`];
  return { name, detail, motor: name.startsWith('Motor') };
}
