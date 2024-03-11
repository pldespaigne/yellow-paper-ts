
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                 6. TRANSACTION EXECUTION                  *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.6


import { bytesToHexString } from '../utils';

import { KEC, getLast } from './3_conventions';
import { Block, Log, Transaction, WorldState, getTransactionPayload } from './4_block-n-tx';
import { precompiledAddresses } from './8_message-call';
import { cost } from '../appendix/g_fees';
import { sender } from '../appendix/f_signing-tx';


// equation (58) // TODO

// * ---------------------------
// *  6.1. Substate.


// equation (59)
/** A */
export interface AccruedSubState {
  /** As */
  selfDestructAccounts: Uint8Array[]
  /** Al */
  logs: Log[];
  /** At  */
  touchedAccounts: Uint8Array[]
  /** Ar */
  refund: bigint;
  /** Aa  */
  accessedAccounts: Uint8Array[]
  // ! Nothing prevent to push the same storage key multiple times
  /** AK : `(address, storageKey)[]` */
  accessedStorageKeys: [Uint8Array, Uint8Array][]; // TODO THIS SHOULD BE A SET OR SOME KIND
};

// equation (60)
/** A0 */
export function emptyAccruedSubState(): AccruedSubState {
  return {
    selfDestructAccounts: [],
    logs: [],
    touchedAccounts: [],
    refund: 0n,
    accessedAccounts: [ ...precompiledAddresses().map(bytes => new Uint8Array(bytes)) ],
    accessedStorageKeys: [],
  };
}


// * ---------------------------
// *  6.2. Execution.


// equation (61)
/** g0 */
export function intrinsicGasCost(transaction: Transaction) {
  let gasCost = 0n;

  const payload = getTransactionPayload(transaction);
  for (let byte of payload) {
    if (byte === 0) gasCost += cost.txDataZero;
    else gasCost += cost.txDataNonZero;
  }

  if (transaction.to === null) gasCost += cost.txCreate;

  gasCost += cost.transaction;

  if ('accessList' in transaction) {
    for (let access of transaction.accessList) {
      gasCost += cost.accessListAddress + BigInt(access[1].length) * cost.accessListStorage;
    }
  }

  return gasCost;
}

// equation (62)
/** p */
export function effectiveGasPrice(transaction: Transaction, block: Block) {
  if (transaction.type === 0n || transaction.type === 1n) return transaction.gasPrice;
  if (transaction.type === 2n) return priorityFee(transaction, block) + block.header.baseFeePerGas;

  throw new Error('This should never happen');
}

// equation (63)
/** f */
export function priorityFee(transaction: Transaction, block: Block) {
  if (transaction.type === 0n || transaction.type === 1n) return transaction.gasPrice - block.header.baseFeePerGas;
  if (transaction.type === 2n) {
    const a = transaction.maxFeePerGas - block.header.baseFeePerGas;
    return transaction.maxPriorityFeePerGas > a ? a : transaction.maxPriorityFeePerGas; // min(transaction.maxPriorityFeePerGas, a)
  }

  throw new Error('This should never happen');
}

// equation (64)
/** v0 */
export function upFrontGasCost(transaction: Transaction) {
  if (transaction.type === 0n || transaction.type === 1n) return (transaction.gasLimit * transaction.gasPrice) + transaction.value;
  if (transaction.type === 2n) return (transaction.gasLimit * transaction.maxFeePerGas) + transaction.value;

  throw new Error('This should never happen');
}

// equation (65)
export function isTransactionValid(transaction: Transaction, block: Block, worldState: WorldState) {
  const senderAddress = sender(transaction);
  return (
    senderAddress !== null &&
    worldState[bytesToHexString(senderAddress)].codeHash === KEC(new Uint8Array()) &&
    transaction.nonce === worldState[bytesToHexString(senderAddress)].nonce &&
    intrinsicGasCost(transaction) <= transaction.gasLimit &&
    upFrontGasCost(transaction) <= worldState[bytesToHexString(senderAddress)].balance &&
    txMaxGasPrice(transaction) <= block.header.baseFeePerGas &&
    transaction.gasLimit <= block.header.gasLimit - getLast(block.receipts).cumulativeGasUsed
  );
}

// equation (66)
/** m */
function txMaxGasPrice(transaction: Transaction) {
  if (transaction.type === 0n || transaction.type === 1n) return transaction.gasPrice;
  if (transaction.type === 2n) return transaction.maxFeePerGas;

  throw new Error('This should never happen');
}

// equation (67)
export function isTransactionType2Valid(transaction: Transaction, block: Block, worldState: WorldState) {
  return (
    transaction.type === 2n &&
    isTransactionValid(transaction, block, worldState) &&
    transaction.maxFeePerGas >= transaction.maxPriorityFeePerGas
  );
}

// equation (68)
/** σ0 */
export function createCheckpointState(worldState: WorldState, transaction: Transaction, block: Block) {
  const senderAddress = sender(transaction);

  // equation (69)
  worldState[bytesToHexString(senderAddress)].balance -= (transaction.gasLimit * effectiveGasPrice(transaction, block));

  // equation (70)
  worldState[bytesToHexString(senderAddress)].nonce++;

  return worldState;
}

// equation (71) // TODO
// equation (72) // TODO
// equation (73) // TODO
// equation (74) // TODO

// equation (75)
/** g */
export function initialRemainingGas(transaction: Transaction) {
  return transaction.gasLimit - intrinsicGasCost(transaction);
}

// equation (76)
/** g* */
export function refundAmount(remainingGas: bigint, transaction: Transaction, subState: AccruedSubState) {
  const a = (transaction.gasLimit - remainingGas) / 5n; // bigint divisions are automatically floored down
  const b = a < subState.refund ? a : subState.refund; // min(a, subState.refund)
  return remainingGas + b;
}

// equation (77) // TODO
// equation (78) // TODO
// equation (79) // TODO
// equation (80) // TODO
// equation (81) // TODO
// equation (82) // TODO
// equation (83) // TODO
// equation (84) // TODO
// equation (85) // TODO

