# Hexapod viewer

The full-screen robot view is available at `#/sensors/hexapod`, alongside LiDAR
in the visualization launcher. Its standalone Vite entry point is `/hexapod/`.
The controls reuse the LiDAR stylesheet and view-angle icons. Select a leg by
clicking its geometry or using the menu; the three sliders and numeric inputs
edit angles in degrees. The model retains radians internally.

Selected parts use the posts' Source Serif 4 font. `parts.js` names every shipped
mesh, including motor subcomponents, bearing internals, and sized fasteners.
Labels use the source's assembly report and inspection of the STL shapes;
generic CAD feature names are interpreted from geometry and placement, not
treated as a manufacturer bill of materials. Vendor references remain in the
catalog; the inspector shows only the part name and leg. Actuator names follow
housing axes so an output hub can belong to a motor on an adjacent link.
Run `node --test src/viewers/hexapod/*.test.js` to check catalog coverage and the motion.

Link colors start enabled. Motion offers a selected joint sweep and an in-place
tripod walk: left front, left rear, and right middle alternate with the other
three legs. The walk blends into a modest joint-space cycle around the standing
pose; it does not enforce planted feet or simulate balance. Pause preserves the
current pose and phase. Reset restores the standing pose. This is a kinematic
viewer, with no Isaac Sim connection or contact physics.

The robot assets in `public/hexapod/model/` are unmodified copies from
[Cornell Physical Intelligence's hexapod repository](https://github.com/Cornell-Physical-Intelligence/hexapod-cupi)
at commit `c7595386285e38a238a15585d75f489d61658459`. That repository's
`robot/active_model.json` selects the approved robot, and the viewer reads its
copy, so the folder mirrors the repository's `robot/` tree:

- `active_model.json`
- `hexapod_mkii_updated_v1/stance.json`
- `hexapod_mkii_updated_v1/urdf/hexapod_updated_rs05_mass_corrected.urdf`
- `hexapod_mkii_updated_v1/meshes/`

Joint limits come from the URDF. The URDF's collision meshes repeat its visual
meshes, so the viewer does not load them; the simulator's 153 colliders live in
the source's USD. The approved robot is direct drive, with 18 joints and no
linkage. The loading and inspection logic began as an adaptation of that
repository's earlier preview at `49f4078d`.

To update the robot, copy those files from a newer commit, then run the tests:
a changed mesh list fails the catalog test, and the viewer refuses a URDF that
does not match the hash in `active_model.json`.

Three.js is isolated in this npm workspace, as in `src/viewers/lidar/`, so the home globe's
older renderer is unaffected. `npm run build` builds all three entry points.

## Phone display meshes

Phones and other touch screens use separate, lighter display meshes from
`public/hexapod/display/hexapod_mkii_updated_v1/`. The original URDF, joint limits,
part names, transforms and canonical CAD meshes are unchanged. Desktop uses the
original meshes; **Display → Load full detail** also opens them on a phone.
The display manifest must match the active URDF hash before it can be used.

The current display export reduces uncompressed STL bytes from 33,604,956 to
2,456,056 and assembled triangle instances from 21,773,958 to 1,702,618. These are
asset measurements, not a claim about frame rate on a particular phone. All 59
unique parts and 1,753 mesh instances remain available for inspection.

To regenerate after changing the canonical model, run
`python3 src/viewers/hexapod/simplify_display.py` in an environment with NumPy and
Open3D. The script uses quadric mesh simplification, checks finite/nonempty
geometry and file sizes, and keeps the original geometry for any part whose
bounding box changes by more than 2.5% on an axis. It writes only the separate
display directory. The browser needs no additional dependency.

The viewers share `../lidar/tap.js` so orbiting, cancelled gestures and two-finger
zooming do not select parts. Its focused check is
`node --test src/viewers/lidar/tap.test.js`.
