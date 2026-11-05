import './style.css';
import { AxesHelper, Color, MeshBasicMaterial, Vector2, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import { GlobalCache } from '@giro3d/giro3d/core/Cache.js';
import PointCloud from '@giro3d/giro3d/entities/PointCloud.js';
import COPCSource from '@giro3d/giro3d/sources/COPCSource.js';
import ConstantSizeSphere from '@giro3d/giro3d/renderer/ConstantSizeSphere.js';
import { setLazPerfPath } from '@giro3d/giro3d/sources/las/config.js';
import proj4 from 'proj4';
import { createRangeGetter } from './range.js';
import { onTap } from './tap.js';

const $ = (id) => document.getElementById(id);
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });
const classes = [
  { code: 2, name: 'Ground', color: '#b4ac98' },
  { code: 5, name: 'Vegetation', color: '#21c55d' },
  { code: 6, name: 'Buildings', color: '#ff6b35' },
  { code: 9, name: 'Water', color: '#009dff' },
  { code: 17, name: 'Bridge decks', color: '#db42f5' },
];
const compactScreen = matchMedia('(max-width: 720px), (pointer: coarse), (max-width: 1100px) and (max-height: 500px)');
const small = compactScreen.matches;
if (small) {
  $('controls').open = false;
  document.querySelector('.classes-panel').open = false;
}
const orbitHint = () => compactScreen.matches ? 'One finger rotates · pinch to zoom · two fingers pan. Tap a point to inspect.' : 'Click a point to inspect. Drag to orbit, scroll to zoom, right-drag to pan.';
function updateHint() {
  $('hint').textContent = orbitHint();
  $('view').setAttribute('aria-label', `Interactive Ithaca LiDAR scan. ${orbitHint()} Arrow keys pan; Enter selects the center point.`);
}
updateHint();
setLazPerfPath('/lidar/wasm');
GlobalCache.configure({ byteCapacity: (small ? 96 : 256) * 1024 * 1024 });

