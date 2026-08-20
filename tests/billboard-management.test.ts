import { describe, expect, it } from 'vitest';

import { moveBillboard, publicBillboards, validateBillboardMedia } from '../server/planaria/billboard';

const png = (width: number, height: number): Uint8Array => {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

const mp4 = (): Uint8Array => {
  const bytes = Buffer.alloc(192);
  bytes.write('ftyp', 4, 'latin1');
  bytes.write('mvhd', 40, 'latin1');
  bytes[44] = 0;
  bytes.writeUInt32BE(1000, 56);
  bytes.writeUInt32BE(5000, 60);
  bytes.write('tkhd', 80, 'latin1');
  bytes.writeUInt32BE(1920 << 16, 156);
  bytes.writeUInt32BE(1080 << 16, 160);
  return bytes;
};

describe('billboard server validation and ordering', () => {
  it('validates image/video magic bytes, dimensions, duration, and digest', () => {
    expect(validateBillboardMedia(png(1050, 460), 'image/png')).toMatchObject({ mediaType: 'image', width: 1050, height: 460, durationMs: null });
    expect(validateBillboardMedia(mp4(), 'video/mp4')).toMatchObject({ mediaType: 'video', width: 1920, height: 1080, durationMs: 5000 });
    expect(() => validateBillboardMedia(Buffer.from('not-media'), 'image/png')).toThrow('validation');
    expect(() => validateBillboardMedia(png(10, 10), 'image/png')).toThrow('dimension');
  });

  it('reorders deterministically, rejects stale revisions, and exposes only Published order', () => {
    const items = [
      { id: 'a', displayOrder: 1, revision: 1, state: 'published' as const, publishState: 'published' as const },
      { id: 'b', displayOrder: 2, revision: 4, state: 'draft' as const, publishState: 'draft' as const },
      { id: 'c', displayOrder: 3, revision: 2, state: 'published' as const, publishState: 'published' as const },
    ];
    const moved = moveBillboard(items, 'b', -1, 4);
    expect(moved.find((item) => item.id === 'b')).toMatchObject({ displayOrder: 1, revision: 5 });
    expect(() => moveBillboard(items, 'b', -1, 3)).toThrow('Concurrent');
    expect(publicBillboards(items).map((item) => item.id)).toEqual(['a', 'c']);
  });
});
