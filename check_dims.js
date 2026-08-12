const fs = require('fs');
const path = require('path');

const framesDir = path.join('e:/cmcube/916cube/public/frames');
const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.webp'));

// WebP file header parser for dimensions
function getWebpDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 30) return null;
  
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;

  const vp8 = buffer.toString('ascii', 12, 16);
  if (vp8 === 'VP8 ') {
    // Lossy WebP
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  } else if (vp8 === 'VP8L') {
    // Lossless WebP
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    const width = 1 + (((b2 & 0x3F) << 8) | b1);
    const height = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6));
    return { width, height };
  } else if (vp8 === 'VP8X') {
    // Extended WebP
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  return null;
}

files.forEach(file => {
  const dims = getWebpDimensions(path.join(framesDir, file));
  if (dims) {
    const isPortrait = dims.height > dims.width;
    console.log(`${file}: ${dims.width}x${dims.height} -> ${isPortrait ? 'full (portrait)' : 'wide (landscape)'}`);
  } else {
    console.log(`${file}: could not parse`);
  }
});
