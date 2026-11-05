import * as THREE from 'three';
import { EARTH_GONE, EARTH_RADIUS, ITHACA_LATLON, TURN_END, altitude, focal, globeFrame, regionFrame } from './dive';

// The home page's draggable globe. The stars behind it are Sky.tsx.
interface MountArgs {
  canvasEl: HTMLCanvasElement;
  onNoWebGL?: () => void;
}

type Vec3Coords = { x: number; y: number; z: number };
type FaceRotation = { rotY: number; rotX: number };
type Projected = { x: number; y: number; visible: boolean };

// the earth model is fitted to this surface radius inside the group, and the pin
// sits on it so it stays locked to the ground all the way down the zoom
const SURFACE_R = 0.571;
const PIN_R = SURFACE_R;
// sharper layers of the same imagery around Ithaca, for the way down. lon and lat in degrees, west to east, south to north.
const LAYERS = [
  { url: '/art/earth-ne.webp', lon: [-105, -60], lat: [28, 56] },
  { url: '/art/earth-ny.webp', lon: [-84, -68], lat: [38, 48] },
];

// scratch vectors - projection runs per pin per frame and must not allocate
const _pos = new THREE.Vector3();
const _center = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _size = new THREE.Vector2();
const _euler = new THREE.Euler();

export class GlobeEngine {
  canvasEl!: HTMLCanvasElement;

  _destroyed = false;
  _noWebGL = false;
  _shown = false;
  _raf?: number;
  _dragCleanup?: () => void;

  userYaw = 0.35;
  userPitch = 0.06;
  // 0 at rest, 1 once scrolling has fallen all the way in toward Ithaca
  zoom = 0;
  restX = 0;
  restY = -0.04;
  restZ = 3.4;
  ithaca: FaceRotation = { rotY: 0, rotX: 0 };
  // Ithaca on the ground, relative to the earth's centre
  ithacaPoint = new THREE.Vector3();

  onResize!: () => void;

  // Initialized before rendering or input listeners are attached.
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  group!: THREE.Group;
  baseRotY = 0;
  baseRotX = 0;

  globeHit!: THREE.Mesh;

  constructor(private readonly onFrame: () => void) {}

  mount({ canvasEl, onNoWebGL }: MountArgs): void {
    this.canvasEl = canvasEl;

    this._destroyed = false;
    this.userYaw = 0.35;
    this.userPitch = 0.06;

    this.onResize = () => {
      if (!this.renderer || !this.camera) return;
      const renderer = this.renderer;
      const camera = this.camera;
      const w = canvasEl.clientWidth;
      const h = canvasEl.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const rest = globeFrame(w, h);
      this.restX = rest.x;
      this.restY = rest.y;
      this.restZ = rest.z;
      camera.position.z = this.restZ;
      camera.updateProjectionMatrix();
      this.group.position.set(this.restX, this.restY, 0);
    };
    window.addEventListener('resize', this.onResize);

    this.initThree();
    if (this._noWebGL) {
      onNoWebGL?.();
      return;
    }
    this.addDrag();
    this.onResize();
    // the canvas fades in off the first rendered frame instead of popping:
    // skeleton and (when the texture beat the chunk) the earth
    // materialize together
    this._shown = false;
    canvasEl.style.opacity = '0';
    canvasEl.style.transition = 'opacity 600ms ease';
    this.animate();
  }

