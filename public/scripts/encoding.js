const CURRENT_FORMAT_VERSION = 0;

const CHECKPOINT_TYPE = 0;
const TIME_TYPE = 1;

// Note that since groups cheat and use seven bits for label size,
// they effectively have a data type of BOTH 2 and 3
const GROUP_TYPE = 2;

const MAX_CLOCK_IN_SIZE = 3;
const MAX_SECOND_GAP = 2 ** (MAX_CLOCK_IN_SIZE * 8) - 1;
const ID_SIZE = 16;
const COLOR_SIZE = 3;

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
 *   - color: RGB color hex string
 *   - label: String label
 */
export function decode(encodedString) {
  const bytes = base64ToBytes(encodedString);
  let index = 0;

  if (bytes.length < 2) {
    throw new Error(`Clocker string contains too few bytes: ${bytes.length}`);
  }

  if (bytes[index] !== CURRENT_FORMAT_VERSION) {
    throw new Error(`Unkown clocker string version: ${bytes[index]}`);
  }

  index += 1;
  const encodeTime = decodeFromHeader(bytes, index);

  if (encodeTime.type !== CHECKPOINT_TYPE) {
    throw new Error('Clocker string missing initial timestamp');
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
      currentTs -= next.inDiff;
      times.push({
        group: groups[next.groupIndex].id,
        in: currentTs,
        ...(next.outDiff === 0 ? {} : { out: currentTs + next.outDiff })
      })
    }

    if (next.type === GROUP_TYPE) {
      groups.push(next.group);
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
  const idBytes = hexToFixedBytes(id, ID_SIZE);
  const colorBytes = hexToFixedBytes(color, COLOR_SIZE);
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

function decodeFromHeader(bytes, headerIndex) {
  const type = bytes[headerIndex] >> 6;

  if (type === CHECKPOINT_TYPE) {
    return decodeCheckpoint(bytes, headerIndex);
  }

  if (type === TIME_TYPE) {
    return decodeTime(bytes, headerIndex);
  }

  // Left shift one and then right shift back to clear out
  // the least bit which is ignored for this group type
  if (type >> 1 << 1 === GROUP_TYPE) {
    return decodeGroup(bytes, headerIndex);
  }

  throw new Error(`Unknown header data type: ${type}`);
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
  const headerByte = bytes[headerIndex];
  const labelSize = sliceBits(headerByte, 0, 7);
  const size = 1 + ID_SIZE + COLOR_SIZE + labelSize;

  if (headerIndex + size > bytes.length) {
    return { type: -1, size };
  }

  const idIndex = headerIndex + 1;
  const colorIndex = idIndex + ID_SIZE;
  const labelIndex = colorIndex + COLOR_SIZE;
  const end = labelIndex + labelSize;

  return {
    type: GROUP_TYPE,
    size,
    group: {
      id: bytesToUuid(bytes.slice(idIndex, colorIndex)),
      color: '#' + bytesToFixedHex(bytes.slice(colorIndex, labelIndex), 6),
      label: bytesToText(bytes.slice(labelIndex, end))
    }
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

function base64ToBytes(base64String) {
  return Uint8Array.fromBase64(base64String, { alphabet: 'base64url' });
}
