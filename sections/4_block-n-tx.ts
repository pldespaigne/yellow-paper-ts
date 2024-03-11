
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *            4. BLOCKS, STATE AND TRANSACTIONS              *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.4


import { bytesToHexString, hexStringToBytes } from '../utils';

import { fork, mainNetChainId } from './2_blockchain';
import { KEC } from './3_conventions';
import { rlp } from '../appendix/b_recursive-length-prefix';
import { computeRootHash } from '../appendix/d_merkle-patricia-tree';


// * ---------------------------
// *  4.1. World State.

/** σ : `bytesToHexString(address)` -> `account` */
export type WorldState = Record<string, Account>;

/** σ[a] */
export interface Account {
  /** σ[a]n */
  nonce: bigint;
  /** σ[a]b */
  balance: bigint;
  /** σ[a]s */
  storageRoot: Uint8Array;
  /** σ[a]s */
  storage: Record<string, Uint8Array>;
  /** σ[a]c */
  codeHash: Uint8Array;
  /** σ[a]c */
  code: Uint8Array;
};

// equation (7)
export function computeStorageRoot(storage: Record<string, Uint8Array>) {
  const storageEntries = Object.entries(storage);
  const encodedStorage = map(storageEntries, ([ key, value ]) => encodeStorageSlot(key, value));
  return computeRootHash(encodedStorage);
}

// equation (8)
export function encodeStorageSlot(key: string, value: Uint8Array): [ Uint8Array, Uint8Array ] {
  const bytesKey = hexStringToBytes(key);

  const valid = isValidStorageSlot(bytesKey, value);
  if (!valid) throw new Error(`Invalid storage slot: ${key} => ${value}`);

  return [ KEC(bytesKey), rlp(value) ];
}

// equation (9)
export function isValidStorageSlot(key: Uint8Array, value: Uint8Array) {
  return isB(key, 32) && value instanceof Uint8Array;
}

// equation (10)
/** LS(σ) */
export function serializeWorldState(worldState: WorldState) {
  return Object.entries(worldState).map(([address, account]) => serializeAccount(address, account));
}

// equation (11)
/** p(a) */
export function serializeAccount(address: string, account: Account): [ Uint8Array, Uint8Array ] {
  const bytesAddress = hexStringToBytes(address);
  if (bytesAddress.length !== 20) throw new Error(`Invalid address length: ${address}`);
  return [ KEC(bytesAddress), rlp([ account.nonce, account.balance, account.storageRoot, account.codeHash ]) ];
}

// equation (12)
export function isWorldStateValid(worldState: WorldState) {
  return Object.entries(worldState).every(([address, account]) => {
    const bytesAddress = hexStringToBytes(address);
    return isB(bytesAddress, 20) && isAccountValid(account);
  });
}

// equation (13)
/** v(x) */
export function isAccountValid(account: Account) {
  return (
    account.nonce >= 0 && account.nonce < 2n ** 256n && // xn ∈ N256
    account.balance >= 0 && account.balance < 2n ** 256n && // xb ∈ N256
    isB(account.storageRoot, 32) && // xs ∈ B32
    isB(account.codeHash, 32) // xc ∈ B32
  );
}

// equation (14)
/** EMPTY(σ, a) */
export function isAccountEmpty(state: WorldState, address: Uint8Array) {
  const emptyHash = KEC(new Uint8Array());
  const codeHash = state[bytesToHexString(address)]?.codeHash;
  let emptyCode = emptyHash.length !== codeHash.length;
  if (!emptyCode) {
    for (let i = 0; i < emptyHash.length; i++) {
      if (emptyHash[i] !== codeHash[i]) {
        emptyCode = true;
        break;
      }
    }
  }
  if (
    emptyCode &&
    state[bytesToHexString(address)]?.nonce === 0n &&
    state[bytesToHexString(address)]?.balance === 0n
  ) return true;
  return false;
}

// equation (15)
/** DEAD(σ, a) */
export function isAccountDead(state: WorldState, address: Uint8Array) {
  if (
    !state[bytesToHexString(address)] ||
    isAccountEmpty(state, address)
  ) return true;
  return false;
}


// * ---------------------------
// *  4.2. The Transaction.


/** E */
export type AccessList = [
  /** Ea */
  address: Uint8Array,
  /** Es */
  storageKeys: Uint8Array[],
];

