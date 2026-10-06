import { sortTimes, sortGroups } from './sorting.js';

const CURRENT_FORMAT_VERSION = 0;

const CHECKPOINT_TYPE = 0;
const TIME_TYPE = 1;
const GROUP_TYPE = 2;

const MAX_TIME_GAP_SIZE = 3;
const MAX_MS_GAP = (2 ** (MAX_TIME_GAP_SIZE * 8) - 1) * 1000;
const ID_SIZE = 16;
const COLOR_SIZE = 3;

/**
 * Encodes clock in/out times and their groups as a base64 clocker string.
 * 
 * Clocker strings are a custom binary format. The first byte is the version
 * number, followed by an absolute checkpoint timestamp from the time the string
 * was encoded. After this initial metadata, there is an interspersed list of
 * clock in/out times, group info, and additional checkpoints. These are ordered
 * from newest to oldest, with active times coming before clocked out times,
 * with each group coming just before the first time that references it, and
 * checkpoints coming before times which are more than 2^24 seconds apart.
 * In this way, clocker strings can be truncated at any point to fit size
 * requirements, such as for a URL query string. The oldest data can simply be
 * dropped without generating errors.
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
 *   - Header (2 bytes):
 *     - Data Type (2 bits): Always two
 *     - Touched size (2 bits): Byte size of touched timestamp (0-3)
 *     - Unused (4 bits): Zeroed out, may be used for future metadata
 *     - Label Size (8 bits): Byte size of string label (0-255)
 *   - UUID (16 bytes)
 *   - Touched Time (0-3 bytes): Seconds before preceding clock in or checkpoint
 *   - Color (3 bytes): RGB color
 *   - Label (0-255 bytes): A UTF-8 string label
 */
export function encode(timestamp, times, groups) {
  const sortedTimes = sortTimes(times);
  const sortedGroups = sortGroups(groups);
  const groupIndexesById = Object.fromEntries(sortedGroups.map((grp, i) => [grp.id, i]));

  const queue = [];
  let timeIndex = 0;
  let groupIndex = 0;

  while (timeIndex < sortedTimes.length || groupIndex < sortedGroups.length) {
    const time = sortedTimes[timeIndex];
    const group = sortedGroups[groupIndex];
    if (!time || (group && group.touched >= time.in)) {
      queue.push(group);
      groupIndex += 1;
    } else  {
      queue.push(time);
      timeIndex += 1
    }
  }

  const data = [
    new Uint8Array([CURRENT_FORMAT_VERSION]),
    encodeCheckpoint(timestamp),
  ];

  // This is "next" as in next chronologically. It comes *before* in list order.
  let nextTimestamp = timestamp;

  for (const record of queue) {
    const ts = record.in ?? record.touched;

    // If this timestamp is after the "next" timestamp, or if the gap
    // between timestamps is too large, we need a new checkpoint
    if (ts > nextTimestamp || nextTimestamp - ts > MAX_MS_GAP) {
      data.push(encodeCheckpoint(ts));
      nextTimestamp = ts;
    }

    if (record.id) {
      data.push(encodeGroup(nextTimestamp, record));
      nextTimestamp = record.touched;
    } else {
      data.push(encodeTime(nextTimestamp, groupIndexesById[record.group], record));
      nextTimestamp = record.in;
    }
  }

  return bytesToBase64(concatBytes(data));
}

/**
 * Converts an encoded clocker string into a wrapper object with a timestamp,
 * an array of clock in/out time objects, and an array of group info objects.
 *
 * Wrapper object properties:
 *   - timestamp: The time the string was encoded in epoch milliseconds,
 *     but rounded down to the nearest second
 *   - times: An array of clock in/out time objects
 *   - groups: An array of group info objects
 *
 * Clock in/out time object properties:
 *   - group: UUID string for the group this time is a part of
 *   - in: Clock in time as Unix epoch milliseconds (rounded to the second)
 *   - out: Optional property which is missing if time has not been clocked out,
 *     otherwise clock out time as epoch milliseconds (rounded to the second)
 *
 * Group Info object properties:
 *   - id: UUID string formatted with the lowercase dashed convention
 *   - touched: The latest time the group was edited or clocked in/out in
 *     epoch milliseconds, but rounded down to the nearest second
 *   - color: RGB color hex string
 *   - label: String label
 */
