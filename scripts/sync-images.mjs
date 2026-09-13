import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Give every <img> an intrinsic size and lazy-loading behaviour.
 *
 * 92 of 584 images had no width/height, so the browser cannot reserve space for
 * them and the page shifts as they arrive (CLS). 213 had no loading hint, so
 * every below-the-fold image was fetched eagerly.
 *
 * Dimensions are read straight from the PNG/JPEG/GIF/WebP headers — no image
 * library dependency. SVG is skipped (it scales without an intrinsic size).
 * Idempotent.
 */

const rootPath = new URL('../', import.meta.url).pathname;

function dims(buf) {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.toString('ascii', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o += 1; continue; }
      const marker = buf[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
      }
      o += 2 + len;
    }
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    const u24 = (at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
    if (fmt === 'VP8X') return [u24(24) + 1, u24(27) + 1];
    if (fmt === 'VP8 ') {
      const sync = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      if (sync !== -1) return [buf.readUInt16LE(sync + 3) & 0x3fff, buf.readUInt16LE(sync + 5) & 0x3fff];
    }
    if (fmt === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
  }
  return null;
}

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const sizeCache = new Map();
function sizeOf(absImage) {
  if (!sizeCache.has(absImage)) {
    sizeCache.set(absImage, existsSync(absImage) ? dims(readFileSync(absImage)) : null);
  }
  return sizeCache.get(absImage);
}

const pages = collect(rootPath);
let sizeless = 0;
let lazyApplied = 0;
let unresolved = 0;

for (const path of pages) {
  const route = relative(rootPath, path).split(sep).join('/');
  const pageDir = route.includes('/') ? route.slice(0, route.lastIndexOf('/')) : '';
  let html = await readFile(path, 'utf8');
  const headerEnd = html.indexOf('</header>');

  html = html.replace(/<img\b[^>]*>/g, (tag, offset) => {
    const inHeader = headerEnd !== -1 && offset < headerEnd;
    let out = tag;
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];

    if (src && !/^(?:https?:|data:)/.test(src) && !/\bwidth="/.test(out) && !/\bheight="/.test(out)) {
      const clean = src.split('?')[0].split('#')[0];
      const abs = clean.startsWith('/') ? join(rootPath, clean.slice(1)) : join(rootPath, pageDir, clean);
      const size = sizeOf(abs);
      if (size) {
        out = out.replace(/<img\b/, `<img width="${size[0]}" height="${size[1]}"`);
        sizeless += 1;
      } else {
        unresolved += 1;
      }
    }
    if (!inHeader && !/\bloading="/.test(out)) {
      out = out.replace(/<img\b/, '<img loading="lazy" decoding="async"');
      lazyApplied += 1;
    }
    return out;
  });

  if (html !== await readFile(path, 'utf8')) await writeFile(path, html);
}

console.log(`Images: added intrinsic size to ${sizeless}, lazy/async to ${lazyApplied}, unresolved ${unresolved}.`);
