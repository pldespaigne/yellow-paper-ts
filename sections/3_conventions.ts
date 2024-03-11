
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                     3. CONVENTIONS                        *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.3


import { keccak256, keccak512 } from 'ethereum-cryptography/keccak';


/** KEC */
export const KEC = keccak256;

/** KEC512 */
export const KEC512 = keccak512;

// equation (6)
/** l(x) */
export function getLast<T>(array: T[]) {
  return array[array.length - 1];
}