/** T */
export interface MinimalTransaction {
  /** Tx */
  type: 0n | 1n | 2n;
  /** Tn */
  nonce: bigint;
  /** Tg */
  gasLimit: bigint;
  /** Tv */
  value: bigint;
  /** Tr */
  r: bigint;
  /** Ts */
  s: bigint;
};
export type ContractCreation = MinimalTransaction & {
  /** Tt */
  to: null;
  /** Ti */
  init: Uint8Array;
};
export type MessageCall = MinimalTransaction & {
  /** Tt */
  to: Uint8Array;
  /** Td */
  data: Uint8Array;
};
export type TransactionType0 = (ContractCreation | MessageCall) & {
  /** Tx */
  type: 0n;
  /** Tw */
  w: bigint; // * formally w = 27 + yParity OR w = (2 * chainId) + 35 + yParity
  /** Tp */
  gasPrice: bigint;
};
export type TransactionType1 = (ContractCreation | MessageCall) & {
  /** Tx */
  type: 1n;
  /** Ta */
  accessList: AccessList[];
  /** Tc */
  chainId: bigint;
  /** Ty */
  yParity: bigint;
  /** Tp */
  gasPrice: bigint;
};
export type TransactionType2 = (ContractCreation | MessageCall) & {
  /** Tx */
  type: 2n;
  /** Ta */
  accessList: AccessList[];
  /** Tc */
  chainId: bigint;
  /** Ty */
  yParity: bigint;
  /** Tm */
  maxFeePerGas: bigint;
  /** Tf */
  maxPriorityFeePerGas: bigint;
};

/**
 * T
 */
export type Transaction = TransactionType0 | TransactionType1 | TransactionType2;


// equation (16)
/** LT(T) */
export function serializeTransaction(transaction: Transaction) {
  if (transaction.type === 0n) {
    return [
      transaction.nonce,
      transaction.gasPrice,
      transaction.gasLimit,
      transaction.to === null ? new Uint8Array() : transaction.to,
      transaction.value,
      getTransactionPayload(transaction),
      transaction.w,
      transaction.r,
      transaction.s,
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
      transaction.yParity,
      transaction.r,
      transaction.s,
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
      transaction.yParity,
      transaction.r,
      transaction.s,
    ];
  }
  throw new Error(`Invalid transaction object`);
}

// equation (17)
/** p */
export function getTransactionPayload(transaction: Transaction) {
  if (transaction.to === null) {
    return transaction.init;
  }
  return transaction.data;
}

// equation (18)
export function isValidTransactionBody(transaction: Transaction) {
  return (
    [ 0n, 1n, 2n ].includes(transaction.type) &&
    (!('chainId' in transaction) || transaction.chainId === mainNetChainId) &&
    isN(transaction.nonce, 256) &&
    (!('gasPrice' in transaction) || isN(transaction.gasPrice, 256)) &&
    isN(transaction.gasLimit, 256) &&
    isN(transaction.value, 256) &&
    (!('w' in transaction) || isN(transaction.w, 256)) &&
    isN(transaction.r, 256) &&
    isN(transaction.s, 256) &&
    (!('yParity' in transaction) || isN(transaction.yParity, 1)) &&
    (!('data' in transaction) || transaction.data instanceof Uint8Array) &&
    (!('init' in transaction) || transaction.init instanceof Uint8Array) &&
    (!('maxFeePerGas' in transaction) || isN(transaction.maxFeePerGas, 256)) &&
    (!('maxPriorityFeePerGas' in transaction) || isN(transaction.maxPriorityFeePerGas, 256))
  );
}

// equation (19)
/** Nn */
export function isN(value: bigint, bits?: number) {
  return value >= 0n && (bits === undefined || value < 2n ** BigInt(bits));
}

// equation (20)
export function isValidToAddress(transaction: Transaction) {
  if (transaction.to !== null) return isB(transaction.to, 20);
  return transaction.to === null;
}


// * ---------------------------
// *  4.3. The Block.


/** H */
export interface BlockHeader {
  /** Hp */
  parentHash: Uint8Array;
  /** @deprecated Ho */
  unclesHash: Uint8Array;
  /** Hc */
  coinbase: Uint8Array;
  /** Hr */
  worldStateRoot: Uint8Array;
  /** Ht */
  transactionsRoot: Uint8Array;
  /** He */
  receiptsRoot: Uint8Array;
  /** Hb */
  logsBloom: Uint8Array;
  /** @deprecated Hd */
  difficulty: 0n;
  /** Hi */
  number: bigint;
  /** Hl */
  gasLimit: bigint;
  /** Hg */
  gasUsed: bigint;
  /** Hs */
  timestamp: bigint;
  /** Hx */
  extraData: Uint8Array;
  /** Ha */
  prevRandao: Uint8Array;
  /** @deprecated Hn */
  nonce: Uint8Array;
  /** Hf */
  baseFeePerGas: bigint;
};