export function decode(encodedString) {
  const bytes = base64ToBytes(encodedString);
  let index = 0;

  if (bytes.length < 2) {
    throw new Error(`[Clocker Invalid] Too few bytes: ${bytes.length}`);
  }

  if (bytes[index] !== CURRENT_FORMAT_VERSION) {
    throw new Error(`[Clocker Invalid] Unknown version: ${bytes[index]}`);
  }

  index += 1;
  const encodeTime = decodeFromHeader(bytes, index);

  if (encodeTime.type !== CHECKPOINT_TYPE) {
    throw new Error('[Clocker Invalid]: Missing initial timestamp');
  }

  const timestamp = encodeTime.timestamp;
  const times = [];
  const groups = [];

  let currentTs = timestamp;
  index += encodeTime.size;

  while (index < bytes.length) {
    const next = decodeFromHeader(bytes, index);
    index += next.size;

    if (next.type === CHECKPOINT_TYPE) {
      currentTs = next.timestamp;
    }

    if (next.type === TIME_TYPE) {
      if (!groups[next.groupIndex]) {
        throw new Error(`[Clocker Invalid] Missing nth group: ${next.groupIndex}`);
      }

      currentTs -= next.inDiff;
      times.push({
        group: groups[next.groupIndex].id,
        in: currentTs,
        ...(next.outDiff === 0 ? {} : { out: currentTs + next.outDiff })
      });
    }

    if (next.type === GROUP_TYPE) {
      currentTs -= next.touchedDiff;
      groups.push({
        id: next.id,
        touched: currentTs,
        color: next.color,
        label: next.label
      });
    }
  }

  return {
    timestamp,
    times,
    groups
  };
}

