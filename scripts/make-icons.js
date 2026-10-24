// Draws the PNG app icons (src/icon-192.png, src/icon-512.png) from the same shapes as src/icon.svg.
// Phones use PNGs for the home screen and for notifications. Run: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GREEN = [0x14, 0x6c, 0x4b], WHITE = [255, 255, 255], MINT = [0x9f, 0xe0, 0xb8];
const LINE = [[118, 176], [170, 344], [214, 224], [256, 344], [300, 224], [344, 344], [394, 176]]; // the "W", on a 512 grid
const DOT = { x: 256, y: 398, r: 22 };

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function colourAt(x, y) { // x, y on the 512 grid
  for (let i = 0; i < LINE.length - 1; i++) if (segDist(x, y, LINE[i], LINE[i + 1]) <= 20) return WHITE;
  if (Math.hypot(x - DOT.x, y - DOT.y) <= DOT.r) return MINT;
  return GREEN;
}
function draw(size) {
  const k = 512 / size, ss = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) { const c = colourAt((x + (sx + .5) / ss) * k, (y + (sy + .5) / ss) * k); acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2] }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = acc[0] / (ss * ss); raw[o + 1] = acc[1] / (ss * ss); raw[o + 2] = acc[2] / (ss * ss); raw[o + 3] = 255;
    }
  }
  return png(size, size, raw);
}
function crc32(buf) { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c } return (crc ^ 0xffffffff) >>> 0 }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [192, 512]) {
  const out = path.join(__dirname, '..', 'src', `icon-${size}.png`);
  fs.writeFileSync(out, draw(size));
  console.log('wrote', path.relative(process.cwd(), out));
}
