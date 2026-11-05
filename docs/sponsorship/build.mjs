// packet.html + the site's tiers and roster -> PDF -> website page previews.
// Run from anywhere: node docs/sponsorship/build.mjs [--draft]
// --draft writes to output/packet-draft and leaves the website's files alone.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE = join(ROOT, 'public/sponsorship');
const PAGES = 5; // keep in step with PACKET_PAGE_COUNT in src/pages/sponsors/SponsorsPage.tsx
process.chdir(ROOT);

// The site's own data, so the packet and the Sponsors page can't disagree.
const bundle = await rolldown({ input: 'src/data/content.ts' });
const { output } = await bundle.generate({ format: 'esm' });
const { TIERS, CROWDFUNDING, MEMBERS, MEMBER_COUNT } = await import(`data:text/javascript,${encodeURIComponent(output[0].code)}`);
const contact = MEMBERS.find((m) => m.subteam === 'Business' && m.lead);

// Colors sampled from the original pyramid; text color picked for contrast on each band.
const BANDS = {
  Diamond: { fill: '#7d1fbe', ink: '#fff', height: 130 },
  Ruby: { fill: '#c92556', ink: '#fff', height: 86 },
  Topaz: { fill: '#c1703f', ink: '#000', height: 86 },
  Quartz: { fill: '#6d9dcd', ink: '#000', height: 86 },
};
const APEX = { x: 206, y: 358 }, BASE_Y = 758, HALF_BASE = 172, GAP = 4, TEXT_GAP = 14, RIGHT = 578;

function pyramid() {
  const slope = HALF_BASE / (BASE_Y - APEX.y);
  let top = APEX.y, shapes = '', blocks = '';
  for (const tier of [...TIERS].reverse()) {
    const { fill, ink, height } = BANDS[tier.name];
    const bottom = top + height;
    const half = (y) => (y - APEX.y) * slope;
    const points = [[APEX.x - half(top), top], [APEX.x + half(top), top], [APEX.x + half(bottom), bottom], [APEX.x - half(bottom), bottom]];
    // The apex is too narrow to center in, so its amount sits low where the band is widest.
    const baseline = top === APEX.y ? bottom - 10 : top + height / 2 + 5;
    shapes += `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`
      + `<text class="amount" x="${APEX.x}" y="${baseline}" fill="${ink}">${tier.amount}</text>`;
    const left = APEX.x + half(bottom) + TEXT_GAP;
    const perks = tier.perks.filter((perk) => !perk.startsWith('Everything in'));
    blocks += `<div class="tier" style="--c:${fill};left:${left}pt;width:${RIGHT - left}pt;bottom:${792 - bottom}pt">`
      + `<h2>${tier.name.toUpperCase()}</h2><ul>${perks.map((perk) => `<li>${perk}</li>`).join('')}</ul></div>`;
    top = bottom + GAP;
  }
  return `<svg class="at" style="left:0;top:0" width="612pt" height="792pt" viewBox="0 0 612 792" aria-hidden="true">${shapes}</svg>${blocks}`;
}

// The page's one QR goes to the campaign while it runs, then back to the site.
const giving = Date.now() < Date.parse(CROWDFUNDING.end);

const html = readFileSync(join(HERE, 'packet.html'), 'utf8')
  .replaceAll('{{students}}', String(MEMBER_COUNT))
  .replace('{{pyramid}}', pyramid())
  .replace(/<!-- crowdfunding[\s\S]*?<!-- \/crowdfunding -->/, giving ? '$&' : '')
  .replaceAll('{{qr_url}}', giving ? CROWDFUNDING.url : 'https://www.cornellgeodata.com/')
  .replace('{{qr_src}}', giving ? 'assets/qr-crowdfunding.png' : 'assets/qr.png')
  .replace('{{give_until}}', new Date(CROWDFUNDING.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' }))
  .replace('{{give_label}}', CROWDFUNDING.url.replace('https://', ''))
  .replaceAll('{{give_url}}', CROWDFUNDING.url)
  .replaceAll('{{contact_name}}', contact.name);

const work = mkdtempSync(join(tmpdir(), 'geodata-packet-'));
const page = join(HERE, '.packet.build.html'); // beside packet.html so its relative asset paths resolve
const pdf = join(work, 'packet.pdf');
try {
  writeFileSync(page, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--generate-pdf-document-outline',
    '--allow-file-access-from-files', `--user-data-dir=${join(work, 'chrome')}`, `--print-to-pdf=${pdf}`, `file://${page}`], { stdio: 'ignore' });
} finally {
  rmSync(page, { force: true });
}

// Outside check on the finished PDF, not the HTML that was meant to produce it.
const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
const count = Number(/Pages:\s+(\d+)/.exec(info)[1]);
if (count !== PAGES) throw new Error(`expected ${PAGES} pages, got ${count}`);
const fonts = execFileSync('pdffonts', [pdf], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean);
if (!fonts.length || fonts.some((f) => !/\byes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(f))) throw new Error(`font not embedded:\n${fonts.join('\n')}`);
// A glyph missing from our fonts falls back silently (Lusitana has no curly apostrophe, for one).
const strays = fonts.filter((f) => !/\+(Intan|Lusitana)/.test(f));
if (strays.length) throw new Error(`fallback font in the packet:\n${strays.join('\n')}`);
const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
if (/[\u2014\u00b7\u2022]/.test(text)) throw new Error('banned separator character in the packet');
for (const [p, words] of execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('<page ').slice(1).entries()) {
  for (const [, x0, y0, x1, y1, word] of words.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g)) {
    if (+x0 < 33 || +x1 > 579.5 || +y0 < 18 || +y1 > 764) throw new Error(`page ${p + 1}: "${word}" leaves the content area (${x0}, ${y0}, ${x1}, ${y1})`);
  }
}

const draft = process.argv.includes('--draft');
const out = draft ? join(ROOT, 'output/packet-draft') : SITE;
execFileSync('mkdir', ['-p', out]);
copyFileSync(pdf, join(out, 'packet.pdf'));
execFileSync('pdftoppm', ['-png', '-scale-to', '1800', pdf, join(work, 'p')]);
for (const f of readdirSync(out)) if (/^page-\d+\.webp$/.test(f)) rmSync(join(out, f));
for (const f of readdirSync(work).filter((name) => /^p-\d+\.png$/.test(name)).sort()) {
  const n = /\d+/.exec(f)[0].padStart(2, '0');
  await sharp(join(work, f)).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(join(out, `page-${n}.webp`));
}
rmSync(work, { recursive: true, force: true });
console.log(`${out}: ${count} pages, ${(readFileSync(join(out, 'packet.pdf')).length / 1e6).toFixed(1)} MB`);
