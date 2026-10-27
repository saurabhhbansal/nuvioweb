// Small byte helpers shared by the MP4/Matroska demuxers and the fMP4 muxer.

export function concatBytes(chunks) {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function fourcc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

export function readU24(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

export function readU32(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

export function readI32(bytes, offset) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

export function readU64(bytes, offset) {
  return readU32(bytes, offset) * 0x100000000 + readU32(bytes, offset + 4);
}

/** Reads `count` bits MSB-first. */
export class BitReader {
  constructor(bytes, offset = 0) {
    this.bytes = bytes;
    this.bit = offset * 8;
  }

  read(count) {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = this.bytes[this.bit >> 3] ?? 0;
      value = value * 2 + ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit += 1;
    }
    return value;
  }

  skip(count) {
    this.bit += count;
  }
}

/** Writes bits MSB-first into a growing byte array. */
export class BitWriter {
  constructor() {
    this.bytes = [];
    this.bit = 0;
  }

  write(count, value) {
    for (let index = count - 1; index >= 0; index -= 1) {
      if ((this.bit & 7) === 0) {
        this.bytes.push(0);
      }
      const bitValue = Math.floor(value / 2 ** index) & 1;
      this.bytes[this.bytes.length - 1] |= bitValue << (7 - (this.bit & 7));
      this.bit += 1;
    }
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

export function hex2(value) {
  return Number(value).toString(16).toUpperCase().padStart(2, "0");
}
