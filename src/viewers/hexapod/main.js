import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';
import { animationPose, phaseForJoint } from './motion.js';
import { describePart } from './parts.js';
import { onTap } from '../lidar/tap.js';

const $ = id => document.getElementById(id);
const LEGS = ['lf', 'lm', 'lr', 'rf', 'rm', 'rr'];
const KINDS = ['coxa_yaw', 'femur_pitch', 'tibia_pitch'];
const NAMES = { lf: 'Left front', lm: 'Left middle', lr: 'Left rear', rf: 'Right front', rm: 'Right middle', rr: 'Right rear' };
const TINT = { body: 0xcad7e5, coxa: 0xb49ddc, femur: 0x8dbdff, tibia: 0x80ddba };
const BASE = new URL('/hexapod/model/', location.href);
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const compactScreen = matchMedia('(max-width: 720px), (pointer: coarse), (max-width: 1100px) and (max-height: 500px)');
const updateHint = () => {
  const hint = compactScreen.matches ? 'One finger rotates · pinch to zoom · two fingers pan. Tap a part to inspect.' : 'Click a leg to select. Drag to orbit, scroll to zoom, right-drag to pan.';
  $('hint').textContent = hint;
  $('view').setAttribute('aria-label', `Interactive hexapod. ${hint} Arrow keys pan; choose a leg and adjust its joints in controls.`);
};
updateHint();

