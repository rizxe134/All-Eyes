import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(path.join(dir, '..', 'public', 'logo.svg'));

const png = await sharp(svg)
  .resize(512, 352, { kernel: 'nearest', fit: 'fill' })
  .extend({
    top: 80,
    bottom: 80,
    left: 0,
    right: 0,
    background: '#041208',
  })
  .png()
  .toBuffer();

writeFileSync(path.join(dir, 'icon.png'), png);

// Modern icns: one 512×512 PNG under the ic09 type. No Apple iconutil required.
const type = Buffer.from('ic09');
const chunkSize = Buffer.alloc(4);
chunkSize.writeUInt32BE(png.length + 8);
const header = Buffer.alloc(8);
header.write('icns', 0);
header.writeUInt32BE(8 + 8 + png.length, 4);
writeFileSync(path.join(dir, 'icon.icns'), Buffer.concat([header, type, chunkSize, png]));
console.log('wrote desktop/icon.png and desktop/icon.icns');
