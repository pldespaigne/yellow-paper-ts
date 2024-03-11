
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                     8. MESSAGE CALL                       *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.8


import { bigintToBytes, bytesToBigint, bytesToHexString } from '../utils';

import { KEC } from './3_conventions';
import { WorldState } from './4_block-n-tx';
import { AccruedSubState } from './6_tx-execution';
import { Environment } from './9_execution-model';
import { computeRootHash } from '../appendix/d_merkle-patricia-tree';


// equation (113)
/** Θ(σ, A, s, o, r, c, g, p, v, ˜v, d, e, w) */
export function messageCall(
  /** σ */
  worldState: WorldState,
  /** A */
  subState: AccruedSubState,
  /** s */
  sender: Uint8Array,
  /** o */
  origin: Uint8Array,
  /** r */
  recipient: Uint8Array,
  /** c */
  codeAddress: Uint8Array,
  /** g */
  availableGas: bigint,
  /** v */
  transferredValue: bigint,
  /** ~v */
  apparentValue: bigint,
  /** p */
  effectiveGasPrice: bigint,
  /** d */
  data: Uint8Array,
  /** e */
  callStackDepth: number,
  /** w */
  allowModifications: boolean,
): {
  /** σ' */
  worldState: WorldState,
  /** g' */
  remainingGas: bigint,
  /** A' */
  subState: AccruedSubState,
  /** z */
  status: bigint,
  /** o */
  output: Uint8Array,
} {

  // equation (114 - 120)
  const transitionalState = firstTransitionalState(worldState, sender, recipient, transferredValue);

  // equation (134)
  let runCode = () => {};
  if (bytesToBigint(codeAddress) === 1n) runCode = executeECRecover;
  else if (bytesToBigint(codeAddress) === 2n) runCode = executeSHA256;
  else if (bytesToBigint(codeAddress) === 3n) runCode = executeRIP160;
  else if (bytesToBigint(codeAddress) === 4n) runCode = executeID;
  else if (bytesToBigint(codeAddress) === 5n) runCode = executeExpMod;
  else if (bytesToBigint(codeAddress) === 6n) runCode = executeBnAdd;
  else if (bytesToBigint(codeAddress) === 7n) runCode = executeBnMul;
  else if (bytesToBigint(codeAddress) === 8n) runCode = executeSnarkVerify;
  else if (bytesToBigint(codeAddress) === 9n) runCode = executeBlake2F;
  else runCode = execute;

  const environment: Environment = {
    currentAddress: recipient,          // equation (126)
    originAddress: origin,              // equation (127)
    gasPrice: effectiveGasPrice,        // equation (128)
    callData: data,                     // equation (129)
    callerAddress: sender,              // equation (130)
    value: apparentValue,               // equation (131)
    callDepth: callStackDepth,          // equation (132)
    canModifyState: allowModifications, // equation (133)
    code: transitionalState[bytesToHexString(codeAddress)].code, // equation (135)
    blockHeader: ,
  };

  // equation (125)
  const executionResult = runCode(transitionalState, availableGas, subState, environment);

  // equation (121)
  const finalState = executionResult.worldState === null ? worldState : executionResult.worldState;

  // equation (122) // TODO be careful: does normal execution produce empty output?
  const remainingGas = (executionResult.worldState === null || executionResult.output.length === 0) ? 0n : executionResult.remainingGas;

  // equation (123)
  const finalSubState = executionResult.worldState === null ? subState : executionResult.subState;

  // equation (124)
  const status = executionResult.worldState === null ? 0n : 1n;

  return {
    /** σ' */
    worldState: finalState,
    /** g' */
    remainingGas,
    /** A' */
    subState: finalSubState,
    /** z */
    status,
    /** z */
    output: executionResult.output as Uint8Array, // TODO remove typing
  };
}


// equation (114) : see equation (117) and equation (120)


export function firstTransitionalState(worldState: WorldState, sender: Uint8Array, recipient: Uint8Array, value: bigint){
  // equation (115) and equation (118)
  const state = structuredClone(worldState); // cloning world state to avoid mutating it

  const senderAccount = state[bytesToHexString(sender)];
  const recipientAccount = state[bytesToHexString(recipient)];

  // equation (116)
  if (senderAccount === undefined && value === 0n) delete state[bytesToHexString(sender)];
  else {
    // equation (117) and right part of equation (114)
    senderAccount.balance -= value;
  }

  // equation (119)
  if (recipientAccount === undefined && value !== 0n) {
    state[bytesToHexString(recipient)] = {
      nonce: 0n,
      balance: value,
      storageRoot: computeRootHash([]),
      storage: {},
      codeHash: KEC(new Uint8Array()),
      code: new Uint8Array(),
    };
  } else if (recipientAccount === undefined && value === 0n) {
    delete state[bytesToHexString(recipient)];
  } else {
    // equation (120) and left part of equation (114)
    state[bytesToHexString(recipient)].balance += value;
  }

  return state;
}

// equation (136)
/** π */
export function precompiledAddresses() {
  return [
    bigintToBytes(1n, 20),
    bigintToBytes(2n, 20),
    bigintToBytes(3n, 20),
    bigintToBytes(4n, 20),
    bigintToBytes(5n, 20),
    bigintToBytes(6n, 20),
    bigintToBytes(7n, 20),
    bigintToBytes(8n, 20),
    bigintToBytes(9n, 20),
  ];
}

