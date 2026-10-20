// Codec strings come from reviewed generated initialization bytes, not names,
// requested encoder profiles or a guessed level. Only one fixed MP4 config box
// is accepted; these helpers are test tooling, not a production demuxer.
function config(bytes, name, minimum) {
  const marker = Buffer.from(name);
  const index = bytes.indexOf(marker);
  if (index < 4 || bytes.indexOf(marker, index + 4) !== -1) throw new Error(`Missing/ambiguous ${name} config`);
  const size = bytes.readUInt32BE(index - 4);
  if (size < minimum + 8 || size > 4096 || index - 4 + size > bytes.length) throw new Error(`Invalid ${name} config bounds`);
  const data = bytes.subarray(index + 4, index - 4 + size);
  if ((name === "av1C" ? data[0] & 0x7f : data[0]) !== 1) throw new Error(`Unknown ${name} version`);
  return data;
}
export function measuredCodecString(entry, bytes) {
  switch (entry.observed.codec) {
    case "h264": {
      const data = config(bytes, "avcC", 4);
      return `avc1.${data.subarray(1, 4).toString("hex")}`;
    }
    case "hevc": {
      const data = config(bytes, "hvcC", 13);
      const space = ["", "A", "B", "C"][data[1] >> 6];
      const tier = data[1] & 32 ? "H" : "L";
      let compatibility = 0;
      const flags = data.readUInt32BE(2);
      for (let bit = 0; bit < 32; bit++) compatibility = (compatibility << 1) | ((flags >>> bit) & 1);
      const constraints = [...data.subarray(6, 12)];
      while (constraints.at(-1) === 0) constraints.pop();
      return `hvc1.${space}${data[1] & 31}.${(compatibility >>> 0).toString(16)}.${tier}${data[12]}${constraints.length ? "." + constraints.map(x => x.toString(16).padStart(2, "0")).join(".") : ""}`;
    }
    case "av1": {
      const data = config(bytes, "av1C", 3);
      const depth = data[2] & 64 ? (data[2] & 32 ? 12 : 10) : 8;
      return `av01.${data[1] >> 5}.${String(data[1] & 31).padStart(2, "0")}${data[2] & 128 ? "H" : "M"}.${String(depth).padStart(2, "0")}`;
    }
    case "vp9": return "vp9"; // WebM family alias; no level guessed from dimensions.
    default: throw new Error("Unknown measured fixture codec");
  }
}