// equation (21)
/** B */
export interface Block {
  /** BH */
  header: BlockHeader;
  /** BT */
  transactions: Transaction[];
  /** BR */
  receipts: Receipt[]; // this is not formally defined as part of the block, but later it is referred as if it was
  /** BU */
  uncleHeaders: BlockHeader[];
};


// *    4.3.1. Transaction Receipt.


// equation (22)
/** R or BR[i] */
export interface Receipt {
  /** Rx */
  type: 0n | 1n | 2n;
  /** Rz */
  status: bigint;
  /** Ru */
  cumulativeGasUsed: bigint;
  /** Rl */
  logs: Log[];
  /** Rb */
  logsBloom: Uint8Array;
};

// equation (23)
/** LR(R) */
export function serializeReceipt(receipt: Receipt) {
  return [
    receipt.status,
    receipt.cumulativeGasUsed,
    receipt.logsBloom,
    receipt.logs,
  ];
}

// equation (24)
export function isValidReceiptStatus(receipt: Receipt) {
  return isN(receipt.status);
}

// equation (25)
export function isValidReceiptGasAndBloom(receipt: Receipt) {
  return (
    isN(receipt.cumulativeGasUsed) &&
    isB(receipt.logsBloom, 256)
  );
}

// equation (26)
/** O */
export type Log = [
  /** Oa */
  address: Uint8Array,
  /** Ot */
  topics: Uint8Array[],
  /** Od */
  data: Uint8Array,
];

// equation (27)
export function isValidLog(log: Log) {
  return (
    isB(log[0], 20) &&
    log[1].every(topic => isB(topic, 32)) &&
    isB(log[2])
  );
}

// equation (28)
/** M(O) */
export function computeLogBloom(log: Log) {
  const logBloomBits = new Array<number>(2048).fill(0);

  const blooms = [ singleBloomHash(log[0]) ];
  log[1].forEach(topic => {
    blooms.push(singleBloomHash(topic));
  });

  blooms.forEach(bloom => {
    bloom.forEach((value, index) => {
      if (value === 1) logBloomBits[index] = 1;
    });
  });

  // converts the bits array to a Uint8Array
  const result = new Uint8Array(256);
  for (let i = 0 ; i < logBloomBits.length ; i += 8) {
    const byte = Number(`0b${logBloomBits.slice(i, i + 8).join('')}`);
    result[i / 8] = byte;
  }

  return result;
}

// equation (29)
/** M3:2048(x: x ∈ B) */
export function singleBloomHash(x: Uint8Array) {
  // equation (30)
  const y = new Array<number>(2048).fill(0);

  // equation (31)
  const m0 = hashBytesValue(x, 0);
  y[2047 - m0] = 1;
  const m2 = hashBytesValue(x, 2);
  y[2047 - m2] = 1;
  const m4 = hashBytesValue(x, 4);
  y[2047 - m4] = 1;

  return y;
}


// equation (32)
/** m(x, i) */
export function hashBytesValue(value: Uint8Array, index: number) {
  const hash = KEC(value);
  const b1 = hash[index].toString(16).padStart(2, '0');
  const b2 = hash[index + 1].toString(16).padStart(2, '0');
  return Number(`0x${b1}${b2}`) % 2048;
}

// *    4.3.2. Holistic Validity.


// equation (33)
export function isValidBlock(previousWorldState: WorldState, block: Block) {
  const computedBloom = new Uint8Array(256).fill(0);

  block.receipts.forEach(receipt => {
    receipt.logsBloom.forEach((byte, index) => {
      computedBloom[index] = byte | computedBloom[index];
    });
  });

  return (
    block.uncleHeaders.length === 0 &&
    block.header.worldStateRoot === computeRootHash(serializeWorldState(applyTransactions(previousWorldState, block))) &&
    block.header.transactionsRoot === computeRootHash(block.transactions.map((transaction, index) => encodeTransaction(index, transaction))) &&
    block.header.receiptsRoot === computeRootHash(block.receipts.map((receipt, index) => encodeReceipt(index, receipt))) &&
    bytesToHexString(block.header.logsBloom) === bytesToHexString(computedBloom)
  );
}

