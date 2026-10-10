const fs = require('fs');
const { PNG } = require('pngjs');

const size = 128;
const png = new PNG({ width: size, height: size });

// simple diagonal gradient background
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (size * y + x) << 2;
    const t = (x + y) / (2 * (size - 1));
    const r = Math.round(43 + (0 - 43) * t + (0) ); // keep bluish
    const g = Math.round(124 + (194 - 124) * t);
    const b = Math.round(255 + (168 - 255) * t);

    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  }
}

// draw two simple speech-bubble rectangles (no text) in white
function drawRect(x0, y0, w, h, radius){
  for (let y = y0; y < y0 + h; y++){
    for (let x = x0; x < x0 + w; x++){
      // simple rounded corners by skipping far corners
      const dx = Math.min(x - x0, x0 + w - 1 - x);
      const dy = Math.min(y - y0, y0 + h - 1 - y);
      if (dx + 0.2 >= radius || dy + 0.2 >= radius) {
        const idx = (size * y + x) << 2;
        png.data[idx] = 255;
        png.data[idx+1] = 255;
        png.data[idx+2] = 255;
        png.data[idx+3] = 230;
      }
    }
  }
}

// left bubble
drawRect(16, 30, 50, 44, 8);
// right bubble
drawRect(62, 44, 50, 44, 8);

// small border
for (let i = 8; i < size-8; i++){
  // top
  let idx = (size * 8 + i) << 2;
  png.data[idx] = Math.min(255, png.data[idx] + 30);
  png.data[idx+1] = Math.min(255, png.data[idx+1] + 30);
  png.data[idx+2] = Math.min(255, png.data[idx+2] + 30);
  // bottom
  idx = (size * (size-9) + i) << 2;
  png.data[idx] = Math.min(255, png.data[idx] + 30);
  png.data[idx+1] = Math.min(255, png.data[idx+1] + 30);
  png.data[idx+2] = Math.min(255, png.data[idx+2] + 30);
}

if (!fs.existsSync('images')) fs.mkdirSync('images');
const out = fs.createWriteStream('images/icon.png');
png.pack().pipe(out);
out.on('finish', () => console.log('Generated images/icon.png'));