async function start() {
  const base = new URL('/lidar/', location.href);
  const response = await fetch(new URL('metadata.json', base));
  if (!response.ok) throw new Error('The scan metadata could not be loaded.');
  const info = await response.json();
  const toLatLon = proj4(info.horizontalCrs, 'EPSG:4326');
  const getter = createRangeGetter(info, base);
  const source = new COPCSource({
    url: getter,
    enableWorkers: true,
  });
  await source.initialize();
  const metadata = await source.getMetadata();
  const instance = new Instance({ target: 'view', crs: metadata.crs, backgroundColor: '#0e141c' });
  instance.renderer.domElement.addEventListener('webglcontextlost', () => reportError(new Error('The 3D view was interrupted. Reload to try again.')));
  // Giro3D's depth-shading targets use CSS pixels; keep the canvas at the same scale.
  instance.renderer.setPixelRatio(1);
  instance.renderingOptions.enableEDL = true;
  instance.renderingOptions.EDLRadius = 0.6;
  instance.renderingOptions.EDLStrength = 3;

  const cloud = new PointCloud({ source });
  await instance.add(cloud);
  cloud.pointSize = 2;
  cloud.pointBudget = small ? 750_000 : 2_500_000;
  cloud.cleanupDelay = 5000;
  cloud.subdivisionThreshold = small ? 2.5 : 1;
  $('quality').value = String(cloud.pointBudget);
  cloud.setColoringMode('attribute');
  cloud.setActiveAttribute('Classification');
  const palette = cloud.getAttributeClassifications('Classification');
  for (const cls of classes) {
    palette[cls.code].color = new Color(cls.color);
    const label = document.createElement('label');
    label.className = 'class-row';
    label.innerHTML = `<input type="checkbox" checked aria-label="Show ${cls.name.toLowerCase()}"><span class="swatch" style="background:${cls.color}"></span><span>${cls.name}</span><span class="count">${compact.format(info.classes[cls.code])}</span>`;
    label.querySelector('input').addEventListener('change', (event) => {
      palette[cls.code].visible = event.target.checked;
      instance.notifyChange(cloud);
    });
    $('classes').append(label);
  }

  const camera = instance.view.camera;
  camera.fov = 55;
  camera.up.set(0, 0, 1);
  const orbit = new OrbitControls(camera, instance.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.15;
  orbit.minDistance = 3;
  orbit.maxDistance = 4500;
  orbit.maxPolarAngle = Math.PI;
  orbit.zoomToCursor = true;
  orbit.listenToKeyEvents($('view'));
  instance.view.setControls(orbit);
  instance.view.minNearPlane = 0.1;
  instance.view.maxFarPlane = 12000;

  const pivot = new AxesHelper(1);
  pivot.setColors('#fff000', '#fff000', '#fff000');
  pivot.material.depthTest = false;
  pivot.material.depthWrite = false;
  pivot.material.transparent = true;
  pivot.renderOrder = 1000;
  pivot.visible = false;
  await instance.add(pivot);
  const selectedPoint = new ConstantSizeSphere({
    radius: 2.5,
    material: new MeshBasicMaterial({ color: '#fff000', depthTest: false, depthWrite: false, transparent: true }),
  });
  selectedPoint.enableRaycast = false;
  selectedPoint.renderOrder = 1001;
  selectedPoint.visible = false;
  await instance.add(selectedPoint);
  let pickingAnchor = false;

  function clearPoint() {
    $('point-info').hidden = true;
    selectedPoint.visible = false;
    instance.notifyChange(selectedPoint);
  }
  function setAnchorMode(enabled) {
    pickingAnchor = enabled;
    $('anchor').classList.toggle('selected', enabled);
    $('anchor').setAttribute('aria-pressed', String(enabled));
    instance.domElement.style.cursor = enabled ? 'crosshair' : '';
    $('hint').textContent = enabled ? 'Tap a point to set the orbit center. Open controls and tap the anchor again to cancel.' : orbitHint();
    if (enabled && compactScreen.matches) $('controls').open = false;
  }
  function selectPoint(position) {
    const [hit] = instance.pickObjectsAt(position, { where: [cloud], radius: 4, limit: 1, gpuPicking: true });
    if (!hit) {
      clearPoint();
      $('hint').textContent = 'No visible point there. Click the scan, or zoom closer for finer detail.';
      return;
    }
    if (pickingAnchor) {
      orbit.target.copy(hit.point);
      orbit.zoomToCursor = false;
      orbit.update();
      pivot.visible = true;
      setAnchorMode(false);
      instance.notifyChange(camera);
      return;
    }
    selectedPoint.position.copy(hit.point);
    selectedPoint.updateMatrixWorld();
    selectedPoint.visible = true;
    instance.notifyChange(selectedPoint);
    const code = hit.object.geometry.getAttribute('classification')?.getX(hit.index);
    const cls = classes.find(c => c.code === code);
    $('point-details').replaceChildren();
    const name = document.createElement('strong');
    name.textContent = `${cls?.name ?? 'Unclassified'} (predicted)`;
    name.style.color = cls?.color ?? '#e6ecf0';
    const coordinates = document.createElement('p');
    const [lon, lat] = toLatLon.forward([hit.point.x, hit.point.y]);
    coordinates.textContent = `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? 'W' : 'E'}\nElevation ${hit.point.z.toFixed(2)} m`;
    $('point-details').append(name, coordinates);
    $('point-info').hidden = false;
  }
  onTap(instance.domElement, selectPoint);
  $('view').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      selectPoint(new Vector2(instance.domElement.clientWidth / 2, instance.domElement.clientHeight / 2));
    }
  });
  $('close-point').onclick = clearPoint;
  $('anchor').onclick = () => {
    clearPoint();
    setAnchorMode(!pickingAnchor);
    instance.domElement.focus({ preventScroll: true });
  };
  instance.addEventListener('after-camera-update', () => {
    if (!pivot.visible) return;
    pivot.position.copy(orbit.target);
    pivot.scale.setScalar(camera.position.distanceTo(orbit.target) * 2 * Math.tan(camera.fov * Math.PI / 360) * 24 / instance.domElement.clientHeight);
    pivot.updateMatrixWorld();
  });
  function overview(angle = 'iso') {
    setAnchorMode(false);
    clearPoint();
    pivot.visible = false;
    orbit.zoomToCursor = true;
    const center = new Vector3(377250, 4700250, 170);
    camera.fov = 55;
    const positions = {
      iso: [378350, 4698750, 1500],
      top: [377250, 4700249.99, 2450],
      front: [377250, 4698000, 170],
      side: [379500, 4700250, 170],
    };
    camera.position.set(...positions[angle]);
    orbit.target.copy(center);
    camera.lookAt(center);
    orbit.update();
    instance.domElement.focus({ preventScroll: true });
    instance.notifyChange(camera);
  }
  for (const button of document.querySelectorAll('[data-view]')) {
    button.onclick = () => overview(button.dataset.view);
  }
  let qualityChosen = false;
  function setQuality(budget) {
    cloud.pointBudget = budget;
    $('quality').value = String(budget);
    cloud.subdivisionThreshold = cloud.pointBudget > 3_000_000 ? 0.8 : cloud.pointBudget < 1_000_000 ? 2.5 : 1;
    instance.notifyChange(cloud);
  }
  $('quality').onchange = (event) => {
    qualityChosen = true;
    setQuality(Number(event.target.value));
  };
  compactScreen.addEventListener('change', () => {
    const previousHint = $('hint').textContent;
    updateHint();
    if (pickingAnchor) $('hint').textContent = previousHint;
    if (compactScreen.matches) $('controls').open = false;
    GlobalCache.configure({ byteCapacity: (compactScreen.matches ? 96 : 256) * 1024 * 1024 });
    if (!qualityChosen) setQuality(compactScreen.matches ? 750_000 : 2_500_000);
  });
  $('point-size').oninput = (event) => { cloud.pointSize = Number(event.target.value); instance.notifyChange(cloud); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setAnchorMode(false); clearPoint(); }
  });

  function updateLoading() {
    if (cloud.displayedPointCount > 0) {
      $('loading').hidden = true;
      instance.removeEventListener('update-end', updateLoading);
    }
  }
  $('load-message').textContent = 'Loading the first points…';
  instance.addEventListener('update-end', updateLoading);
  overview();
}

function reportError(error) {
  console.error(error);
  $('loading').hidden = false;
  $('load-message').textContent = `The scan could not open. ${error.message} Reload to try again.`;
  document.querySelector('.pulse').hidden = true;
  if (parent !== window) parent.postMessage({ type: 'geodata:viewer-error' }, location.origin);
}
start().catch(reportError);