// equation (34)
/** pT(k,T) */
export function encodeTransaction(index: number, transaction: Transaction): [ Uint8Array, Uint8Array ] {
  const a = rlp(BigInt(index));
  let b = new Uint8Array();
  if (transaction.type === 0n) {
    b = rlp(serializeTransaction(transaction));
  } else {
    b = new Uint8Array([ Number(transaction.type), ...rlp(serializeTransaction(transaction)) ]);
  }
  return [ a, b ];
}

// equation (35)
/** pR(k,R) */
export function encodeReceipt(index: number, receipt: Receipt): [ Uint8Array, Uint8Array ] {
  const a = rlp(BigInt(index));
  let b = new Uint8Array();
  if (receipt.type === 0n) {
    b = rlp(serializeReceipt(receipt));
  } else {
  }
  return [ a, b ];
}

// equation (36)
export function isInitialWorldStateValid(initialWorldState: WorldState, currentHeader: BlockHeader) {
  return computeRootHash(serializeWorldState(initialWorldState)) === parentBlock(currentHeader).header.worldStateRoot;
}


// *    4.3.3. Serialization.


// equation (37)
/** LH(H) */
export function serializeBlockHeader(blockHeader: BlockHeader) {
  return [
    blockHeader.parentHash,
    blockHeader.unclesHash,
    blockHeader.coinbase,
    blockHeader.worldStateRoot,
    blockHeader.transactionsRoot,
    blockHeader.receiptsRoot,
    blockHeader.logsBloom,
    blockHeader.difficulty,
    blockHeader.number,
    blockHeader.gasLimit,
    blockHeader.gasUsed,
    blockHeader.timestamp,
    blockHeader.extraData,
    blockHeader.prevRandao,
    blockHeader.nonce,
    blockHeader.baseFeePerGas,
  ];
}

// equation (38)
/** LB(B) */
export function serializeBlock(block: Block) {
  return [
    serializeBlockHeader(block.header),
    map(block.transactions, serializeEIP2718Transaction),
    map(block.receipts, serializeReceipt),
  ];
}

// equation (39)
/** ~LT(T) */
export function serializeEIP2718Transaction(transaction: Transaction) {
  if (transaction.type === 0n) {
    return serializeTransaction(transaction);
  }
  return [ Number(transaction.type), ...rlp(serializeTransaction(transaction)) ];
}

// equation (40)
/** f*(x) */
export function map<T, R>(x: T[], fn: (i: T) => R): R[] {
  return x.map(fn);
}

// equation (41)
export function isValidBlockHeaderObjectType(header: BlockHeader) {
  return (
    isB(header.parentHash, 32) &&
    isB(header.unclesHash, 32) &&
    isB(header.coinbase, 20) &&
    isB(header.worldStateRoot, 32) &&
    isB(header.transactionsRoot, 32) &&
    isB(header.receiptsRoot, 32) &&
    isB(header.logsBloom, 256) &&
    isN(header.difficulty) &&
    isN(header.number) &&
    isN(header.gasLimit) &&
    isN(header.gasUsed) &&
    isN(header.timestamp, 256) &&
    isB(header.extraData) &&
    isB(header.prevRandao, 32) &&
    isB(header.nonce, 8) &&
    isN(header.baseFeePerGas)
  );
}

// equation (42)
/** Bn */
export function isB(value: Uint8Array, byteSize?: number) {
  return value instanceof Uint8Array && (byteSize === undefined || value.length === byteSize);
}


// *    4.3.4. Block Header Validity.


// equation (43)
/** P(H) or P(BH) */
export function parentBlock(currentHeader: BlockHeader) {
  const blockchain: Block[] = []; // ! this should be every single blocks of the blockchain
  const parentBlock = blockchain.find(block => KEC(rlp(serializeBlockHeader(block.header))) === currentHeader.parentHash);
  if (!parentBlock) throw new Error(`Parent block not found`);
  return parentBlock;
}

// equation (44)
export function isValidBlockNumber(currentHeader: BlockHeader) {
  return currentHeader.number === parentBlock(currentHeader).header.number + 1n;
}

