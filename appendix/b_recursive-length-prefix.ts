
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *               B. RECURSIVE LENGTH PREFIX                  *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.B


// equation (180)
/** T */
export type Input = List | ByteArray | bigint;

// equation (181)
/** L */
export type List = Input[];

// equation (182)
/** B */
export type ByteArray = Uint8Array;

// equation (189)
/** RLP(x) */
export function rlp(x: bigint): Uint8Array;

// equation (183)
/** RLP(x) */
export function rlp(x: Input): Uint8Array;
/** RLP(x) */
export function rlp(x: bigint | Input): Uint8Array {
  if (typeof x === 'bigint') return rlp(toBigEndian(x)); // equation (189)
  if (x instanceof Uint8Array) return encodeBytes(x);
  return encodeList(x);
}

// equation (184)
/** Rb(x) */
export function encodeBytes(x: ByteArray): ByteArray {
  if (x.length === 1 && x[0] < 128) return x;
  else if (x.length < 56) return concat(new Uint8Array([ 128 + x.length ]), x);
  else if (x.length < 2 ** 64) return concat(new Uint8Array(183 + toBigEndian(BigInt(x.length)).length), toBigEndian(BigInt(x.length)), x);
  return new Uint8Array();
}

// equation (185)
/** BE(x) */
export function toBigEndian(x: bigint): Uint8Array {
  let hex = x.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex; // Ensure even length

  const numBytes = hex.length / 2;
  const byteArray = new Uint8Array(numBytes);

  for (let i = 0, j = 0; i < numBytes; i++, j += 2) {
    byteArray[i] = parseInt(hex.slice(j, j + 2), 16);
  }

  return byteArray;
}

// equation (186)
/** . */
export function concat(...items: ByteArray[]): ByteArray {
  let result = new Uint8Array();
  for (let item of items) {
    result = new Uint8Array([ ...result, ...item ]);
  }
  return result;
}

// equation (187)
/** Rl(x) */
export function encodeList(x: List) {
  const s = rlpSerialize(x);
  if (s !== null && s.length < 56) return concat(new Uint8Array([ 192 + s.length ]), s);
  else if (s !== null && s.length < 2 ** 64) return concat(new Uint8Array([247 + toBigEndian(BigInt(s.length)).length]), toBigEndian(BigInt(s.length)), s);
  return new Uint8Array();
}

// equation (188)
/** s(x) */
export function rlpSerialize(x: List) {
  let result = new Uint8Array();
  for (let item of x) {
    const s = rlp(item);
    if (s.length !== 0) result = concat(result, s);
    else null;
  }
  return result;
}

