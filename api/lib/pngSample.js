import { inflateSync } from 'node:zlib';

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanline(filterType, row, previous, bytesPerPixel, width) {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const x = row[i];
    const a = i >= bytesPerPixel ? out[i - bytesPerPixel] : 0;
    const b = previous ? previous[i] : 0;
    const c = previous && i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
    switch (filterType) {
      case 0:
        out[i] = x;
        break;
      case 1:
        out[i] = (x + a) & 0xff;
        break;
      case 2:
        out[i] = (x + b) & 0xff;
        break;
      case 3:
        out[i] = (x + Math.floor((a + b) / 2)) & 0xff;
        break;
      case 4:
        out[i] = (x + paethPredictor(a, b, c)) & 0xff;
        break;
      default:
        throw new Error(`Unsupported PNG filter ${filterType}`);
    }
  }
  return out;
}

function parsePngRgba(buffer) {
  const signature = buffer.subarray(0, 8);
  if (signature[0] !== 0x89 || signature.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG image');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idatParts.push(chunk);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height) throw new Error('PNG missing IHDR');
  if (bitDepth !== 8) throw new Error('Only 8-bit PNGs supported');
  if (colorType !== 6 && colorType !== 2) {
    throw new Error(`Unsupported PNG color type ${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idatParts));
  const stride = width * bytesPerPixel;
  const rgba = new Uint8Array(width * height * 4);
  let previous = null;

  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (1 + stride);
    const filterType = inflated[rowStart];
    const filtered = inflated.subarray(rowStart + 1, rowStart + 1 + stride);
    const unfiltered = unfilterScanline(filterType, filtered, previous, bytesPerPixel, width);
    previous = unfiltered;

    for (let col = 0; col < width; col += 1) {
      const src = col * bytesPerPixel;
      const dst = (row * width + col) * 4;
      rgba[dst] = unfiltered[src];
      rgba[dst + 1] = unfiltered[src + 1];
      rgba[dst + 2] = unfiltered[src + 2];
      rgba[dst + 3] = colorType === 6 ? unfiltered[src + 3] : 255;
    }
  }

  return { width, height, rgba };
}

export function samplePngPixel(buffer, x, y) {
  const { width, height, rgba } = parsePngRgba(buffer);
  const clampedX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const index = (clampedY * width + clampedX) * 4;
  return {
    r: rgba[index],
    g: rgba[index + 1],
    b: rgba[index + 2],
    a: rgba[index + 3],
    width,
    height,
  };
}