async function start() {
  const fetchFile = async path => {
    const response = await fetch(new URL(path, BASE));
    if (!response.ok) throw new Error(`Could not load ${path}. Please reload to try again.`);
    return response;
  };
  // active_model.json is the source repository's own record of which robot is current.
  const active = await (await fetchFile('active_model.json')).json();
  let display = null;
  if (compactScreen.matches && new URLSearchParams(location.search).get('detail') !== 'full') {
    const response = await fetch(`/hexapod/display/${active.id}/manifest.json`);
    if (response.ok) {
      const manifest = await response.json();
      if (manifest.urdf_sha256 === active.urdf.sha256) display = manifest;
    }
  }
  $('full-detail').hidden = !display;
  const stance = await (await fetchFile(`${active.id}/stance.json`)).json();
  const stancePose = Object.fromEntries(stance.joint_names.map((name, index) => [name, stance.nominal_joint_position_rad[index]]));
  const toes = stance.toe_names.map((link, index) => ({ link, point: new THREE.Vector3(...stance.toe_local_points_m[index]) }));
  // How far the toe surface reaches below each recorded toe point, from the recorded standing height.
  const toeRadius = stance.root_height_m + Math.min(...stance.neutral_feet_body_m.map(foot => foot[2]));
  let q = { ...stancePose }, limits = {}, robot, selectedPart, ready = false;
  let motorHousings = [];
  let playing = false, phase = 0, lastTime = 0, motionTime = 0, animationBase = {};
  let frame = 0;
  function requestRender() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }
  const geometries = new Map();
  const stage = $('view');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e141c');
  scene.fog = new THREE.Fog('#0e141c', 1.8, 4);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 20);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ antialias: !compactScreen.matches });
  renderer.setPixelRatio(compactScreen.matches ? 1 : Math.min(devicePixelRatio, 2));
  renderer.domElement.addEventListener('webglcontextlost', () => showError(new Error('The 3D view was interrupted. Reload to try again.')));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.minDistance = 0.25;
  orbit.maxDistance = 3;
  orbit.listenToKeyEvents(stage);
  orbit.addEventListener('change', requestRender);
  scene.add(new THREE.HemisphereLight(0xecf5ff, 0x43505f, 2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, -1.3, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fcfff, 1);
  rim.position.set(-1, 0.6, 1);
  scene.add(rim);
  const grid = new THREE.GridHelper(4, 80, 0x293b47, 0x1c2a36);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  let framing = 1;
  // the panel starts closed, so the robot opens dead centre; the offsets below
  // only step it aside while the panel is actually covering that corner
  const panel = document.querySelector('.panel');
  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    const nextFraming = compactScreen.matches ? Math.max(1, height / width * 0.9) : 1;
    camera.position.sub(orbit.target).multiplyScalar(nextFraming / framing).add(orbit.target);
    framing = nextFraming;
    orbit.maxDistance = Math.max(3, framing * 2);
    camera.aspect = width / height;
    // Reserve room for the floating panel without shrinking the canvas.
    const wide = !compactScreen.matches || (width > height && height <= 500);
    const panelBounds = panel.getBoundingClientRect();
    const top = stage.getBoundingClientRect().top;
    const verticalOffset = panel.open && !wide ? (height - (panelBounds.top - top)) / 2 : 0;
    camera.setViewOffset(width, height, panel.open && wide ? -140 : 0, verticalOffset, width, height);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(compactScreen.matches ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    requestRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  panel.addEventListener('toggle', resize);
  compactScreen.addEventListener('change', () => { updateHint(); resize(); });
  resize();
  const views = { iso: [0.90, -1.05, 0.68], top: [0, -0.001, 1.5], front: [0, -1.4, 0.25], side: [1.4, 0, 0.25] };
  function setView(name) {
    orbit.target.set(0, 0, 0.08);
    camera.position.set(...views[name]).sub(orbit.target).multiplyScalar(framing).add(orbit.target);
    orbit.update();
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === name));
  }
  document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => setView(button.dataset.view); });
  setView('iso');

  const linkAncestor = object => { for (let node = object; node; node = node.parent) if (node.isURDFLink) return node; return null; };
  function indexMotors() {
    motorHousings = [];
    for (const leg of LEGS) for (const segment of ['coxa', 'femur']) {
      const link = robot.links[`${leg}_${segment}`];
      const housings = [];
      link.traverse(mesh => {
        if (mesh.userData.file?.startsWith('mesh_004_') && linkAncestor(mesh) === link) housings.push(mesh);
      });
      // Direct drive: the coxa carries its own motor on the yaw axis and, farther
      // out, the motor that drives the femur. The femur carries the tibia's motor.
      const distance = mesh => link.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())).lengthSq();
      housings.sort((a, b) => distance(a) - distance(b));
      housings.forEach((mesh, index) => motorHousings.push({ mesh, leg, kind: segment === 'femur' ? 'tibia' : index === 0 ? 'coxa' : 'femur' }));
    }
  }
  function motorForPart(mesh, link) {
    const [leg, segment] = link.name.split('_');
    const kinds = segment === 'coxa' ? ['coxa', 'femur'] : segment === 'femur' ? ['femur', 'tibia'] : segment === 'tibia' ? ['tibia'] : ['coxa'];
    const candidates = motorHousings.filter(motor => (link.name === 'body' || motor.leg === leg) && kinds.includes(motor.kind));
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const position = mesh.localToWorld(mesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
    // A hub or bearing can live on the adjacent link. Match its center to the
    // actuator axis, not to the link name or the mesh's arbitrary CAD origin.
    const distance = motor => {
      const axis = new THREE.Vector3(0, 0, 1).transformDirection(motor.mesh.matrixWorld);
      const delta = position.clone().sub(motor.mesh.getWorldPosition(new THREE.Vector3()));
      return delta.lengthSq() - delta.dot(axis) ** 2;
    };
    return candidates.reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest);
  }
  function paint() {
    robot?.traverse(object => {
      if (!object.isMesh) return;
      if (!object.userData.cadColor) { object.material = object.material.clone(); object.userData.cadColor = object.material.color.clone(); }
      const link = linkAncestor(object)?.name || 'body';
      const kind = link === 'body' ? 'body' : link.split('_').slice(1).join('_');
      object.material.color.copy(object.userData.cadColor);
      if ($('colors').checked) object.material.color.setHex(TINT[kind] || TINT.body);
      object.material.emissive.setHex(link.startsWith(`${$('leg').value}_`) ? 0x123a29 : 0x000000);
      if (object === selectedPart) {
        object.material.color.setHex(0xfff000);
        object.material.emissive.setHex(0x665500);
      }
    });
    requestRender();
  }
  function clearPart() {
    selectedPart = null;
    $('point-info').hidden = true;
    paint();
  }
  $('colors').onchange = paint;

  function syncControls(editing = false) {
    for (const kind of KINDS) {
      const name = `${$('leg').value}_${kind}`, value = deg(q[name]);
      // Coxa travel differs by leg, so the range follows the selected leg.
      for (const prefix of ['s', 'n']) {
        $(`${prefix}_${kind}`).min = Math.ceil(deg(limits[name].lower) * 10) / 10;
        $(`${prefix}_${kind}`).max = Math.floor(deg(limits[name].upper) * 10) / 10;
      }
      $(`s_${kind}`).value = value;
      if (!editing || document.activeElement !== $(`n_${kind}`)) $(`n_${kind}`).value = value.toFixed(1);
    }
  }
  function setPose(values, editing = false) {
    q = { ...values };
    for (const [name, value] of Object.entries(q)) robot?.setJointValue(name, value);
    syncControls(editing);
    if (robot) {
      robot.updateMatrixWorld(true);
      const lowest = Math.min(...toes.map(({ link, point }) => point.clone().applyMatrix4(robot.links[link].matrixWorld).z)) - toeRadius;
      $('clearance').textContent = `${(lowest * 1000).toFixed(1)} mm`;
      $('clearance').style.color = lowest < 0 ? '#ffb6ac' : '';
    }
    requestRender();
  }
  function pause() {
    playing = false;
    $('play').setAttribute('aria-pressed', 'false');
    $('play').querySelector('span').textContent = 'Play motion';
    $('play').querySelector('path').setAttribute('d', 'm5 3 7 5-7 5Z');
  }
  function manualJoint(kind, value) {
    pause();
    if (!Number.isFinite(value)) { syncControls(); return; }
    const name = `${$('leg').value}_${kind}`, { lower, upper } = limits[name];
    setPose({ ...q, [name]: THREE.MathUtils.clamp(rad(value), lower, upper) }, true);
  }
  for (const kind of KINDS) {
    const row = document.createElement('div');
    const label = kind.split('_')[0];
    const name = label[0].toUpperCase() + label.slice(1);
    row.className = 'joint';
    row.innerHTML = `<div class="joint-heading"><label for="s_${kind}">${name}</label><div class="joint-value"><input id="n_${kind}" type="number" step="0.1" aria-label="${name} angle in degrees"/><span>°</span></div></div><input id="s_${kind}" type="range" step="0.1" aria-label="${name} joint"/>`;
    $('joints').append(row);
    $(`s_${kind}`).oninput = event => manualJoint(kind, event.target.valueAsNumber);
    $(`n_${kind}`).oninput = event => { if (Number.isFinite(event.target.valueAsNumber)) manualJoint(kind, event.target.valueAsNumber); };
    $(`n_${kind}`).onblur = () => syncControls();
  }
  $('leg').onchange = () => { pause(); syncControls(); clearPart(); };
  $('reset').onclick = () => { pause(); setPose(stancePose); };

  function disposeRobot(previous) {
    if (!previous) return;
    scene.remove(previous);
    previous.traverse(object => {
      if (object.material) object.material.dispose();
      if (object.geometry && !object.userData.file) object.geometry.dispose();
    });
  }
  async function loadModel() {
    // The repository paths start at robot/; the model folder mirrors that tree.
    const urdf = active.urdf.path.replace(/^robot\//, '');
    const text = await (await fetchFile(urdf)).text();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    if ([...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') !== active.urdf.sha256) throw new Error('The robot model does not match its source. Please reload.');
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    $('mass').textContent = `${[...xml.querySelectorAll('inertial > mass')].reduce((sum, node) => sum + Number(node.getAttribute('value')), 0).toFixed(2)} kg`;
    const loader = new URDFLoader();
    const pending = [];
    loader.loadMeshCb = (path, manager, done) => {
      const file = path.split('/').pop();
      const displayPath = display?.files[file] ? `/hexapod/display/${active.id}/meshes/${file}` : path;
      if (!geometries.has(path)) geometries.set(path, new STLLoader(manager).loadAsync(displayPath).then(geometry => { geometry.computeVertexNormals(); return geometry; }));
      pending.push(geometries.get(path).then(geometry => {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc0ccdb, metalness: 0.28, roughness: 0.5 }));
        mesh.userData.file = file;
        done(mesh);
      }));
    };
    const next = loader.parse(text, new URL('./', new URL(urdf, BASE)).href);
    await Promise.all(pending);
    robot = next;
    limits = Object.fromEntries(Object.entries(robot.joints).map(([name, joint]) => [name, joint.limit]));
    robot.position.z = stance.reset_root_height_m;
    scene.add(robot);
    paint();
    setPose(q);
    indexMotors();
    $('joint-controls').disabled = $('motion-controls').disabled = false;
    $('loading').hidden = true;
    ready = true;
  }
  $('play').onclick = () => {
    if (playing) { pause(); return; }
    if (!ready) return;
    animationBase = { ...q };
    const name = `${$('leg').value}_${$('motion-joint').value}`;
    if ($('motion').value === 'joint') phase = phaseForJoint(q[name], limits[name].lower, limits[name].upper);
    motionTime = 0;
    lastTime = performance.now();
    playing = true;
    $('play').setAttribute('aria-pressed', 'true');
    $('play').querySelector('span').textContent = 'Pause motion';
    $('play').querySelector('path').setAttribute('d', 'M4 3h3v10H4ZM9 3h3v10H9Z');
    requestRender();
  };
  for (const id of ['motion', 'motion-joint']) $(id).onchange = () => {
    pause();
    phase = 0;
    $('sweep-controls').hidden = $('motion').value !== 'joint';
  };
  const raycaster = new THREE.Raycaster();
  onTap(renderer.domElement, event => {
    if (!ready) return;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObject(robot, true).find(hit => hit.object.isMesh);
    if (!hit) { clearPart(); return; }
    selectedPart = hit.object;
    const link = linkAncestor(hit.object);
    const part = describePart(hit.object.userData.file);
    const motor = part.motor ? motorForPart(hit.object, link) : null;
    const leg = motor?.leg || link.name.split('_')[0];
    if (LEGS.includes(leg)) { $('leg').value = leg; pause(); syncControls(); }
    paint();
    $('point-details').replaceChildren();
    const title = document.createElement('strong');
    title.textContent = motor ? `${motor.kind[0].toUpperCase()}${motor.kind.slice(1)} ${part.name.toLowerCase()}` : part.name;
    const location = document.createElement('p');
    location.textContent = NAMES[leg] || 'Body';
    $('point-details').append(title, location);
    $('point-info').hidden = false;
  });
  $('close-point').onclick = clearPart;
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { pause(); clearPart(); } });
  function render(now) {
    frame = 0;
    if (playing && ready) {
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      motionTime += dt;
      phase += dt * Number($('speed').value) * 2 * Math.PI / ($('motion').value === 'gait' ? 1.6 : 8);
      lastTime = now;
      setPose(animationPose({ mode: $('motion').value, phase, basePose: animationBase, stancePose, legs: LEGS, kinds: KINDS, limits, leg: $('leg').value, joint: $('motion-joint').value, transition: Math.min(motionTime * 2, 1) }));
    }
    orbit.update();
    renderer.render(scene, camera);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  });
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    orbit.dispose();
    disposeRobot(robot);
    geometries.forEach(promise => promise.then(geometry => geometry.dispose()).catch(() => {}));
    grid.geometry.dispose();
    grid.material.dispose();
    renderer.dispose();
  });
  await loadModel();
  setPose(stancePose);
}

function showError(error) {
  $('loading').hidden = false;
  $('loading').dataset.error = 'true';
  $('load-message').textContent = error.message || 'The model could not be opened. Please reload.';
  if (parent !== window) parent.postMessage({ type: 'geodata:viewer-error' }, location.origin);
}
start().catch(showError);
