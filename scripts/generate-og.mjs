// Generates public/og-image.jpg — the 1200x630 social share card.
// Composites the logo, centered, over the site background with a subtle
// dark overlay for contrast. Re-run after changing the logo or background:
//   node scripts/generate-og.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const W = 1200;
const H = 630;

const overlay = await sharp({
  create: {
    width: W,
    height: H,
    channels: 4,
    background: { r: 10, g: 10, b: 10, alpha: 0.4 },
  },
})
  .png()
  .toBuffer();

const logo = await sharp(root + "src/assets/logo.webp")
  .resize({ width: 560 })
  .toBuffer();

await sharp(root + "src/assets/background.webp")
  .resize(W, H, { fit: "cover", position: "center" })
  .composite([
    { input: overlay },
    { input: logo, gravity: "center" },
  ])
  .jpeg({ quality: 82 })
  .toFile(root + "public/og-image.jpg");

console.log("Wrote public/og-image.jpg (%dx%d)", W, H);
