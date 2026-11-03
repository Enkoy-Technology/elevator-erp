/**
 * A tenant's inline image (the settings screen stores the watermark and the
 * company seal as data: URIs), identified by its own bytes rather than its
 * label: Chromium sniffs what it decodes, so a label is no check at all.
 * The pixel size comes from the header, before anything decodes it, so a
 * small file that claims a vast image can be refused first. SVG has no
 * pixel size of its own (0 × 0 here); it is drawn at whatever size it is
 * asked for.
 */
export interface InlineImage {
  type: 'png' | 'jpg' | 'webp' | 'svg';
  data: Buffer;
  width: number;
  height: number;
}

const DATA_URI_RE =
  /^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,([A-Za-z0-9+/]+=*)$/i;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const jpegSize = (data: Buffer): { width: number; height: number } | null => {
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      return null;
    }
    const marker = data[i + 1]!;
    // Fill bytes before a marker are legal (T.81 B.1.1.2).
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: data.readUInt16BE(i + 5),
        width: data.readUInt16BE(i + 7),
      };
    }
    i += 2 + data.readUInt16BE(i + 2);
  }
  return null;
};

const webpSize = (data: Buffer): { width: number; height: number } | null => {
  if (data.length < 30) {
    return null;
  }
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: data.readUIntLE(24, 3) + 1,
      height: data.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
};

/** The image a data: URI holds, or null when its bytes are not a PNG, JPEG, WebP or SVG. */
export const readInlineImage = (
  uri: string | null | undefined,
): InlineImage | null => {
  const match = DATA_URI_RE.exec(uri ?? '');
  if (!match) {
    return null;
  }
  const data = Buffer.from(match[1]!, 'base64');
  if (data.length > 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return data.toString('ascii', 12, 16) === 'IHDR'
      ? {
          type: 'png',
          data,
          width: data.readUInt32BE(16),
          height: data.readUInt32BE(20),
        }
      : null;
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    const size = jpegSize(data);
    return size ? { type: 'jpg', data, ...size } : null;
  }
  if (
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const size = webpSize(data);
    return size ? { type: 'webp', data, ...size } : null;
  }
  const head = data.toString('utf8', 0, 1024).replace(/^\uFEFF/, '');
  if (
    /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(
      head,
    )
  ) {
    return { type: 'svg', data, width: 0, height: 0 };
  }
  return null;
};
