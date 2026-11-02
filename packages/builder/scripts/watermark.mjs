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

const text = process.env.WATERMARK_TEXT ?? "(c) Giancarlo Frison";
const image = process.env.WATERMARK_IMAGE;
const opacity = Number(process.env.WATERMARK_OPACITY ?? 0.55);
const rasterExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const heicExtensions = new Set([".heic", ".heif", ".hif"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => `&#${character.codePointAt(0)};`);
}

async function overlayFor(width) {
  if (image) {
    return sharp(image)
      .resize({ width: Math.round(width * 0.2) })
      .ensureAlpha()
      .linear([1, 1, 1, opacity], [0, 0, 0, 0])
      .extend({
        right: Math.round(width * 0.02),
        bottom: Math.round(width * 0.02),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  const size = Math.max(14, Math.round(width * 0.028));
  const overlayWidth = Math.round(size * (text.length * 0.62 + 2));
  const height = Math.round(size * 1.8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${overlayWidth}" height="${height}">
    <text x="${overlayWidth - size * 0.5}" y="${height * 0.68}" text-anchor="end"
      font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}"
      fill="#fff" fill-opacity="${opacity}" stroke="#000" stroke-opacity="${opacity * 0.6}"
      stroke-width="${size * 0.06}" paint-order="stroke">${escapeXml(text)}</text></svg>`;
  return Buffer.from(svg);
}

async function stamp(input, output) {
  const base = sharp(input, { failOn: "none" }).rotate();
  const { width } = await base
    .clone()
    .toBuffer({ resolveWithObject: true })
    .then((result) => result.info);
  const overlay = await overlayFor(width);
  const extension = extname(output).toLowerCase();
  let pipeline = base
    .composite([{ input: overlay, gravity: "southeast" }])
    .keepExif();
  if (extension === ".jpg" || extension === ".jpeg") {
    pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
  }
  await pipeline.toFile(output);
}

let done = 0;
for (const file of walk(src)) {
  const rel = relative(src, file);
  const extension = extname(file).toLowerCase();
  const target = join(dest, rel);
  mkdirSync(join(target, ".."), { recursive: true });

  if (rasterExtensions.has(extension)) {
    await stamp(readFileSync(file), target);
    await exiftool.write(target, {}, {
      writeArgs: ["-TagsFromFile", file, "-GPS:all", "-overwrite_original"],
    });
    done++;
  } else if (heicExtensions.has(extension)) {
    const jpeg = Buffer.from(
      await heicConvert({
        buffer: readFileSync(file),
        format: "JPEG",
        quality: 0.95,
      }),
    );
    const output = join(dest, `${rel.slice(0, -extension.length)}.jpg`);
    await stamp(jpeg, output);
    await exiftool.write(
      output,
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
    cpSync(file, target);
  }
}

await exiftool.end();
console.warn(`watermarked ${done} photos into ${dest}`);