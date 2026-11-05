// Team art, master PNGs to web files. AVIF keeps color at full resolution, which is what thin colored
// lines need: measured on the Tech art, WebP tops out near 0.87 color similarity, AVIF reaches 0.99 in less space.
// WebP stays as the fallback for browsers without AVIF. usage: publish.mjs <art dir> <public art dir> [--mobile|team]
import sharp from 'sharp';
const [art, pub, mode] = process.argv.slice(2);
const teams = ['air', 'water', 'rock', 'data', 'tech', 'business'];
if (mode && mode !== '--mobile' && !['leadership', ...teams].includes(mode)) throw new Error(`Unknown team: ${mode}`);
if (mode === '--mobile') {
  // Clockwise 60-degree sectors share one download and one uninterrupted lake.
  const slices = await Promise.all(teams.map(async (name, i) => {
    const point = (degrees) => {
      const angle = degrees * Math.PI / 180;
      return `${600 + 1200 * Math.cos(angle)},${600 + 1200 * Math.sin(angle)}`;
    };
    const mask = Buffer.from(`<svg width="1200" height="1200"><polygon points="600,600 ${point(-120 + i * 60)} ${point(-60 + i * 60)}" fill="white"/></svg>`);
    return { input: await sharp(`${art}/lens-${name}-mobile.png`).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer() };
  }));
  // The full first layer also prevents antialiased wedge edges from exposing the background.
  await sharp(`${art}/lens-air-mobile.png`)
    .composite(slices).webp({ quality: 90, effort: 6, smartSubsample: true }).toFile(`${pub}/subteams-mobile.webp`);
} else for (const n of mode ? [mode] : ['leadership', ...teams]) {
  const src = `${art}/lens-${n}.png`;
  await sharp(src).avif({ quality: 72, effort: 6, chromaSubsampling: '4:4:4' }).toFile(`${pub}/${n}.avif`);
  await sharp(src).resize({ width: 1600 }).avif({ quality: 70, effort: 6, chromaSubsampling: '4:4:4' }).toFile(`${pub}/${n}-1600.avif`);
  await sharp(src).resize({ width: 2400 }).webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(`${pub}/${n}.webp`);
  await sharp(src).resize({ width: 1200 }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(`${pub}/${n}-1200.webp`);
}
