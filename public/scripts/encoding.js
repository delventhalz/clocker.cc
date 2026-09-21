const CURRENT_FORMAT_VERSION = 0;

const CHECKPOINT_TYPE = 0;
const TIME_TYPE = 1;

// Note that since groups cheat and use seven bits for label size,
// they effectively have a data type of BOTH 2 and 3
const GROUP_TYPE = 2;

const MAX_CLOCK_IN_SIZE = 3;
const MAX_SECOND_GAP = 2 ** (MAX_CLOCK_IN_SIZE * 8) - 1;

/**
 * Encodes clock in/out times and their groups as a base64 clocker string.
 * 
 * Clocker strings are a custom binary format. The first byte is the version
 * number, followed by an absolute checkpoint timestamp from the time the string
 * was encoded. After this initial metadata, there is an interspersed list of
 * clock in/out times, group info, and additional checkpoints. These are ordered
 * from newest to oldest, with each group coming just before the first time that
 * references it, and checkpoints coming before times which are more than 2^24
 * seconds apart. In this way, clocker strings can be truncated at any point to
 * fit size requirements, such as for a URL query string. The oldest data can
 * simply be dropped without generating errors.
 *
 * Checkpoint timestamp byte format:
 *   - Header (1 byte):
 *     - Data Type (2 bits): Always zero
 *     - Timestamp size (2 bits): Byte size of timestamp (4-7)
 *     - Timestamp sign (1 bit): Before (one) or after (zero) Unix epoch
 *     - Unused (3 bits): Zeroed out, may be used for future metadata
 *   - Timestamp (4-7 bytes): Seconds removed from Unix epoch
 *
 * Clock in/out time byte format:
 *   - Header (1 byte):
 *     - Data Type (2 bits): Always one
 *     - Group Index Size (2 bits): Byte size of group index (0-3)
 *     - Clock In Size (2 bits): Byte size of clock in timestamp (0-3)
 *     - Clock Out Size (2 bits) Byte size of clock out timestamp (2-5)
 *   - Group Index (0-3 bytes): Order based index of linked group
 *   - Clock In (0-3 bytes): Seconds before preceding clock in or checkpoint
 *   - Clock Out (2-5 bytes): Seconds since this clock in
 *
 * Group info byte format:
 *   - Header (1 byte):
 *     - Data Type (1 bit): Always one (i.e. 2 or 3 when sized as two bits)
 *     - Label Size (7 bits): Byte size of string label (0-127)
 *   - UUID (16 bytes)
 *   - Color (3 bytes): RGB color
 *   - Label (0-127 bytes): A UTF-8 string label
 */
export function encode(timestamp, times, groups) {
  // Sort times from newest to oldest
  const sortedTimes = times.toSorted((a, b) => b.in - a.in);

  // Sort groups from newest associated time to oldest
  const sortedGroups = groups.toSorted((a, b) => {
    const aIndex = sortedTimes.findIndex(time => time.group === a.id);
    const bIndex = sortedTimes.findIndex(time => time.group === b.id);
    return aIndex - bIndex;
  });
  const groupIndexesById = Object.fromEntries(sortedGroups.map((grp, i) => [grp.id, i]));

  const data = [
    new Uint8Array([CURRENT_FORMAT_VERSION]),
    encodeCheckpoint(timestamp),
  ];

  let nextTimestamp = timestamp;
  let groupIndex = 0;

  // If first clock in time is from after our encode timestamp,
  // we need a future checkpoint to match
  if (sortedTimes[0] && sortedTimes[0].in > nextTimestamp) {
    data.push(encodeCheckpoint(sortedTimes[0].in));
    nextTimestamp = sortedTimes[0].in;
  }

  for (const time of sortedTimes) {
    if (nextTimestamp - time.in > MAX_SECOND_GAP) {
      data.push(encodeCheckpoint(time.in));
      nextTimestamp = time.in;
    }

    if (groupIndex < sortedGroups.length && time.group === sortedGroups[groupIndex].id) {
      data.push(encodeGroup(sortedGroups[groupIndex]));
      groupIndex += 1;
    }

    data.push(encodeTime(nextTimestamp, groupIndexesById[time.group], time));
    nextTimestamp = time.in;
  }

  return bytesToBase64(concatBytes(data));
}

