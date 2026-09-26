/**
 * Minimal PNG decoder for tests (8-bit RGB / RGBA, non-interlaced: what next/og's resvg writes). Lets layout tests
 * inspect rendered share cards without adding an image library.
 */
import { inflateSync } from 'zlib';

export interface DecodedPng { width: number; height: number; channels: 3 | 4; data: Uint8Array }

export function decodePng(buf: Uint8Array): DecodedPng {
  const b = Buffer.from(buf);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0, height = 0, channels: 3 | 4 = 4;
  const idat: Buffer[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const body = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body[8], colorType = body[9], interlace = body[12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace})`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let v: number;
      if (filter === 0) v = cur;
      else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + up;
      else if (filter === 3) v = cur + ((a + up) >> 1);
      else if (filter === 4) {
        const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? up : ul);
      } else throw new Error(`bad PNG filter ${filter}`);
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

export function pixel(img: DecodedPng, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
