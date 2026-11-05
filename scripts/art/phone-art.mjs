// Phone copies of the home page's art. Phones draw these maps and globes no sharper than this, and every pixel costs
// 4 bytes of memory to show, whatever the file size: the full set is what got the page killed on iPhones.
// usage: phone-art.mjs <public dir>
import sharp from 'sharp';
const [pub] = process.argv.slice(2);
const copies = [
  ['earth-4k.webp', 'earth-2k.webp', 2048, { quality: 80 }],
  ['art/earth-ne.webp', 'art/earth-ne-phone.webp', 1012, { quality: 60, alphaQuality: 40 }],
  ['art/earth-ny.webp', 'art/earth-ny-phone.webp', 1280, { quality: 60, alphaQuality: 40 }],
  ['art/region.webp', 'art/region-phone.webp', 1350, { quality: 60, alphaQuality: 35 }],
  ['art/terrain.webp', 'art/terrain-phone.webp', 1564, { quality: 80 }],
];
for (const [from, to, width, options] of copies) {
  const { size } = await sharp(`${pub}/${from}`).resize({ width }).webp({ ...options, effort: 6 }).toFile(`${pub}/${to}`);
  console.log(to, width, size >> 10, 'KB');
}
