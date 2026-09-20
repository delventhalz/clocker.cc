const FORMAT_VERSION = 0;
const GROUP_TYPE = 0;
const TIME_TYPE = 1;
const TIME_SUB_TYPE = 0;

/**
 * Encodes an array of groups and clock in/out times as a base64 clocker string.
 * 
 * Clocker strings are a custom binary format. The first byte is the version
 * number. That is followed by a list of interspersed group info and clock
 * in/out times. These are ordered from newest to oldest, with each group coming
 * just before the first time that references it. In this way, clocker strings
 * can be truncated at any point to fit size requirements (such as for a URL
 * query string) and the oldest data will be dropped without generating errors.
 *
 * Group info byte format:
 *   - Header (1 byte):
 *     - Data Type (1 bit): Always zero
 *     - Label Size (7 bits): Byte size of string label (0-127)
 *   - UUID (16 bytes)
 *   - Creation Time (4 bytes): Two's complement signed unix epoch minutes
 *   - Color (3 bytes): RGB color
 *   - Label (0-127 bytes): A UTF-8 string label
 *
 * Clock in/out time byte format:
 *   - Header (1 byte):
 *     - Data Type (1 bit): Always one
 *     - Data Sub-type (1 bit): Always zero
 *     - Group Index Size (2 bits): Byte size of group index (1-4)
 *     - Clock In Size (2 bits): Byte size of clock in timestamp (3-6)
 *     - Clock Out Size (2 bits) Byte size of clock out timestamp (1-4)
 *   - Group Index (1-4 bytes): A 1-based index matching a group above
 *   - Clock In (3-6 bytes): Number of seconds since group creation
 *   - Clock Out (1-4 bytes): Number of seconds since clock in
 */
export function encode(groups, times) {
  const groupsById = Object.fromEntries(groups.map(grp => [grp.id, grp]));

  // Sort times from newest to oldest
  const sortedTimes = times.toSorted((a, b) => {
    const aTime = groupsById[a.group].created + a.in;
    const bTime = groupsById[b.group].created + b.in;
    return bTime - aTime;
  });

  // Sort groups from oldest associated time to newest so we can pop groups off
  const sortedGroups = groups.toSorted((a, b) => {
    const aIndex = sortedTimes.findIndex(time => time.group === a.id);
    const bIndex = sortedTimes.findIndex(time => time.group === b.id);
    return bIndex - aIndex;
  });

  const groupIndexesById = Object.fromEntries(sortedGroups.map((grp, i) => [grp.id, i]));

  const data = [];

  for (const time of sortedTimes) {
    if (time.group === sortedGroups.at(-1).id) {
      data.push({
        type: GROUP_TYPE,
        data: sortedGroups.pop()
      });
    }
    data.push({
      type: TIME_TYPE,
      data: time,
    });
  }

  const headerBytes = new Uint8Array([FORMAT_VERSION]);
  const dataBytes = data.map(({ type, data }) => {
    switch (type) {
    case GROUP_TYPE:
      return encodeGroup(data);
    case TIME_TYPE:
      return encodeTime(groupIndexesById[data.group], groupsById[data.group], data);
    }
  });

  return bytesToBase64(concatBytes([headerBytes, ...dataBytes]));
}

/**
 * Converts an encoded clocker string into an array of group info objects and
 * an array of clock in/out time objects. The two arrays are returned in
 * a tuple with group info first.
 *
 * Group Info object properties:
 *   - id: UUID string formatted with the lowercase dashed convention
 *   - color: RGB color hex string
 *   - label: String label
 *
 * Clock in/out time object properties:
 *   - group: UUID string of group time is under
 *   - in: Clock in time as unix epoch milliseconds (rounded to nearest second)
 *   - out: Undefined if time has not been clocked out, otherwise clock out time
 *     as unix epoch milliseconds (rounded to nearest second)
 */
export function decode(encodedString) {

}

