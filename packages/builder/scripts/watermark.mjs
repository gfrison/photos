// Watermark every photo from SRC into DEST before the gallery build.
// Usage: node scripts/watermark.mjs <srcDir> <destDir>
//   WATERMARK_TEXT   text to draw (default "© Giancarlo Frison")
//   WATERMARK_IMAGE  optional PNG (transparent) used instead of text
//   WATERMARK_OPACITY 0-1 (default 0.55)
// The source folder is never modified. HEIC/HEIF/HIF are converted to JPEG
// (same base name, so photo IDs stay the same) and their EXIF is copied over.
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { extname, join, relative } from "node:path";

import { exiftool } from "exiftool-vendored";
import heicConvert from "heic-convert";
import sharp from "sharp";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  throw new Error("usage: node watermark.mjs <srcDir> <destDir>");
}

const TEXT = process.env.WATERMARK_TEXT ?? "© Giancarlo Frison";
const IMAGE = process.env.WATERMARK_IMAGE;
const OPACITY = Number(process.env.WATERMARK_OPACITY ?? 0.55);
const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const HEIC = new Set([".heic", ".heif", ".hif"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const escapeXml = (s) => s.replaceAll(/[<>&"']/g, (c) => `&#${c.codePointAt(0)};`);

async function overlayFor(width) {
  if (IMAGE) {
    return sharp(IMAGE)
      .resize({ width: Math.round(width * 0.2) })
      .ensureAlpha()
      .linear([1, 1, 1, OPACITY], [0, 0, 0, 0]) // scale alpha only
      .extend({
        right: Math.round(width * 0.02),
        bottom: Math.round(width * 0.02),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }
  const size = Math.max(14, Math.round(width * 0.028));
  const w = Math.round(size * (TEXT.length * 0.62 + 2));
  const h = Math.round(size * 1.8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="${w - size * 0.5}" y="${h * 0.68}" text-anchor="end"
      font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}"
      fill="#fff" fill-opacity="${OPACITY}" stroke="#000" stroke-opacity="${OPACITY * 0.6}"
      stroke-width="${size * 0.06}" paint-order="stroke">${escapeXml(TEXT)}</text></svg>`;
  return Buffer.from(svg);
}

async function stamp(input, out) {
  const base = sharp(input, { failOn: "none" }).rotate(); // auto-orient, drops Orientation tag
  const { width } = await base
    .clone()
    .toBuffer({ resolveWithObject: true })
    .then((r) => r.info);
  const overlay = await overlayFor(width);
  const ext = extname(out).toLowerCase();
  let pipe = base
    .composite([{ input: overlay, gravity: "southeast" }])
    .keepExif();
  if (ext === ".jpg" || ext === ".jpeg")
    pipe = pipe.jpeg({ quality: 92, mozjpeg: true });
  await pipe.toFile(out);
}

let done = 0;
for (const file of walk(src)) {
  const rel = relative(src, file);
  const ext = extname(file).toLowerCase();
  const target = join(dest, rel);
  mkdirSync(join(target, ".."), { recursive: true });
  if (RASTER.has(ext)) {
    await stamp(readFileSync(file), target);
    done++;
  } else if (HEIC.has(ext)) {
    const jpg = Buffer.from(
      await heicConvert({
        buffer: readFileSync(file),
        format: "JPEG",
        quality: 0.95,
      }),
    );
    const out = join(dest, `${rel.slice(0, -ext.length)  }.jpg`);
    await stamp(jpg, out);
    // heic-convert drops metadata: copy capture date, camera, GPS, etc.
    await exiftool.write(
      out,
      {},
      {
        writeArgs: [
          "-TagsFromFile",
          file,
          "-all:all",
          "-Orientation=",
          "-overwrite_original",
        ],
      },
    );
    done++;
  } else {
    cpSync(file, target); // videos, Live Photo sidecars, etc.
  }
}
await exiftool.end();
console.warn(`watermarked ${done} photos into ${dest}`);
