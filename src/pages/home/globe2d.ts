// The home globe for browsers with WebGL turned off (LibreWolf, Mullvad,
// GPU-blocklisted Chromium builds): the same scene as GlobeEngine, ray-cast
// per pixel onto a plain 2D canvas. The earth is only re-shaded when it turns;
// the per-frame cost is one drawImage. The stars behind it are Sky.tsx.

type Projected = { x: number; y: number; visible: boolean };

// mirrors GlobeEngine's camera and group so both land in the same place
const FOV_TAN = Math.tan((42 * Math.PI / 180) / 2);
const CAM_Z = 3.4;
const SURFACE_R = 0.571 * 1.25;
const GY = -0.04;
const PIN_R = 0.585 / 0.571;
// light: ambient 0x8fa6c4 at 0.34, key 1.35 from (-4, 1.5, 2.6)
const AMB = [0x8f / 255 * 0.34, 0xa6 / 255 * 0.34, 0xc4 / 255 * 0.34];
const KEY = 1.35;
const L = (() => { const l = Math.hypot(-4, 1.5, 2.6); return [-4 / l, 1.5 / l, 2.6 / l]; })();
const DARK = [0x16, 0x22, 0x2e];
// ponytail: the earth buffer is capped, so very large retina windows upscale it slightly
const MAX_D = 560;
const TEX_W = 2048, TEX_H = 1024;

const toLin = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
// linear -> display, per channel: sRGB encode, then a curve fitted against
// screenshots of the WebGL globe (MeshStandardMaterial lifts the shadows and
// caps the highlights; this reproduces that look within a few levels)
const TONE = [[17.61, 1.0910, -0.00228], [18.75, 1.0903, -0.00224], [23.12, 0.9660, -0.00173]];
const toOut = TONE.map(([c0, c1, c2]) => new Uint8ClampedArray(4096).map((_, i) => {
  const c = i / 4095;
  const s = 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  return c0 + c1 * s + c2 * s * s;
}));

