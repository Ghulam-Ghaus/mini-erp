import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Precomputed CRC32 table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

/**
 * Creates a standard PKZIP archive in memory from a list of files.
 */
export function createZipBuffer(entries: readonly ZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const cdChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const uncompressedData = entry.data;
    const compressedData = zlib.deflateRawSync(uncompressedData);
    const checksum = crc32(uncompressedData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Compression: Deflate
    localHeader.writeUInt16LE(0, 10); // Time (dos)
    localHeader.writeUInt16LE(0, 12); // Date (dos)
    localHeader.writeUInt32LE(checksum, 14); // CRC32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra length

    localChunks.push(localHeader, nameBuf, compressedData);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdHeader.writeUInt16LE(20, 4); // Version made by
    cdHeader.writeUInt16LE(20, 6); // Version needed
    cdHeader.writeUInt16LE(0, 8); // Flags
    cdHeader.writeUInt16LE(8, 10); // Compression: Deflate
    cdHeader.writeUInt16LE(0, 12); // Time
    cdHeader.writeUInt16LE(0, 14); // Date
    cdHeader.writeUInt32LE(checksum, 16); // CRC32
    cdHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    cdHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    cdHeader.writeUInt16LE(nameBuf.length, 28); // Filename length
    cdHeader.writeUInt16LE(0, 30); // Extra length
    cdHeader.writeUInt16LE(0, 32); // Comment length
    cdHeader.writeUInt16LE(0, 34); // Disk num start
    cdHeader.writeUInt16LE(0, 36); // Internal attrs
    cdHeader.writeUInt32LE(0, 38); // External attrs
    cdHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    cdChunks.push(cdHeader, nameBuf);

    offset += 30 + nameBuf.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of cdChunks) {
    centralDirSize += c.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk num
  eocd.writeUInt16LE(0, 6); // Disk start
  eocd.writeUInt16LE(entries.length, 8); // Total records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total records in CD
  eocd.writeUInt32LE(centralDirSize, 12); // Size of CD
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of CD
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

/**
 * Extracts a standard PKZIP archive buffer into a list of file entries.
 */
export function extractZipBuffer(zipBuffer: Buffer): readonly ZipEntry[] {
  const entries: ZipEntry[] = [];
  let pos = 0;

  while (pos + 30 <= zipBuffer.length) {
    const sig = zipBuffer.readUInt32LE(pos);
    if (sig !== 0x04034b50) {
      // Stopped reaching local headers, might have reached central directory
      break;
    }
    const compression = zipBuffer.readUInt16LE(pos + 8);
    const compSize = zipBuffer.readUInt32LE(pos + 18);
    const nameLen = zipBuffer.readUInt16LE(pos + 26);
    const extraLen = zipBuffer.readUInt16LE(pos + 28);

    const nameStart = pos + 30;
    const name = zipBuffer.toString('utf8', nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const compressedData = zipBuffer.subarray(dataStart, dataStart + compSize);

    let uncompressedData: Buffer;
    if (compression === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData);
    } else if (compression === 0) {
      uncompressedData = Buffer.from(compressedData);
    } else {
      throw new Error(`Unsupported zip compression method: ${compression}`);
    }

    entries.push({ name, data: uncompressedData });
    pos = dataStart + compSize;
  }

  return entries;
}

/**
 * Recursively collects all files in a directory as ZipEntry items with relative paths.
 */
export function collectDirectoryFiles(baseDir: string, relativePrefix = ''): ZipEntry[] {
  if (!fs.existsSync(baseDir)) return [];
  const entries: ZipEntry[] = [];
  const items = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(baseDir, item.name);
    const relPath = relativePrefix ? `${relativePrefix}/${item.name}` : item.name;

    if (item.isDirectory()) {
      entries.push(...collectDirectoryFiles(fullPath, relPath));
    } else if (item.isFile()) {
      entries.push({
        name: relPath,
        data: fs.readFileSync(fullPath),
      });
    }
  }

  return entries;
}
