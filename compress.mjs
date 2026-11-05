// emit .br and .gz next to every compressible dist file so server.mjs can
// serve them precompressed
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import sharp from 'sharp';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const EXTS = new Set(['.js', '.css', '.html', '.svg', '.json', '.glb', '.stl', '.urdf']);

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(p);
    } else if (entry.name === '.DS_Store') {
      // vite copies public/ verbatim, so a Finder-created .DS_Store ships to prod
      await fs.unlink(p);
    } else if (EXTS.has(path.extname(entry.name))) {
      const buf = await fs.readFile(p);
      await fs.writeFile(p + '.br', await brotli(buf, {
        // Binary CAD meshes compress well at level 5 without a lengthy build.
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: path.extname(p) === '.stl' ? 5 : 11 },
      }));
      await fs.writeFile(p + '.gz', await gzip(buf, { level: 9 }));
      console.log(`${p}: ${buf.length} -> br ${(await fs.stat(p + '.br')).size}`);
    }
  }
}

// A desktop tile is about 240 css px. A sharp small copy looks better than the browser shrinking a 1400px
// photo, and it is a tenth of the download. Phones show two tiles a row, so they take it too.
for (const f of await fs.readdir('dist/members')) {
  if (!f.endsWith('.webp') || f.endsWith('-600.webp')) continue;
  await sharp(`dist/members/${f}`).resize({ width: 600, withoutEnlargement: true }).webp({ quality: 86, effort: 6, smartSubsample: true }).toFile(`dist/members/${f.replace('.webp', '-600.webp')}`);
}

// The home page's photos, for phones: some are 2000px wide, and each costs its full size in memory to show.
for (const f of [...(await fs.readdir('dist/projects')).map((n) => `projects/${n}`), 'team.webp']) {
  if (!f.endsWith('.webp') || f.endsWith('-800.webp')) continue;
  await sharp(`dist/${f}`).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(`dist/${f.replace('.webp', '-800.webp')}`);
}

await walk('dist');