function encodeGroup({ id, created, color, label }) {
  const idBytes = hexToFixedBytes(id, 16);
  const createdBytes = intToFixedBytes(msToMinutes(created), 4);
  const colorBytes = hexToFixedBytes(color, 3);
  const labelBytes = textToDynamicBytes(label, 127);

  const typeBits = GROUP_TYPE << 7;
  const headerBytes = new Uint8Array([typeBits + labelBytes.length]);

  return concatBytes([
    headerBytes,
    idBytes,
    createdBytes,
    colorBytes,
    labelBytes
  ]);
}

function encodeTime(groupIndex, group, time) {
  const indexBytes = uintToDynamicBytes(groupIndex, 4, 1);

  const inSeconds = msToSeconds(time.in - group.created);
  const inBytes = uintToDynamicBytes(inSeconds, 6, 3);

  const outSeconds = msToSeconds((time.out ?? time.in) - time.in);
  const outBytes = uintToDynamicBytes(outSeconds, 4, 1);

  const typeBits = TIME_TYPE << 7;
  const subTypeBits = TIME_SUB_TYPE << 6;
  const indexSizeBits = indexBytes.length - 1 << 4;
  const inSizeBits = inBytes.length - 3 << 2;
  const outSizeBits = outBytes.length - 1;

  const headerBytes = new Uint8Array([
    typeBits + subTypeBits + indexSizeBits + inSizeBits + outSizeBits
  ]);

  return concatBytes([
    headerBytes,
    indexBytes,
    inBytes,
    outBytes
  ]);
}

function msToSeconds(ms) {
  return Math.floor(ms / 1000);
}

function msToMinutes(ms) {
  return Math.floor(ms / 60000);
}

function clamp(value, max, min = 0) {
  return Math.max(Math.min(value, max), min);
}

function clampBits(value, bitSize) {
  const amplitude = 2 ** (bitSize - 1);
  return clamp(value, amplitude - 1, -amplitude);
}

function clampUnsignedBits(value, bitSize) {
  return clamp(value, 2 ** bitSize - 1);
}

function intToFixedBytes(integer, byteSize) {
  const clampedSize = clamp(byteSize, 8);
  const sanitized = clampBits(Math.trunc(integer), clampedSize * 8);

  const dataView = new DataView(new ArrayBuffer(8));
  dataView.setBigInt64(0, BigInt(sanitized));

  return new Uint8Array(dataView.buffer.slice(-clampedSize));
}

function uintToDynamicBytes(unsignedInteger, maxByteSize, minByteSize = 0) {
  const clampedMaxSize = clamp(maxByteSize, 8);
  const clampedMinSize = clamp(minByteSize, 8);
  const sanitized = clampUnsignedBits(Math.trunc(unsignedInteger), clampedMaxSize * 8);

  const dataView = new DataView(new ArrayBuffer(8));
  dataView.setBigUint64(0, BigInt(sanitized));
  const bytes = new Uint8Array(dataView.buffer);

  const start = bytes.findIndex(byte => byte > 0);
  const minFrom = bytes.length - clamp(maxByteSize, bytes.length);
  const maxFrom = bytes.length - clamp(minByteSize, bytes.length);
  const from = clamp(start > 0 ? start : maxFrom, maxFrom, minFrom);

  return bytes.slice(from);
}

function hexToFixedBytes(hexString, byteLength) {
  const sanitized = hexString
    .replaceAll(/[^0-9a-f]/gi, '')
    .padStart(byteLength * 2, '0')
    .slice(0, byteLength * 2);

  return Uint8Array.fromHex(sanitized);
}

function textToDynamicBytes(utf8String, maxByteLength) {
  const encoder = new TextEncoder();
  return encoder.encode(utf8String).slice(0, maxByteLength);
}

function concatBytes(arrayOfBytes) {
  const byteLength = arrayOfBytes.reduce((sum, bytes) => sum + bytes.length, 0);
  const concatted = groupBytes = new Uint8Array(byteLength);
  let index = 0;

  for (const bytes of arrayOfBytes) {
    concatted.set(bytes, index);
    index += bytes.length;
  }

  return concatted;
}

function bytesToBase64(bytes) {
  return bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
}
