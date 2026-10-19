// Fixed-format packager for our original Chromium-recorded, video-only fixtures.
// Not an application demuxer and never run on provider/user media.
export function boxes(bytes, start = 0, end = bytes.length) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 16 * 1024 * 1024 ||
    start < 0 ||
    end > bytes.length
  )
    throw new Error("Invalid bounded fixture input");
  const result = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end || result.length >= 128)
      throw new Error("Truncated or excessive fixture boxes");
    const size = bytes.readUInt32BE(offset);
    if (size < 8 || offset + size > end)
      throw new Error("Unsupported fixture box length");
    result.push({
      type: bytes.toString("ascii", offset + 4, offset + 8),
      start: offset,
      end: offset + size,
    });
    offset += size;
  }
  if (offset !== end) throw new Error("Incomplete fixture boxes");
  return result;
}

function one(entries, type) {
  const matches = entries.filter((entry) => entry.type === type);
  if (matches.length !== 1) throw new Error(`Expected one fixture ${type} box`);
  return matches[0];
}

function child(bytes, parent, type, extra = 0) {
  return one(boxes(bytes, parent.start + 8 + extra, parent.end), type);
}

export function packageQualityFixture(bytes, observed) {
  const top = boxes(bytes);
  if (
    top.some(
      (entry) => !["ftyp", "moov", "moof", "mdat", "mfra"].includes(entry.type),
    )
  )
    throw new Error("Unsupported fixture layout");
  const ftyp = one(top, "ftyp");
  const moov = one(top, "moov");
  const moof = one(top, "moof");
  const mdat = one(top, "mdat");
  if (
    ftyp.start !== 0 ||
    ftyp.end !== moov.start ||
    moov.end !== moof.start ||
    moof.end !== mdat.start
  )
    throw new Error("Fixture layout must have contiguous init/media");
  const trak = child(bytes, moov, "trak");
  const mdia = child(bytes, trak, "mdia");
  const minf = child(bytes, mdia, "minf");
  const stbl = child(bytes, minf, "stbl");
  const stsd = child(bytes, stbl, "stsd");
  const avc1 = child(bytes, stsd, "avc1", 8);
  const avcC = child(bytes, avc1, "avcC", 78);
  if (avcC.end - avcC.start < 12 || bytes[avcC.start + 8] !== 1)
    throw new Error("Unsupported AVC initialization");
  const codec = `avc1.${bytes.subarray(avcC.start + 9, avcC.start + 12).toString("hex")}`;
  const width = bytes.readUInt16BE(avc1.start + 32);
  const height = bytes.readUInt16BE(avc1.start + 34);
  const duration = observed?.duration;
  if (
    width !== observed?.width ||
    height !== observed?.height ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 10
  )
    throw new Error(
      "Fixture dimensions/duration lack matching observed evidence",
    );
  const tfhd = child(bytes, child(bytes, moof, "traf"), "tfhd");
  if (tfhd.end - tfhd.start < 16)
    throw new Error("Truncated fixture fragment header");
  const flags = bytes.readUInt32BE(tfhd.start + 8) & 0xffffff;
  if (!(flags & 0x020000) || flags & 0x000001)
    throw new Error("Fixture fragment must use relative moof addressing");
  const init = bytes.subarray(ftyp.start, moov.end);
  const media = bytes.subarray(moof.start, mdat.end);
  const playlist = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:${duration.toFixed(6)},\nsegment.m4s\n#EXT-X-ENDLIST\n`;
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>\n<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-main:2011" minBufferTime="PT0.2S" mediaPresentationDuration="PT${duration.toFixed(6)}S"><Period><AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true"><Representation id="original" bandwidth="1000000" width="${width}" height="${height}" codecs="${codec}"><SegmentList timescale="1000000" duration="${Math.round(duration * 1000000)}"><Initialization sourceURL="init.mp4"/><SegmentURL media="segment.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>\n`;
  return {
    codec,
    width,
    height,
    duration,
    files: new Map([
      ["init.mp4", init],
      ["segment.m4s", media],
      ["stream.m3u8", Buffer.from(playlist)],
      ["manifest.mpd", Buffer.from(mpd)],
    ]),
  };
}