function unit(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
  return [-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}

export class Globe2D {
  userYaw = 0.35;
  userPitch = 0.06;
  baseRotY: number;
  baseRotX: number;

  canvasEl!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  buf = document.createElement('canvas');
  tex?: Uint8ClampedArray;
  // viewport, globe centre (gx in camera space; cx, cy, r the screen box)
  w = 0; h = 0; gx = 0; cx = 0; cy = 0; r = 0;
  dirty = true;
  _raf?: number;
  _destroyed = false;
  _shown = false;
  _cleanup: (() => void)[] = [];

  constructor(private readonly onFrame: () => void) {
    const [x, y, z] = unit(34.25, -44.84);
    this.baseRotY = -Math.atan2(x, z);
    this.baseRotX = Math.atan2(y, Math.hypot(x, z));
  }

  // false when the browser will not hand out a 2D context either
  mount(canvasEl: HTMLCanvasElement): boolean {
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return false;
    this.canvasEl = canvasEl;
    this.ctx = ctx;

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this._cleanup.push(() => window.removeEventListener('resize', onResize));
    this.resize();
    this.addDrag();

    const img = new Image();
    img.onload = () => {
      if (this._destroyed) return;
      const c = document.createElement('canvas');
      c.width = TEX_W; c.height = TEX_H;
      const tctx = c.getContext('2d', { willReadFrequently: true });
      if (!tctx) return;
      tctx.drawImage(img, 0, 0, TEX_W, TEX_H);
      // ponytail: browsers that poison canvas reads (Tor) get a noisy earth, detect it if that audience matters
      try { this.tex = tctx.getImageData(0, 0, TEX_W, TEX_H).data; } catch { return; }
      this.dirty = true;
    };
    img.src = '/earth-4k.webp';

    canvasEl.style.opacity = '0';
    canvasEl.style.transition = 'opacity 600ms ease';
    this.animate();
    return true;
  }

  unmount(): void {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._cleanup.forEach((f) => f());
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.w = w; this.h = h;
    this.canvasEl.width = Math.round(w * dpr);
    this.canvasEl.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // GlobeEngine's desktop framing, in camera space; Globe.tsx never shows
    // the earth at mobile widths, so there is no mobile branch here
    this.gx = FOV_TAN * CAM_Z * (w / h) * 0.44;
    this.cx = w * 0.72;
    this.cy = h * (0.5 + GY / (CAM_Z * FOV_TAN) / 2);
    // box the drawn sphere with room for perspective stretch
    this.r = Math.tan(Math.asin(SURFACE_R / CAM_Z)) / FOV_TAN * h / 2 * 1.12;
    const d = Math.min(MAX_D, Math.round(this.r * 2 * dpr));
    this.buf.width = this.buf.height = d;
    this.dirty = true;
  }

  rot(): [number, number] {
    return [this.baseRotY + this.userYaw, Math.max(-1.25, Math.min(1.25, this.baseRotX + this.userPitch))];
  }

  // perspective ray cast from the camera through every buffer pixel, so the
  // off-axis sphere matches the WebGL render (shape, turn and terminator)
  shade(): void {
    const d = this.buf.width;
    const bctx = this.buf.getContext('2d');
    if (!bctx || d === 0) return;
    const out = bctx.createImageData(d, d);
    const px = out.data, tex = this.tex;
    const [ry, rx] = this.rot();
    const cy = Math.cos(-ry), sy = Math.sin(-ry), cx = Math.cos(-rx), sx = Math.sin(-rx);
    const { w, h, gx } = this;
    const aspect = w / h;
    const Cx = gx, Cy = GY, Cz = -CAM_Z;
    const CC = Cx * Cx + Cy * Cy + Cz * Cz;
    const R2 = SURFACE_R * SURFACE_R;
    const step = (2 * this.r) / d;
    // world size of one buffer pixel at the sphere, for a one-pixel soft limb
    const pxWorld = step * 2 * FOV_TAN * Math.sqrt(CC) / h;
    for (let j = 0; j < d; j++) {
      const Dy = -(((this.cy - this.r + (j + 0.5) * step) / h) * 2 - 1) * FOV_TAN;
      for (let i = 0; i < d; i++) {
        const Dx = (((this.cx - this.r + (i + 0.5) * step) / w) * 2 - 1) * FOV_TAN * aspect;
        const DD = Dx * Dx + Dy * Dy + 1;
        const b = Dx * Cx + Dy * Cy - Cz;
        const perp2 = CC - b * b / DD;
        if (perp2 >= R2) continue;
        const t = (b - Math.sqrt(b * b - DD * (CC - R2))) / DD;
        const vx = (t * Dx - Cx) / SURFACE_R, vy = (t * Dy - Cy) / SURFACE_R, vz = (-t - Cz) / SURFACE_R;
        // world -> local: undo Rx then Ry (three's XYZ euler is Rx * Ry)
        const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
        const lx = vx * cy + z1 * sy, lz = -vx * sy + z1 * cy;
        const diff = Math.max(0, vx * L[0] + vy * L[1] + vz * L[2]) * KEY;
        let r = toLin[DARK[0]], g = toLin[DARK[1]], bl = toLin[DARK[2]];
        if (tex) {
          // equirectangular, stored south-up like the WebGL texture
          const u = (Math.atan2(lz, -lx) / (2 * Math.PI) + 1) % 1;
          const v = Math.asin(Math.max(-1, Math.min(1, y1))) / Math.PI + 0.5;
          const k = (Math.min(TEX_H - 1, (v * TEX_H) | 0) * TEX_W + Math.min(TEX_W - 1, (u * TEX_W) | 0)) * 4;
          r = toLin[tex[k]]; g = toLin[tex[k + 1]]; bl = toLin[tex[k + 2]];
        }
        const o = (j * d + i) * 4;
        px[o] = toOut[0][Math.min(4095, (r * (AMB[0] + diff) * 4095) | 0)];
        px[o + 1] = toOut[1][Math.min(4095, (g * (AMB[1] + diff) * 4095) | 0)];
        px[o + 2] = toOut[2][Math.min(4095, (bl * (AMB[2] + diff) * 4095) | 0)];
        px[o + 3] = Math.min(255, (SURFACE_R - Math.sqrt(perp2)) / pxWorld * 255);
      }
    }
    bctx.putImageData(out, 0, 0);
  }

  project(lat: number, lon: number): Projected | null {
    const [x, y, z] = unit(lat, lon);
    const [ry, rx] = this.rot();
    const x1 = x * Math.cos(ry) + z * Math.sin(ry), z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    const y2 = y * Math.cos(rx) - z1 * Math.sin(rx), z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
    const R = SURFACE_R * PIN_R;
    const Px = this.gx + x1 * R, Py = GY + y2 * R, Pz = -CAM_Z + z2 * R;
    const aspect = this.w / this.h;
    return {
      x: (Px / (-Pz * FOV_TAN * aspect) * 0.5 + 0.5) * this.w,
      y: (-Py / (-Pz * FOV_TAN) * 0.5 + 0.5) * this.h,
      // facing the camera (which sits at the origin)
      visible: x1 * Px + y2 * Py + z2 * Pz < 0,
    };
  }

  addDrag(): void {
    const el = this.canvasEl;
    el.style.touchAction = 'pan-y';
    let dragging = false, lx = 0, ly = 0;
    const pointers = new Set<number>();
    const overGlobe = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      return Math.hypot(e.clientX - b.left - this.cx, e.clientY - b.top - this.cy) < this.r;
    };
    const down = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      if (pointers.size === 2) { dragging = false; return; }
      if (!overGlobe(e)) return;
      dragging = true; el.style.cursor = 'grabbing'; lx = e.clientX; ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (pointers.size === 2) return;
      if (!dragging) {
        if (e.target === el) el.style.cursor = overGlobe(e) ? 'grab' : 'default';
        return;
      }
      this.userYaw += (e.clientX - lx) * 0.006;
      this.userPitch = Math.max(-1.1, Math.min(1.1, this.userPitch + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
      this.dirty = true;
    };
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); dragging = false; el.style.cursor = 'grab'; };
    const cancel = (e: PointerEvent) => { pointers.delete(e.pointerId); dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    this._cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    });
  }

  animate = (): void => {
    if (this._destroyed) return;
    this._raf = requestAnimationFrame(this.animate);
    const { ctx, w, h } = this;
    if (this.dirty) { this.dirty = false; this.shade(); }

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.buf, this.cx - this.r, this.cy - this.r, this.r * 2, this.r * 2);

    if (!this._shown) {
      this._shown = true;
      requestAnimationFrame(() => { this.canvasEl.style.opacity = '1'; });
    }
    this.onFrame();
  };
}