  unmount(): void {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this.onResize);
    if (this._dragCleanup) this._dragCleanup();
    if (this.renderer) this.renderer.dispose();
  }

  addDrag(): void {
    const el = this.canvasEl;
    el.style.cursor = 'grab';
    // Vertical swipes scroll the page.
    el.style.touchAction = 'pan-y';
    let dragging = false, lx = 0, ly = 0;
    const pointers = new Set<number>();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const castFrom = (e: { clientX: number; clientY: number }): THREE.Raycaster => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      return ray;
    };
    const overGlobe = (e: { clientX: number; clientY: number }): boolean =>
      castFrom(e).intersectObject(this.globeHit, false).length > 0;
    const down = (e: PointerEvent): void => {
      pointers.add(e.pointerId);
      if (pointers.size === 2) { dragging = false; return; }
      // only touches/clicks that start on the globe grab it - elsewhere the
      // canvas is inert background and scrolling stays untouched
      if (!overGlobe(e)) return;
      dragging = true; el.style.cursor = 'grabbing'; lx = e.clientX; ly = e.clientY;
    };
    const move = (e: PointerEvent): void => {
      if (pointers.size === 2) return;
      if (!dragging) {
        if (e.target === el) el.style.cursor = overGlobe(e) ? 'grab' : 'default';
        return;
      }
      const rate = 0.006;
      this.userYaw += (e.clientX - lx) * rate;
      this.userPitch = Math.max(-1.1, Math.min(1.1, this.userPitch + (e.clientY - ly) * rate));
      lx = e.clientX; ly = e.clientY;
    };
    const up = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      dragging = false;
      el.style.cursor = 'grab';
    };
    const cancel = (e: PointerEvent): void => { pointers.delete(e.pointerId); dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    this._dragCleanup = () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }

  latLon(lat: number, lon: number, radius: number): Vec3Coords {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return {
      x: -radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.cos(phi),
      z: radius * Math.sin(phi) * Math.sin(theta),
    };
  }
  faceRot(lat: number, lon: number): FaceRotation {
    const v = this.latLon(lat, lon, 1);
    return { rotY: -Math.atan2(v.x, v.z), rotX: Math.atan2(v.y, Math.sqrt(v.x*v.x + v.z*v.z)) };
  }

  // Screen position (CSS px, relative to the canvas box) of a lat/lon, plus
  // whether it is on the near face of the earth rather than hidden behind it.
  project(lat: number, lon: number): Projected | null {
    if (!this.renderer) return null;
    const p = this.latLon(lat, lon, PIN_R);
    _pos.set(p.x, p.y, p.z);
    this.group.localToWorld(_pos);
    this.group.getWorldPosition(_center);
    _normal.copy(_pos).sub(_center);
    _toCam.copy(this.camera.position).sub(_pos);
    const visible = _normal.dot(_toCam) > 0;
    _pos.project(this.camera);
    this.renderer.getSize(_size);
    return {
      x: (_pos.x * 0.5 + 0.5) * _size.x,
      y: (-_pos.y * 0.5 + 0.5) * _size.y,
      visible,
    };
  }

  initThree(): void {
    const scene = new THREE.Scene();
    this.scene = scene;
    // the near plane has to clear the camera's closest approach to the ground, about 0.015
    const camera = new THREE.PerspectiveCamera(42, 1, 0.004, 100);
    camera.position.set(0, 0, 3.4);
    this.camera = camera;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvasEl, alpha: true, antialias: true });
    } catch (err) {
      console.error('[engine] WebGLRenderer construction failed:', err);
      this._noWebGL = true;
      return;
    }
    renderer.setClearColor(0x000000, 0);
    // three is pinned to exactly 0.150.1 in package.json - outputEncoding and
    // sRGBEncoding were removed in r152+ (use outputColorSpace/SRGBColorSpace if you ever bump).
    renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer = renderer;

    // low ambient + key from the LEFT: the right limb (west Africa on both
    // framings) falls into real shadow, so the desert reads as night side
    // instead of a yellow glow on the edge. No rim light - anything grazing
    // that limb relights the desert.
    scene.add(new THREE.AmbientLight(0x8fa6c4, 0.34));
    // z moderate: enough toward the camera that the disc reads lit with a soft
    // terminator on the right limb; push z much past this and it floodlights,
    // leaving no terminator at all
    const key = new THREE.DirectionalLight(0xffffff, 1.35); key.position.set(-4, 1.5, 2.6); scene.add(key);

    const group = new THREE.Group();
    this.group = group;
    group.scale.setScalar(1.25);
    scene.add(group);

    // Invisible drag target, slightly larger than the earth surface.
    const globeHit = new THREE.Mesh(new THREE.SphereGeometry(0.62), new THREE.MeshBasicMaterial());
    globeHit.visible = false;
    group.add(globeHit);
    this.globeHit = globeHit;

    this.loadEarth(group);

    this.ithaca = this.faceRot(ITHACA_LATLON.lat, ITHACA_LATLON.lon);
    const i = this.latLon(ITHACA_LATLON.lat, ITHACA_LATLON.lon, EARTH_RADIUS);
    this.ithacaPoint.set(i.x, i.y, i.z);
    const aim = this.faceRot(34.25, -44.84);
    this.baseRotY = aim.rotY;
    this.baseRotX = aim.rotX;
    group.rotation.y = this.baseRotY;
    group.rotation.x = this.baseRotX;
  }

  loadEarth(group: THREE.Group): void {
    // Equirectangular UVs match latLon(); the sphere stays dim until the texture loads.
    const mat = new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 1 });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(SURFACE_R, 96, 64), mat);
    group.add(earth);

    // NASA Blue Marble at 4096x2048 (public domain). The file is stored
    // south-up (a glTF-era convention), so it loads with flipY off.
    const white = new THREE.Color(0xffffff);
    const dark = new THREE.Color(0x16222e);
    const tex = new THREE.TextureLoader().load('/earth-4k.webp', () => {
      // upload now, off-screen, so the first frame that shows the earth does
      // not also pay for 4k mipmap generation - that stutter reads as a flash
      this.renderer?.initTexture(tex);
      mat.map = tex;
      mat.needsUpdate = true;
      this.loadLayers(group);
      // material color multiplies the map: ease it dark -> white so the
      // texture fades in over the skeleton instead of popping
      const t0 = performance.now();
      const fade = () => {
        const k = Math.min(1, (performance.now() - t0) / 500);
        mat.color.copy(dark).lerp(white, k);
        if (k < 1 && !this._destroyed) requestAnimationFrame(fade);
      };
      fade();
    });
    tex.flipY = false;
    tex.encoding = THREE.sRGBEncoding;
    if (this.renderer) tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
  }

  // Fetched once the earth has arrived, before anyone is mid-zoom, so uploading them can't stutter a scroll.
  loadLayers(group: THREE.Group): void {
    const rad = Math.PI / 180;
    LAYERS.forEach(({ url, lon, lat }, i) => {
      new THREE.TextureLoader().load(url, (tex) => {
        if (this._destroyed) return;
        tex.encoding = THREE.sRGBEncoding;
        if (this.renderer) { tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); this.renderer.initTexture(tex); }
        // same parameterisation as latLon(). The sphere is convex, so with back faces culled nothing needs a depth test.
        const geo = new THREE.SphereGeometry(SURFACE_R, 48, 32, (lon[0] + 180) * rad, (lon[1] - lon[0]) * rad, (90 - lat[1]) * rad, (lat[1] - lat[0]) * rad);
        const layer = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true, depthTest: false }));
        layer.renderOrder = i + 1;
        group.add(layer);
      });
    });
  }

  animate = (): void => {
    if (this._destroyed || this._noWebGL || !this.renderer) return;
    const renderer = this.renderer;
    this._raf = requestAnimationFrame(this.animate);

    const k = this.zoom;
    // fully behind the map from here on: don't spend every later frame drawing what nobody can see
    if (k >= EARTH_GONE) return;
    const vw = this.canvasEl.clientWidth, vh = this.canvasEl.clientHeight, f = focal(vh), at = regionFrame(vw, vh, k);
    const yaw = this.baseRotY + this.userYaw, pitch = Math.max(-1.25, Math.min(1.25, this.baseRotX + this.userPitch));
    // where Ithaca sits on screen at rest, in px from the centre, y up
    _euler.set(pitch, yaw, 0);
    _pos.copy(this.ithacaPoint).applyEuler(_euler);
    const restScale = f / (this.restZ - _pos.z), restX = (this.restX + _pos.x) * restScale, restY = (this.restY + _pos.y) * restScale;
    // The earth turns to face the camera while Ithaca glides from there to its place on the finished map.
    // The earth is positioned to put Ithaca on that path, so it can't sweep off screen however big the earth gets.
    const t = Math.min(1, k / TURN_END), turn = t * t * (3 - 2 * t);
    this.group.rotation.set(pitch + (this.ithaca.rotX - pitch) * turn, yaw + (this.ithaca.rotY - yaw) * turn, 0);
    _pos.copy(this.ithacaPoint).applyEuler(this.group.rotation);
    this.camera.position.z = EARTH_RADIUS + altitude(k, vw, vh);
    const perPixel = (this.camera.position.z - _pos.z) / f;
    this.group.position.x = (restX + (at.x - vw / 2 - restX) * turn) * perPixel - _pos.x;
    this.group.position.y = (restY + (vh / 2 - at.y - restY) * turn) * perPixel - _pos.y;

    renderer.render(this.scene, this.camera);
    if (!this._shown) {
      this._shown = true;
      // next frame, so the opacity:0 start point has been committed first
      requestAnimationFrame(() => { this.canvasEl.style.opacity = '1'; });
    }
    this.onFrame();
  };
}
