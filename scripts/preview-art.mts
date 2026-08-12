/**
 * Renders a contact sheet of sample seed artworks to /tmp-art-preview so the
 * generated draw and text pieces can be eyeballed before seeding the database.
 *
 * Run: npx tsx scripts/preview-art.mts
 */

import * as fs from 'fs';
import sharp from 'sharp';
import { renderDrawArtwork, renderTextArtwork, averageToGrid, type Bitmap } from './lib/artgen';

const OUT = 'tmp-art-preview';
fs.mkdirSync(OUT, { recursive: true });

async function writePng(bmp: Bitmap, file: string, width = 420) {
  await sharp(Buffer.from(bmp.data), {
    raw: { width: bmp.width, height: bmp.height, channels: 3 },
  })
    .resize({ width, kernel: 'nearest' })
    .png()
    .toFile(`${OUT}/${file}`);
}

/** Renders the downsampled cube grid back up to full size, as the app would. */
function gridToBitmap(colors: Float32Array, cols: number, rows: number): Bitmap {
  const data = new Uint8Array(cols * rows * 3);
  for (let i = 0; i < cols * rows * 3; i++) {
    data[i] = Math.round(Math.min(1, Math.max(0, colors[i])) * 255);
  }
  return { width: cols, height: rows, data };
}

// A grid of draw styles: 12 seeds, each full-res and as its cube grid.
const drawTiles: Buffer[] = [];
for (let i = 0; i < 12; i++) {
  const { bitmap, style, palette } = renderDrawArtwork(i * 977 + 13, 420, 280);
  console.log(`draw ${i}: ${style} / ${palette}`);

  const grid = averageToGrid(bitmap, 28, 19, 'draw');
  const gridBmp = gridToBitmap(grid, 28, 19);

  const full = await sharp(Buffer.from(bitmap.data), {
    raw: { width: bitmap.width, height: bitmap.height, channels: 3 },
  })
    .resize({ width: 300 })
    .png()
    .toBuffer();

  const cubes = await sharp(Buffer.from(gridBmp.data), {
    raw: { width: 28, height: 19, channels: 3 },
  })
    .resize({ width: 300, kernel: 'nearest' })
    .png()
    .toBuffer();

  drawTiles.push(
    await sharp({
      create: { width: 300, height: 404, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .composite([
        { input: full, top: 0, left: 0 },
        { input: cubes, top: 204, left: 0 },
      ])
      .png()
      .toBuffer()
  );
}

// 4x3 contact sheet: original above, cube rendering below, for each style.
await sharp({
  create: { width: 300 * 4, height: 404 * 3, channels: 3, background: { r: 12, g: 12, b: 12 } },
})
  .composite(
    drawTiles.map((input, i) => ({
      input,
      left: (i % 4) * 300,
      top: Math.floor(i / 4) * 404,
    }))
  )
  .png()
  .toFile(`${OUT}/draw-sheet.png`);

// Text samples: short phrase, medium, and a long paragraph that must wrap.
const phrases = ['STAY\nWEIRD', 'MADE WITH\nUNRAVEL', 'THE FUTURE IS BLOCKY AND BRIGHT'];
for (let i = 0; i < phrases.length; i++) {
  const bmp = renderTextArtwork(phrases[i], 480, 240);
  await writePng(bmp, `text-${i}-source.png`, 480);
  const grid = averageToGrid(bmp, 40, 20, 'type');
  await writePng(gridToBitmap(grid, 40, 20), `text-${i}-cubes.png`, 480);
}

console.log(`\nWrote previews to ${OUT}/`);
