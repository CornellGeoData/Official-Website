// Does the home page still fit on a phone? Fails if memory, first download, toolbar resizes or scroll motion pass
// their budgets, measured on an emulated iPhone. A tab killed by iOS is the failure this guards against: footprint
// is the counter the system judges it by, read here from WebKit's real processes (macOS only).
//
// usage: npm run build && npm start, then in another shell: npm run check:mobile [origin]
// first time: npx playwright install webkit chromium
//
// The motion test flicks with real touch input, because a steady scripted scroll hides everything that makes this
// page feel choppy: flicks, coasts, re-flicks and reversals with input arriving out of step with frames.
import { execSync } from 'node:child_process';
import { chromium, devices, webkit } from 'playwright';

const origin = process.argv[2] ?? 'http://localhost:4173';
const BUDGET = { heroMB: 260, scrollingMB: 550, firstViewKB: 700, canvasResetsPerResize: 0, droppedFrames: 3, worstFrameMs: 100 };
const failures = [];
const check = (name, value, limit) => {
  const ok = value <= limit;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${value} (budget ${limit})`);
  if (!ok) failures.push(name);
};

// Throws rather than reads as 0 MB, which would pass every budget without having measured anything.
const footprintMB = () => {
  const lines = execSync("ps -axo pid=,command= | grep ms-playwright/webkit | grep -E 'WebContent|GPU|WebProcess' | grep -v grep || true", { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const mb = lines.reduce((sum, line) => {
    const m = execSync(`footprint ${parseInt(line, 10)} 2>/dev/null || true`, { encoding: 'utf8' }).match(/Footprint:\s*([\d.]+)\s*(KB|MB|GB)/);
    return sum + (m ? Number(m[1]) * { KB: 1 / 1024, MB: 1, GB: 1024 }[m[2]] : 0);
  }, 0);
  if (!mb) throw new Error('Could not read WebKit memory: this check needs macOS and a Playwright WebKit install.');
  return mb;
};
// The still is far lighter than the globe, so a page that fell back to it passes everything without testing it.
const requireGlobe = async (page) => {
  if (await page.evaluate(() => !document.querySelector('canvas[data-engine]') || !!document.querySelector('.globe-fallback'))) throw new Error('The live globe did not mount, so this run would measure the still.');
};

async function memory() {
  const { defaultBrowserType: _, ...phone } = devices['iPhone 13'];
  const browser = await webkit.launch();
  const page = await (await browser.newContext({ ...phone, serviceWorkers: 'block' })).newPage();
  const sizes = [];
  page.on('requestfinished', async (r) => sizes.push((await r.sizes().catch(() => ({ responseBodySize: 0 }))).responseBodySize));
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await requireGlobe(page);
  check('hero footprint, MB', Math.round(footprintMB()), BUDGET.heroMB);
  check('first view download, KB', Math.round(sizes.reduce((a, b) => a + b, 0) / 1024), BUDGET.firstViewKB);
  const end = await page.evaluate(() => document.documentElement.scrollHeight);
  let worst = 0;
  for (let y = 300; y < end; y += 700) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(1200);
    worst = Math.max(worst, footprintMB());
  }
  check('worst footprint while moving down the page, MB', Math.round(worst), BUDGET.scrollingMB);
  await browser.close();
}

async function motion() {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await context.newPage();
  // A phone's toolbar fires resize mid-scroll with nothing changing size, and sizing a canvas reallocates it.
  await page.addInitScript(() => {
    window.resets = 0;
    for (const k of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k);
      Object.defineProperty(HTMLCanvasElement.prototype, k, { get() { return d.get.call(this); }, set(v) { window.resets++; d.set.call(this, v); } });
    }
  });
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await requireGlobe(page);
  check('canvas resets per toolbar resize', await page.evaluate(async () => {
    window.resets = 0;
    for (let i = 0; i < 10; i++) { window.dispatchEvent(new Event('resize')); await new Promise(requestAnimationFrame); }
    return window.resets / 10;
  }), BUDGET.canvasResetsPerResize);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { window.gaps = []; let last = 0; const log = (now) => { if (last) window.gaps.push(now - last); last = now; requestAnimationFrame(log); }; requestAnimationFrame(log); });
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let seed = 13;
  const rand = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
  for (let flick = 1; flick <= 28; flick++) {
    const up = flick % 7 === 0, distance = rand(120, 340), ms = rand(60, 170), steps = Math.max(4, Math.round(ms / 12));
    let y = up ? 300 : 650;
    await touch('touchStart', y);
    for (let i = 0; i < steps; i++) { y += ((up ? 1 : -1) * distance) / steps; await touch('touchMove', y); await sleep(ms / steps); }
    await touch('touchEnd');
    await sleep(rand(0, 1) < 0.5 ? rand(180, 500) : rand(700, 1500));
  }
  const { gaps, scrolled } = await page.evaluate(() => ({ gaps: window.gaps, scrolled: window.scrollY }));
  if (!gaps.length || scrolled < 500) throw new Error(`The flicks didn't scroll the page (ended at ${scrolled}px), so this run measured an idle page.`);
  check('frames over 50ms, flicking at 4x CPU', gaps.filter((g) => g > 50).length, BUDGET.droppedFrames);
  check('worst frame flicking at 4x CPU, ms', Math.round(Math.max(...gaps)), BUDGET.worstFrameMs);
  await browser.close();
}

await memory();
await motion();
if (failures.length) { console.error(`\nOver budget: ${failures.join(', ')}`); process.exit(1); }
console.log('\nAll within budget.');
