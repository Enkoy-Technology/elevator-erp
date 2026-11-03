import { readInlineImage } from './inline-image';

/** A PNG's first 33 bytes: the signature and an IHDR claiming this size. */
const pngHeader = (width: number, height: number): string => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return Buffer.concat([signature, ihdr]).toString('base64');
};

describe('readInlineImage', () => {
  it("reads a PNG's size from its header, before anything decodes it", () => {
    const image = readInlineImage(
      `data:image/png;base64,${pngHeader(16384, 16384)}`,
    );
    expect(image).toMatchObject({ type: 'png', width: 16384, height: 16384 });
  });

  it('goes by the bytes, not the label', () => {
    const image = readInlineImage(
      `data:image/jpeg;base64,${pngHeader(10, 20)}`,
    );
    expect(image).toMatchObject({ type: 'png', width: 10, height: 20 });
  });

  it("reads a JPEG's size, fill bytes and all", () => {
    // SOI, an APP0 segment, two fill bytes, then SOF0 with 300 × 200.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xff, 0xff, 0xc0,
      0x00, 0x0b, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x01, 0x01, 0x11, 0x00,
    ]).toString('base64');
    expect(readInlineImage(`data:image/jpeg;base64,${jpeg}`)).toMatchObject({
      type: 'jpg',
      width: 300,
      height: 200,
    });
  });

  it('reads an extended WebP and recognises an SVG', () => {
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8X', 12, 'ascii');
    webp.writeUIntLE(799, 24, 3);
    webp.writeUIntLE(599, 27, 3);
    expect(
      readInlineImage(`data:image/webp;base64,${webp.toString('base64')}`),
    ).toMatchObject({ type: 'webp', width: 800, height: 600 });

    const svg = Buffer.from('<?xml version="1.0"?><svg width="10"/>').toString(
      'base64',
    );
    expect(readInlineImage(`data:image/svg+xml;base64,${svg}`)).toMatchObject({
      type: 'svg',
    });
  });

  it('refuses what is not an image, or not an inline one', () => {
    const junk = Buffer.from('not an image at all').toString('base64');
    expect(readInlineImage(`data:image/png;base64,${junk}`)).toBeNull();
    expect(readInlineImage('https://cdn.example.com/mark.png')).toBeNull();
    expect(readInlineImage(null)).toBeNull();
    expect(readInlineImage('data:image/png;base64,iVBORw0K')).toBeNull();
  });
});