function encodeCheckpoint(timestamp) {
  const deltaSeconds = Math.abs(msToSeconds(timestamp));
  const tsBytes = uintToDynamicBytes(deltaSeconds, 7, 4);

  const headerBytes = concatBits([
    CHECKPOINT_TYPE << 6,
    tsBytes.length - 4 << 4,
    // Should maybe save timestamp as signed integer, but dynamically truncating
    // two's complement numbers is a pain so I'll just use this bit as a sign
    (timestamp < 0 ? 1 : 0) << 3
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

  const inBytes = uintToDynamicBytes(inDiff, MAX_TIME_GAP_SIZE);
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

function encodeGroup(nextTimestamp, { id, touched, color, label }) {
  const idBytes = hexToFixedBytes(id, ID_SIZE);
  const colorBytes = hexToFixedBytes(color, COLOR_SIZE);
  const labelBytes = textToDynamicBytes(label, 255);

  const touchedSeconds = msToSeconds(touched);
  const touchedDiff = msToSeconds(nextTimestamp) - touchedSeconds;
  const touchedBytes = uintToDynamicBytes(touchedDiff, MAX_TIME_GAP_SIZE);

  const firstHeaderBytes = concatBits([
    GROUP_TYPE << 6,
    touchedBytes.length << 4
  ]);
  const restHeaderBytes = new Uint8Array([labelBytes.length]);

  return concatBytes([
    firstHeaderBytes,
    restHeaderBytes,
    idBytes,
    touchedBytes,
    colorBytes,
    labelBytes
  ]);
}

function decodeFromHeader(bytes, headerIndex) {
  const type = bytes[headerIndex] >> 6;

  if (type === CHECKPOINT_TYPE) {
    return decodeCheckpoint(bytes, headerIndex);
  }

  if (type === TIME_TYPE) {
    return decodeTime(bytes, headerIndex);
  }

  if (type === GROUP_TYPE) {
    return decodeGroup(bytes, headerIndex);
  }

  throw new Error(`[Clocker Invalid] Unknown data type: ${type}`);
}

function decodeCheckpoint(bytes, headerIndex) {
  const headerByte = bytes[headerIndex];
  const timestampSize = 4 + sliceBits(headerByte, 4, 6);
  const timestampSign = sliceBits(headerByte, 3, 4) === 0 ? 1 : -1;
  const size = 1 + timestampSize;

  if (headerIndex + size > bytes.length) {
    return { type: -1, size };
  }

  const timestampIndex = headerIndex + 1;
  const end = timestampIndex + timestampSize;
  const tsSeconds = bytesToUint(bytes.slice(timestampIndex, end));

  return {
    type: CHECKPOINT_TYPE,
    size,
    timestamp: timestampSign * secondsToMs(tsSeconds)
  };
}

function decodeTime(bytes, headerIndex) {
  const headerByte = bytes[headerIndex];
  const groupIndexSize = sliceBits(headerByte, 4, 6);
  const inSize = sliceBits(headerByte, 2, 4);
  const outSize = 2 + sliceBits(headerByte, 0, 2);
  const size = 1 + groupIndexSize + inSize + outSize;

  if (headerIndex + size > bytes.length) {
    return { type: -1, size };
  }

  const groupIndexIndex = headerIndex + 1;
  const inIndex = groupIndexIndex + groupIndexSize;
  const outIndex = inIndex + inSize;
  const end = outIndex + outSize;

  return {
    type: TIME_TYPE,
    size,
    groupIndex: bytesToUint(bytes.slice(groupIndexIndex, inIndex)),
    inDiff: secondsToMs(bytesToUint(bytes.slice(inIndex, outIndex))),
    outDiff: secondsToMs(bytesToUint(bytes.slice(outIndex, end)))
  };
}

function decodeGroup(bytes, headerIndex) {
  const firstHeaderByte = bytes[headerIndex];
  const touchedSize = sliceBits(firstHeaderByte, 4, 6);
  const labelSize = bytes[headerIndex + 1];
  const size = 2 + ID_SIZE + touchedSize + COLOR_SIZE + labelSize;

  if (headerIndex + size > bytes.length) {
    return { type: -1, size };
  }

  const idIndex = headerIndex + 2;
  const touchedIndex = idIndex + ID_SIZE;
  const colorIndex = touchedIndex + touchedSize;
  const labelIndex = colorIndex + COLOR_SIZE;
  const end = labelIndex + labelSize;

  return {
    type: GROUP_TYPE,
    size,
    id: bytesToUuid(bytes.slice(idIndex, colorIndex)),
    touchedDiff: secondsToMs(bytesToUint(bytes.slice(touchedIndex, colorIndex))),
    color: '#' + bytesToFixedHex(bytes.slice(colorIndex, labelIndex), 6),
    label: bytesToText(bytes.slice(labelIndex, end))
  };
}

function msToSeconds(ms) {
  return Math.floor(ms / 1000);
}

function secondsToMs(seconds) {
  return Math.round(seconds * 1000);
}

function clamp(value, max, min = 0) {
  return Math.max(Math.min(value, max), min);
}

function sliceBits(value, right, left) {
  const shifted = value >> right;
  const mask = 2 ** (left - right) - 1;
  return shifted & mask;
}

function concatBits(arrayOfOffsetBits) {
  const byte = arrayOfOffsetBits.reduce((sum, bits) => sum + bits, 0);
  return new Uint8Array([byte]);
}

function concatBytes(arrayOfBytes) {
  const size = arrayOfBytes.reduce((sum, bytes) => sum + bytes.length, 0);
  const concatted = new Uint8Array(size);
  let index = 0;

  for (const bytes of arrayOfBytes) {
    concatted.set(bytes, index);
    index += bytes.length;
  }

  return concatted;
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

function bytesToUint(bytes) {
  const padded = new Uint8Array(8);
  padded.set(bytes, padded.length - bytes.length);
  const dataView = new DataView(padded.buffer);
  const bigInt = dataView.getBigUint64(0);
  return Number(bigInt);
}

function hexToFixedBytes(hexString, byteSize) {
  const sanitized = hexString
    .replaceAll(/[^0-9a-f]/gi, '')
    .padStart(byteSize * 2, '0')
    .slice(0, byteSize * 2);

  return Uint8Array.fromHex(sanitized);
}

function bytesToFixedHex(bytes, hexLength) {
  return bytes.toHex().slice(0, hexLength).padStart(hexLength, '0');
}

function bytesToUuid(bytes) {
  const hex = bytesToFixedHex(bytes, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

function textToDynamicBytes(utf8String, maxByteSize) {
  const encoder = new TextEncoder();
  return encoder.encode(utf8String).slice(0, maxByteSize);
}

function bytesToText(bytes) {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

function bytesToBase64(bytes) {
  return bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
}

function base64ToBytes(base64String) {
  // If string was truncated, there may be a single character without padding
  // after the last quartet. That is invalid and throws an error. Just drop it.
  const sanitized = base64String.length % 4 === 1 ? base64String.slice(0, -1) : base64String;
  return Uint8Array.fromBase64(sanitized, { alphabet: 'base64url' });
}
