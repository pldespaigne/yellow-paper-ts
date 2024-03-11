
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                 F. SIGNING TRANSACTIONS                   *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.F


import { secp256k1 } from 'ethereum-cryptography/secp256k1';

import { bytesToBigint } from '../utils';

import { mainNetChainId } from '../sections/2_blockchain';
import { KEC } from '../sections/3_conventions';
import { Transaction, getTransactionPayload, isB } from '../sections/4_block-n-tx';
import { concat, rlp } from './b_recursive-length-prefix';


// equation (299)
/** ECDSAPUBKEY(pr) */
export function ECDSAPUBKEY(privateKey: Uint8Array) {
  const validPrivateKey = isB(privateKey, 32);
  if (!validPrivateKey) throw new Error('Invalid private key');

  const pubKey = secp256k1.getPublicKey(privateKey);

  const validPubkey = isB(pubKey, 64);
  if (!validPubkey) throw new Error('Invalid public key');
  return pubKey;
}

// equation (300)
/** ECDSASIGN(e, pr) */
export function ECDSASIGN(hash: Uint8Array, privateKey: Uint8Array) {
  const validHash = isB(hash, 32);
  if (!validHash) throw new Error('Invalid hash');
  const validPrivateKey = isB(privateKey, 32);
  if (!validPrivateKey) throw new Error('Invalid private key');

  const sig = secp256k1.sign(hash, privateKey);

  const validV = [0, 1].includes(sig.recovery);
  if (!validV) throw new Error('Invalid v');

  return { v: BigInt(sig.recovery), r: sig.r, s: sig.s };
}

// equation (301)
/** ECDSARECOVER(e, v, r, s) */
export function ECDSARECOVER(hash: Uint8Array, v: bigint, r: bigint, s: bigint) {
  const validHash = isB(hash, 32);
  if (!validHash) throw new Error('Invalid hash');

  const sig = new secp256k1.Signature(r, s);
  const p = sig.recoverPublicKey(hash);
  const pubKey = p.toRawBytes();
  const validPubkey = isB(pubKey, 64);
  if (!validPubkey) throw new Error('Invalid public key');

  return pubKey;
}

export function isValidSignature(v: Uint8Array, r: Uint8Array, s: Uint8Array) {
  return (
    // equation (302)
    0n <= bytesToBigint(r) && bytesToBigint(r) <= secp256k1n &&
    // equation (303)
    0n <= bytesToBigint(s) && bytesToBigint(s) <= (secp256k1n / 2n) + 1n &&
    // equation (304)
    [ 0n, 1n ].includes(bytesToBigint(v))
  );
}

// equation (305)
/** secp256k1n */
const secp256k1n = 15792089237316195423570985008687907852837564279074904382605163141518161494337n;

// equation (306)
/** A(pr) */
export function ethAddress(privateKey: Uint8Array) {
  const pubKey = ECDSAPUBKEY(privateKey);
  const hash = KEC(pubKey);
  return hash.slice(96);
}

// equation (307)
/** LX(T) */
export function serializeTransactionForSigning(transaction: Transaction) {
  if (transaction.type === 0n && [ 27n, 28n ].includes(transaction.w)) {
    return [
      transaction.nonce,
      transaction.gasPrice,
      transaction.gasLimit,
      transaction.to === null ? new Uint8Array() : transaction.to,
      transaction.value,
      getTransactionPayload(transaction),
    ];
  }
  if (transaction.type === 0n && [ (2n * mainNetChainId) + 35n, (2n * mainNetChainId) + 36n ].includes(transaction.w)) {
    return [
      transaction.nonce,
      transaction.gasPrice,
      transaction.gasLimit,
      transaction.to === null ? new Uint8Array() : transaction.to,
      transaction.value,
      getTransactionPayload(transaction),
      mainNetChainId,
      [],
      [],
    ];
  }
  if (transaction.type === 1n) {
    return [
      transaction.chainId,
      transaction.nonce,
      transaction.gasPrice,
      transaction.gasLimit,
      transaction.to === null ? new Uint8Array() : transaction.to,
      transaction.value,
      getTransactionPayload(transaction),
      transaction.accessList,
    ];
  }
  if (transaction.type === 2n) {
    return [
      transaction.chainId,
      transaction.nonce,
      transaction.maxPriorityFeePerGas,
      transaction.maxFeePerGas,
      transaction.gasLimit,
      transaction.to === null ? new Uint8Array() : transaction.to,
      transaction.value,
      getTransactionPayload(transaction),
      transaction.accessList,
    ];
  }
  throw new Error('Invalid transaction type');
}

// equation (308)
/** h(T) */
export function transactionHash(transaction: Transaction) {
  if (transaction.type === 0n) return KEC(rlp(serializeTransactionForSigning(transaction))!);
  else return KEC(concat(new Uint8Array([Number(transaction.type)]), rlp(serializeTransactionForSigning(transaction))!));
}

// equation (309)
/** G(T, pr) */
export function signTransaction(transaction: Transaction, privateKey: Uint8Array) {
  // equation (310)
  const { v, r, s } = ECDSASIGN(transactionHash(transaction), privateKey);
  if (transaction.type !== 0n) transaction.yParity = v;
  transaction.r = r;
  transaction.s = s;

  return transaction;
}

// equation (311)
// `transaction.r = signature.r;`

// equation (312)
// `transaction.s = signature.s;`

// equation (313)
/** S(T) */
export function  sender(transaction: Transaction) {
  // equation (314)
  let v = 0n;
  if (transaction.type === 0n && [ 27n, 28n ].includes(transaction.w)) v = transaction.w - 27n;
  else if (transaction.type === 0n && [ (2n * mainNetChainId) + 35n, (2n * mainNetChainId) + 36n ].includes(transaction.w)) v = (transaction.w - 35n) % 2n;
  else if (transaction.type === 1n || transaction.type === 2n) v = transaction.yParity

  const pubKey = ECDSARECOVER(transactionHash(transaction), v, transaction.r, transaction.s);
  const hash = KEC(pubKey);
  return hash.slice(96);
}

// equation (315)
export function isPrivateKeySender(transaction: Transaction, privateKey: Uint8Array) {
  return sender(signTransaction(transaction, privateKey)).toString() === ethAddress(privateKey).toString();
}

