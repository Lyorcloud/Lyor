import { createHash } from 'node:crypto';

export type BillboardMediaType = 'image' | 'video';
export type BillboardPublishState = 'draft' | 'published' | 'disabled';

export interface ValidatedBillboardMedia {
  readonly mediaType: BillboardMediaType;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
  readonly byteSize: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number | null;
}

export interface BillboardOrderItem {
  readonly id: string;
  readonly displayOrder: number;
  readonly revision: number;
  readonly state: BillboardPublishState;
}

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const readUInt32 = (bytes: Uint8Array, offset: number): number => Buffer.from(bytes).readUInt32BE(offset);

const pngDimensions = (bytes: Uint8Array): readonly [number, number] | null => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !Buffer.from(bytes.subarray(0, 8)).equals(signature)) return null;
  return [readUInt32(bytes, 16), readUInt32(bytes, 20)];
};

const jpegDimensions = (bytes: Uint8Array): readonly [number, number] | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return [((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0), ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0)];
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
};

const webpDimensions = (bytes: Uint8Array): readonly [number, number] | null => {
  if (bytes.length < 30 || Buffer.from(bytes.subarray(0, 4)).toString() !== 'RIFF' || Buffer.from(bytes.subarray(8, 12)).toString() !== 'WEBP' || Buffer.from(bytes.subarray(12, 16)).toString() !== 'VP8X') return null;
  const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
  const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
  return [width, height];
};

const mp4Metadata = (bytes: Uint8Array): { width: number; height: number; durationMs: number } | null => {
  if (bytes.length < 32 || Buffer.from(bytes.subarray(4, 8)).toString() !== 'ftyp') return null;
  const text = Buffer.from(bytes).toString('latin1');
  const mvhd = text.indexOf('mvhd');
  const tkhd = text.indexOf('tkhd');
  if (mvhd < 0 || tkhd < 0 || mvhd + 24 >= bytes.length || tkhd + 84 >= bytes.length) return null;
  const version = bytes[mvhd + 4] ?? 0;
  const timeOffset = version === 1 ? mvhd + 24 : mvhd + 16;
  const timescale = readUInt32(bytes, timeOffset);
  const duration = version === 1
    ? Number(Buffer.from(bytes).readBigUInt64BE(timeOffset + 4))
    : readUInt32(bytes, timeOffset + 4);
  const width = readUInt32(bytes, tkhd + 76) >>> 16;
  const height = readUInt32(bytes, tkhd + 80) >>> 16;
  if (timescale === 0) return null;
  return { width, height, durationMs: Math.round(duration / timescale * 1000) };
};

export const validateBillboardMedia = (bytes: Uint8Array, claimedMimeType: string): ValidatedBillboardMedia => {
  const imageDimensions = claimedMimeType === 'image/png' ? pngDimensions(bytes)
    : claimedMimeType === 'image/jpeg' ? jpegDimensions(bytes)
      : claimedMimeType === 'image/webp' ? webpDimensions(bytes) : null;
  const video = claimedMimeType === 'video/mp4' ? mp4Metadata(bytes) : null;
  if (!imageDimensions && !video) throw new Error('Media MIME, extension, magic bytes, or decode validation failed.');
  const mediaType = video ? 'video' : 'image';
  const maximumBytes = video ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
  if (bytes.length === 0 || bytes.length > maximumBytes) throw new Error('Media size limit failed.');
  const width = video?.width ?? imageDimensions?.[0] ?? 0;
  const height = video?.height ?? imageDimensions?.[1] ?? 0;
  const durationMs = video?.durationMs ?? null;
  if (width < 320 || width > 7680 || height < 180 || height > 4320 || (durationMs !== null && (durationMs < 100 || durationMs > 120000))) {
    throw new Error('Media dimension or duration limit failed.');
  }
  return { mediaType, mimeType: claimedMimeType as ValidatedBillboardMedia['mimeType'], byteSize: bytes.length,
    sha256: hash(bytes), width, height, durationMs };
};

export const moveBillboard = (
  items: readonly BillboardOrderItem[],
  id: string,
  direction: -1 | 1,
  expectedRevision: number,
): readonly BillboardOrderItem[] => {
  const active = items.filter((item) => item.state !== 'disabled').sort((left, right) => left.displayOrder - right.displayOrder);
  const index = active.findIndex((item) => item.id === id && item.revision === expectedRevision);
  if (index < 0) throw new Error('Concurrent billboard ordering update rejected.');
  const otherIndex = index + direction;
  if (otherIndex < 0 || otherIndex >= active.length) return items;
  const current = active[index];
  const adjacent = active[otherIndex];
  if (!current || !adjacent) return items;
  return items.map((item) => item.id === current.id
    ? { ...item, displayOrder: adjacent.displayOrder, revision: item.revision + 1 }
    : item.id === adjacent.id
      ? { ...item, displayOrder: current.displayOrder, revision: item.revision + 1 }
      : item);
};

export const publicBillboards = <T extends { readonly publishState: BillboardPublishState; readonly displayOrder: number }>(items: readonly T[]): readonly T[] =>
  items.filter((item) => item.publishState === 'published').sort((left, right) => left.displayOrder - right.displayOrder);