// equation (45)
/** F(H) */
export function expectedBaseFeePerGas(currentHeader: BlockHeader) {
  if (currentHeader.number === fork.london) return 1_000_000_000n;
  
  const target = gasTarget(currentHeader);
  const parent = parentBlock(currentHeader).header;
  if (parent.gasUsed === target) return parent.baseFeePerGas;

  const v = feeChange(currentHeader);
  if (parent.gasUsed < target) return parent.baseFeePerGas - v;
  if (parent.gasUsed > target) return parent.baseFeePerGas + v;

  throw new Error('This should never happen');
}

// equation (46)
/** τ */
function gasTarget(currentHeader: BlockHeader) {
  return parentBlock(currentHeader).header.gasLimit / elasticityMultiplier; // bigint divisions are automatically floored down
}

// equation (47)
/** ρ */
export const elasticityMultiplier = 2n as const;

// equation (48)
/** v* */
export function vStar(currentHeader: BlockHeader) {
  const target = gasTarget(currentHeader);
  const parent = parentBlock(currentHeader).header;
  if (parent.gasUsed < target) {
    return (parent.baseFeePerGas * (target - parent.gasUsed)) / target; // bigint divisions are automatically floored down
  }
  if (parent.gasUsed > target) {
    return (parent.baseFeePerGas * (parent.gasUsed - target)) / target; // bigint divisions are automatically floored down
  }
  
  throw new Error('Do not call getVStar when `gasUsed === target`');
}

// equation (49)
/** v */
export function feeChange(currentHeader: BlockHeader) {
  const target = gasTarget(currentHeader);
  const vs = vStar(currentHeader);
  const a = vs / feeMaxChangeDenominator; // bigint divisions are automatically floored down
  const parent = parentBlock(currentHeader).header;
  if (parent.gasUsed < target) return a;
  if (parent.gasUsed > target) return a > 1n ? a : 1n; // max(a, 1n)

  throw new Error('Do not call getFeeChange when `gasUsed === target`');
}

// equation (50)
/** ξ */
export const feeMaxChangeDenominator = 8n as const;

// equation (51)
export function isValidGasLimit(currentHeader: BlockHeader) {
  const pGasLimit = parentGasLimit(currentHeader);
  const maxLimit = pGasLimit + (pGasLimit / 1024n); // bigint divisions are automatically floored down
  const minLimit = pGasLimit - (pGasLimit / 1024n); // bigint divisions are automatically floored down

  return (
    currentHeader.gasLimit < maxLimit &&
    currentHeader.gasLimit > minLimit &&
    currentHeader.gasLimit >= 5_000n
  );
}

// equation (52)
/** P(H)hl' */
export function parentGasLimit(currentHeader: BlockHeader) {
  if (currentHeader.number === fork.london) return parentBlock(currentHeader).header.gasLimit * elasticityMultiplier;
  if (currentHeader.number > fork.london) return parentBlock(currentHeader).header.gasLimit;
  throw new Error('Block number is less than London fork');
}

// equation (53)
export function isValidTimestamp(currentHeader: BlockHeader) {
  return currentHeader.timestamp > parentBlock(currentHeader).header.timestamp;
}

// equation (54)
export function isValidUncleHash(currentHeader: BlockHeader) {
  return currentHeader.unclesHash === KEC(rlp([]));
}

// equation (55)
export function isValidDifficulty(currentHeader: BlockHeader) {
  return currentHeader.difficulty === 0n;
}

// equation (56)
export function isValidNonce(currentHeader: BlockHeader) {
  return bytesToHexString(currentHeader.nonce) === '0000000000000000';
}

/**
 * The value of prevRandao must be determined using
 * information from the Beacon Chain. While the details of
 * generating the RANDAO value on the Beacon Chain is
 * beyond the scope of this paper, we refer to the expected
 * RANDAO value for the previous block as PREVRANDAO().
 */
export function PREVRANDAO() {
  return new Uint8Array(32).fill(0); // ! This is not a real implementation
}

// equation (57)
/** V(H) */
export function isValidBlockHeader(currentHeader: BlockHeader) {
  return (
    currentHeader.gasUsed <= currentHeader.gasLimit &&
    isValidGasLimit(currentHeader) &&
    isValidTimestamp(currentHeader) &&
    isValidBlockNumber(currentHeader) &&
    currentHeader.extraData.length <= 32 &&
    currentHeader.baseFeePerGas === expectedBaseFeePerGas(currentHeader) &&
    isValidUncleHash(currentHeader) &&
    isValidDifficulty(currentHeader) &&
    isValidNonce(currentHeader) &&
    currentHeader.prevRandao === PREVRANDAO()
  );
}
