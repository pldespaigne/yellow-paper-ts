
/**
 * Stringify a bigint to a 0x hex string, with a `n` suffix
 * It is used to serialize addresses, storage keys, etc...
 * in order to use those values as index keys in `Record` types
 */
export function bigintToHexString(value: bigint) {
  return `0x${value.toString(16)}n`;
}

export function stringToBigint(value: string) {
  return BigInt(value);
}

export function bigintToBytes(value: bigint, byteSize: number): Uint8Array {
  const result = new Uint8Array(byteSize);
  for (let i = 0; i < byteSize; i++) {
    result[byteSize - i - 1] = Number((value >> BigInt(8 * i)) & BigInt(0xff));
  }
  return result;
}

export function bytesToBigint(value: Uint8Array): bigint {
  return BigInt(`0x${bytesToHexString(value)}n`);
}


// TODO ADD BYTE SIZE
export function hexStringToBytes(value: string): Uint8Array {

  // hex string regex with optional prefix `0x` and suffix `n` 
  const isValid = /^(0x)?[0-9a-fA-F]+(n)?$/.test(value);
  if (!isValid) throw new Error(`Invalid hex string: ${value}`);

  let v = value;
  if (v.startsWith('0x')) v = v.slice(2);
  if (v.endsWith('n')) v = v.slice(0, -1);
  if (v.length % 2 !== 0) v = `0${v}`;

  const result = new Uint8Array(v.length / 2);
  for (let i = 0; i < v.length; i += 2) {
    const byte = parseInt(v.slice(i, i + 2), 16);
    result[i / 2] = byte;
  }
  return result;
}

export function bytesToHexString(value: Uint8Array) {
  return [...value].map(x => x.toString(16).padStart(2, '0')).join('');
}
