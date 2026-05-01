#!/usr/bin/env node
// Generates PNG app icons from the favicon SVG design (orange circle + clock)
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function createPNG(size) {
  const half = size / 2;
  const outerR = half * 0.90;
  const ringR  = half * 0.70;
  const ringW  = size * 0.03;
  const dotR   = size * 0.06;

  // Orange fill: #fb923c → 251, 146, 60
  // Ring/hands: white → 255, 255, 255
  // Background: #0f172a (dark) → 15, 23, 42

  const raw = Buffer.alloc(size * (size * 3 + 1));

  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter byte per row
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      const cx = x - half + 0.5;
      const cy = y - half + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);

      let R, G, B;

      if (dist <= outerR) {
        // Inside orange circle
        R = 251; G = 146; B = 60;

        // White ring
        if (Math.abs(dist - ringR) <= ringW) {
          R = 255; G = 255; B = 255;
        }

        // White hour hand: 12-o'clock position, pointing up
        // A line from center (0,0) up to (0, -ringR*0.7)
        const handLen = ringR * 0.65;
        const handW   = size * 0.03;
        // Parametric distance from the segment (0,0)→(0,-handLen)
        const t = Math.max(0, Math.min(1, (-cy) / handLen));
        const px = cx - 0;
        const py = cy - (-handLen * t);
        if (cx >= -handW && cx <= handW && cy >= -handLen && cy <= 0) {
          R = 255; G = 255; B = 255;
        }

        // White minute hand: pointing to 3-o'clock (positive x)
        const mLen = ringR * 0.55;
        if (cy >= -handW && cy <= handW && cx >= 0 && cx <= mLen) {
          R = 255; G = 255; B = 255;
        }

        // Center dot
        if (dist <= dotR) {
          R = 255; G = 255; B = 255;
        }
      } else {
        // Background
        R = 15; G = 23; B = 42;
      }

      raw[offset]     = R;
      raw[offset + 1] = G;
      raw[offset + 2] = B;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function crc32(buf) {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf  = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const crcBuf  = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);  // 8-bit depth
  ihdr.writeUInt8(2, 9);  // RGB color type

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512, 180]) {
  const png = createPNG(size);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`Created ${file} (${png.length} bytes)`);
}
