
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                 C. HEX-PREFIX ENCODING                    *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.C


// equation (190)
/** HP(x, t) */
export function hexPrefixEncode(nibbles: number[], t: number) {
  if (nibbles.length % 2 === 0) {
    const result = [ 16 * hpFlag(t) ];
    for (let i = 0 ; i < nibbles.length ; i += 2) {
      result.push((16 * nibbles[i]) + nibbles[i + 1]);
    }
    return new Uint8Array(result);
  }
  const result = [ (16 * (hpFlag(t) + 1)) + nibbles[0] ];
  for (let i = 1 ; i < nibbles.length ; i += 2) {
    result.push((16 * nibbles[i]) + nibbles[i + 1]);
  }
  return new Uint8Array(result);
}

// equation (191)
/** f(t) */
export function hpFlag(t: number) {
  if (t !== 0) return 2;
  return 0;
}

