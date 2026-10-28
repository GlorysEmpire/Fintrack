/**
 * Draws the FinTrack app icons (public/icons/*.png) from simple shapes, so no
 * font or design file is needed. Run once after changing the design:
 *
 *   node apps/web/scripts/make-icons.mjs
 *
 * "maskable" icons keep everything inside the central safe zone, because phones
 * crop them into circles and rounded squares.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "icons");
mkdirSync(out, { recursive: true });

const BG = "#0c1210";
const GREEN = "#34d399";
const GREEN_DARK = "#10b981";

/** Three rising bars: money growing, plainly. `scale` shrinks the artwork for the maskable safe zone. */
function svg(size, scale, rounded) {
  const s = size;
  const u = (s * scale) / 10000; // one unit of the 100x100 artwork, drawn at `scale` percent of the icon
  const ox = (s - 100 * u) / 2;
  const oy = (s - 100 * u) / 2;
  const bar = (x, y, w, h, fill) =>
    `<rect x="${ox + x * u}" y="${oy + y * u}" width="${w * u}" height="${h * u}" rx="${6 * u}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? s * 0.22 : 0}" fill="${BG}"/>
  ${bar(14, 56, 20, 30, GREEN_DARK)}
  ${bar(40, 38, 20, 48, GREEN)}
  ${bar(66, 16, 20, 70, GREEN)}
</svg>`;
}

const files = [
  ["icon-192.png", 192, 74, true],
  ["icon-512.png", 512, 74, true],
  // Full-bleed background, artwork inside the safe zone
  ["maskable-512.png", 512, 52, false],
  ["apple-touch-icon.png", 180, 66, false],
];

for (const [name, size, scale, rounded] of files) {
  const png = await sharp(Buffer.from(svg(size, scale, rounded))).png().toBuffer();
  writeFileSync(join(out, name), png);
  console.log("wrote", name, `${png.length} bytes`);
}