function encodeCheckpoint(timestamp) {
  const deltaSeconds = Math.abs(msToSeconds(timestamp));
  const tsBytes = uintToDynamicBytes(deltaSeconds, 7, 4);

  const headerBytes = concatBits([
    CHECKPOINT_TYPE << 6,
    tsBytes.length - 4 << 4,
    // Should maybe save timestamp as signed integer, but dynamically truncating
    // two's complement numbers is a pain so I'll just use this bit as a sign
    timestamp < 0 ? 1 : 0 << 3
  ]);

  return concatBytes([
    headerBytes,
    tsBytes
  ]);
}

function encodeTime(nextTimestamp, groupIndex, time) {
  const indexBytes = uintToDynamicBytes(groupIndex, 3);

  const inSeconds = msToSeconds(time.in);
  const inDiff = msToSeconds(nextTimestamp) - inSeconds;

  const outDiff = time.out === undefined
    ? 0 // An unset out diff is always zero
    : time.out - time.in < 1000
    ? 1 // A set out diff must always be at least 1
    : msToSeconds(time.out) - inSeconds;

  const inBytes = uintToDynamicBytes(inDiff, MAX_CLOCK_IN_SIZE);
  const outBytes = uintToDynamicBytes(outDiff, 5, 2);

  const headerBytes = concatBits([
    TIME_TYPE << 6,
    indexBytes.length << 4,
    inBytes.length << 2,
    outBytes.length - 2
  ]);

  return concatBytes([
    headerBytes,
    indexBytes,
    inBytes,
    outBytes
  ]);
}

function encodeGroup({ id, color, label }) {
  const idBytes = hexToFixedBytes(id, 16);
  const colorBytes = hexToFixedBytes(color, 3);
  const labelBytes = textToDynamicBytes(label, 127);

  // Note that the 7-bit label size will overlap with the data type by one bit.
  // This only works because GROUP_TYPE is a number with a zero in the last bit.
  const headerBytes = concatBits([
    GROUP_TYPE << 6,
    labelBytes.length
  ]);

  return concatBytes([
    headerBytes,
    idBytes,
    colorBytes,
    labelBytes
  ]);
}

function msToSeconds(ms) {
  return Math.floor(ms / 1000);
}

function clamp(value, max, min = 0) {
  return Math.max(Math.min(value, max), min);
}

function uintToDynamicBytes(positiveInteger, maxByteSize, minByteSize = 0) {
  // There is no point in using more than seven bytes with JS numbers.
  // They lose precision before you get to the eighth byte. If I need
  // larger integers, I will need to add support for BigInt arguments.
  const clampedMaxSize = clamp(maxByteSize, 7);
  const clampedMinSize = clamp(minByteSize, 7);

  const maxValue = Math.min(2 ** (clampedMaxSize * 8) - 1, Number.MAX_SAFE_INTEGER);
  const sanitized = clamp(Math.round(positiveInteger), maxValue);

  const dataView = new DataView(new ArrayBuffer(8));
  dataView.setBigUint64(0, BigInt(sanitized));
  const bytes = new Uint8Array(dataView.buffer);

  const minFrom = bytes.length - clamp(maxByteSize, bytes.length);
  const maxFrom = bytes.length - clamp(minByteSize, bytes.length);
  const start = sanitized === 0 ? maxFrom : bytes.findIndex(byte => byte > 0);
  const from = clamp(start > 0 ? start : maxFrom, maxFrom, minFrom);

  return bytes.slice(from);
}

function hexToFixedBytes(hexString, byteSize) {
  const sanitized = hexString
    .replaceAll(/[^0-9a-f]/gi, '')
    .padStart(byteSize * 2, '0')
    .slice(0, byteSize * 2);

  return Uint8Array.fromHex(sanitized);
}

function textToDynamicBytes(utf8String, maxByteSize) {
  const encoder = new TextEncoder();
  return encoder.encode(utf8String).slice(0, maxByteSize);
}

function concatBits(arrayOfOffsetBits) {
  const byte = arrayOfOffsetBits.reduce((sum, bits) => sum + bits, 0);
  return new Uint8Array([byte]);
}

function concatBytes(arrayOfBytes) {
  const size = arrayOfBytes.reduce((sum, bytes) => sum + bytes.length, 0);
  const concatted = groupBytes = new Uint8Array(size);
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
