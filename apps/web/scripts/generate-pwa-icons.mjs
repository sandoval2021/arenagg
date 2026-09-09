import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const COLORS = {
  navyTop: [5, 24, 61],
  navyBottom: [2, 12, 31],
  blueGlow: [20, 74, 184],
  gold: [245, 190, 61],
  goldLight: [255, 222, 125],
  goldDark: [168, 105, 10],
};

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgb) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 3 + 1);
    rows[offset] = 0;
    rgb.copy(rows, offset + 1, y * width * 3, (y + 1) * width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function blend(base, over, alpha) {
  const inv = 1 - alpha;
  return [
    Math.round(base[0] * inv + over[0] * alpha),
    Math.round(base[1] * inv + over[1] * alpha),
    Math.round(base[2] * inv + over[2] * alpha),
  ];
}

function createCanvas(size) {
  const rgb = Buffer.alloc(size * size * 3);

  function pixel(x, y, color, alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 3;
    const base = [rgb[index], rgb[index + 1], rgb[index + 2]];
    const out = alpha >= 1 ? color : blend(base, color, alpha);
    rgb[index] = out[0];
    rgb[index + 1] = out[1];
    rgb[index + 2] = out[2];
  }

  function rect(x, y, width, height, color, alpha = 1) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(size, Math.ceil(y + height)); yy += 1) {
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(size, Math.ceil(x + width)); xx += 1) {
        pixel(xx, yy, color, alpha);
      }
    }
  }

  function ellipse(cx, cy, rx, ry, color, alpha = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(size - 1, Math.ceil(cy + ry)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(size - 1, Math.ceil(cx + rx)); x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) pixel(x, y, color, alpha);
      }
    }
  }

  function line(x1, y1, x2, y2, width, color, alpha = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const radius = Math.max(0.5, width / 2);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      ellipse(x1 + dx * t, y1 + dy * t, radius, radius, color, alpha);
    }
  }

  return { rgb, pixel, rect, ellipse, line };
}

function drawIcon(size) {
  const canvas = createCanvas(size);
  const { rgb, pixel, rect, ellipse, line } = canvas;
  const scale = size / 512;

  for (let y = 0; y < size; y += 1) {
    const t = y / Math.max(1, size - 1);
    const color = COLORS.navyTop.map((value, index) =>
      Math.round(value * (1 - t) + COLORS.navyBottom[index] * t),
    );
    for (let x = 0; x < size; x += 1) pixel(x, y, color);
  }

  const glowX = size * 0.5;
  const glowY = size * 0.34;
  const glowRadius = size * 0.38;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - glowX, y - glowY) / glowRadius;
      if (distance < 1) pixel(x, y, COLORS.blueGlow, (1 - distance) * 0.23);
    }
  }

  const gold = COLORS.gold;
  const light = COLORS.goldLight;
  const dark = COLORS.goldDark;

  rect(158 * scale, 86 * scale, 196 * scale, 116 * scale, gold);
  ellipse(158 * scale, 144 * scale, 42 * scale, 58 * scale, gold);
  ellipse(354 * scale, 144 * scale, 42 * scale, 58 * scale, gold);
  ellipse(158 * scale, 144 * scale, 25 * scale, 40 * scale, COLORS.navyTop);
  ellipse(354 * scale, 144 * scale, 25 * scale, 40 * scale, COLORS.navyTop);
  rect(178 * scale, 86 * scale, 156 * scale, 34 * scale, light);
  rect(239 * scale, 196 * scale, 34 * scale, 67 * scale, gold);
  rect(201 * scale, 253 * scale, 110 * scale, 28 * scale, light);
  line(163 * scale, 202 * scale, 201 * scale, 193 * scale, 7 * scale, dark, 0.65);
  line(349 * scale, 202 * scale, 311 * scale, 193 * scale, 7 * scale, dark, 0.65);

  const word = 'CHAVEA';
  const cell = Math.max(2, Math.round(8 * scale));
  const glyphWidth = 5 * cell;
  const gap = Math.max(2, Math.round(2.4 * scale));
  const totalWidth = word.length * glyphWidth + (word.length - 1) * gap;
  let textX = Math.round((size - totalWidth) / 2);
  const textY = Math.round(306 * scale);

  for (const letter of word) {
    const glyph = FONT[letter];
    for (let gy = 0; gy < 7; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if (glyph[gy][gx] !== '1') continue;
        rect(textX + gx * cell + Math.max(1, Math.round(scale)), textY + gy * cell + Math.max(1, Math.round(2 * scale)), cell, cell, dark, 0.85);
        rect(textX + gx * cell, textY + gy * cell, cell, cell, light);
      }
    }
    textX += glyphWidth + gap;
  }

  const bracketY = 405 * scale;
  const width = Math.max(2, 4 * scale);
  line(112 * scale, bracketY, 221 * scale, bracketY, width, gold);
  line(112 * scale, bracketY - 30 * scale, 112 * scale, bracketY, width, gold);
  line(400 * scale, bracketY, 291 * scale, bracketY, width, gold);
  line(400 * scale, bracketY - 30 * scale, 400 * scale, bracketY, width, gold);
  line(221 * scale, bracketY, 221 * scale, bracketY + 31 * scale, width, gold);
  line(291 * scale, bracketY, 291 * scale, bracketY + 31 * scale, width, gold);
  line(221 * scale, bracketY + 31 * scale, 291 * scale, bracketY + 31 * scale, width, gold);
  line(256 * scale, bracketY + 31 * scale, 256 * scale, bracketY + 62 * scale, width, gold);
  ellipse(256 * scale, bracketY + 68 * scale, 7 * scale, 7 * scale, light);

  return encodePng(size, size, rgb);
}

const publicDir = resolve(process.cwd(), 'public');
const iconsDir = resolve(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

for (const size of [180, 192, 512]) {
  const target = size === 180
    ? resolve(publicDir, 'apple-touch-icon.png')
    : resolve(iconsDir, `chavea-${size}.png`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, drawIcon(size));
  console.log(`[pwa] generated ${target}`);
}
