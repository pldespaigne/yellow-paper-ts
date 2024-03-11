
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                   7. CONTRACT CREATION                    *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.7


import { bytesToHexString } from '../utils';

import { KEC } from './3_conventions';
import { WorldState, isAccountDead, isB } from './4_block-n-tx';
import { AccruedSubState } from './6_tx-execution';
import { Environment } from './9_execution-model';
import { concat, rlp } from '../appendix/b_recursive-length-prefix';
import { computeRootHash } from '../appendix/d_merkle-patricia-tree';
import { cost } from '../appendix/g_fees';


// equation (86)
/** ζ */
export function isValidSalt(salt: Uint8Array) {
  return (
    isB(salt, 32) ||
    isB(salt, 0)
  );
}

// equation (87)
/** Λ(σ, A, s, o, g, p, v, i, e, ζ, w) */
export function createContract(
  /** σ */
  worldState: WorldState,
  /** A */
  subState: AccruedSubState,
  /** s */
  sender: Uint8Array, 
  /** o */
  origin: Uint8Array,
  /** g */
  availableGas: bigint,
  /** p */
  effectiveGasPrice: bigint,
  /** v */
  value: bigint,
  /** i */
  initCode: Uint8Array,
  /** e */
  callStackDepth: number,
  /** ζ */
  salt: Uint8Array,
  /** w */
  allowModifications: boolean,
) {
  // equation (88)
  const senderNonce = worldState[bytesToHexString(sender)].nonce - 1n;

  // equation (89)
  const newContractAddress = contractCreationAddress(sender, senderNonce, salt, initCode);
  
  // equation (91)
  const newSubState = contractCreationSubState(newContractAddress, subState);

  // equation (92)
  const newWorldState = contractCreationWorldState(sender, newContractAddress, value, worldState);

  const environment: Environment = {
    currentAddress: newContractAddress, // equation (98)
    originAddress: origin,              // equation (99)
    gasPrice: effectiveGasPrice,        // equation (100)
    callData: new Uint8Array(),         // equation (101)
    callerAddress: sender,              // equation (102)
    value: value,                       // equation (103)
    code: initCode,                     // equation (104)
    callDepth: callStackDepth,          // equation (105)
    canModifyState: allowModifications, // equation (106)
    blockHeader: ,
  };

  // equation (97)
  const executionResult = execute(newWorldState, availableGas, newSubState, environment);

  // equation (107)
  const c = finalCost(executionResult.output);

  // equation (112)
  const failure = hasContractCreationFailed(newContractAddress, worldState, executionResult.worldState, executionResult.remainingGas, c, executionResult.output);

  // equation (108)
  const remainingGas = failure ? 0n : executionResult.remainingGas - c;

  // equation (109)
  let finalState = worldState;
  if (failure || executionResult.worldState === null) finalState = worldState;
  else {
    finalState = structuredClone(executionResult.worldState); // cloning world state to avoid mutating it
    if (isAccountDead(finalState, newContractAddress)) delete finalState[bytesToHexString(newContractAddress)];
    else finalState[bytesToHexString(newContractAddress)].codeHash = KEC(executionResult.output);
  }

  // equation (110)
  const finalSubState = (failure || executionResult.worldState === null) ? newSubState : executionResult.subState;

  // equation (111)
  const status = (failure || executionResult.worldState === null) ? 0n : 1n;

  return {
    /** g' */
    remainingGas,
    /** σ' */
    worldState: finalState,
    /** A' */
    subState: finalSubState,
    /** z */
    status: status,
    /** o */
    output: executionResult.output as Uint8Array, // TODO remove typing
  };
}


// equation (89)
/** ADDR(s, n, ζ, i) */
export function contractCreationAddress(sender: Uint8Array, nonce: bigint, salt: Uint8Array, initCode: Uint8Array) {
  return KEC(serializeContractCreation(sender, nonce, salt, initCode)).slice(96);
}

// equation (90)
/** LA(s, n, ζ, i) */
export function serializeContractCreation(sender: Uint8Array, nonce: bigint, salt: Uint8Array, initCode: Uint8Array) {
  if (isB(salt, 0)) {
    return rlp([ salt, nonce ]);
  }
  return concat(new Uint8Array([255]), sender, salt, KEC(initCode));
}

// equation (91)
/** A* */
export function contractCreationSubState(newContractAddress: Uint8Array, subState: AccruedSubState) {
  const newSubState = structuredClone(subState); // cloning sub state to avoid mutating it
  newSubState.accessedAccounts.push(newContractAddress);
  return newSubState;
}

// equation (92)
/** σ∗ */
export function contractCreationWorldState(sender: Uint8Array, newContractAddress: Uint8Array, value: bigint, worldState: WorldState) {

  const state = structuredClone(worldState); // cloning world state to avoid mutating it

  // equation (93)
  state[bytesToHexString(newContractAddress)] = {
    nonce: 1n,
    balance: value + contractPreExistingBalance(sender, state),
    storageRoot: computeRootHash([]),
    storage: {},
    codeHash: KEC(new Uint8Array()),
    code: new Uint8Array(),
  };

  // equation (94)
  const senderAccount = state[bytesToHexString(sender)];
  if (senderAccount !== undefined && value === 0n) {
    delete state[bytesToHexString(sender)];
  } else {
    updateSenderAccount(sender, value, state);
  }

  return state;
}

// equation (95)
/** a* */
export function updateSenderAccount(sender: Uint8Array, value: bigint, worldState: WorldState) {
  const senderAccount = worldState[bytesToHexString(sender)];
  senderAccount.balance -= value;
  return senderAccount;
}

// equation (96)
/** v' */
export function contractPreExistingBalance(contractAddress: Uint8Array, worldState: WorldState) {
  const contractAccount = worldState[bytesToHexString(contractAddress)];
  if (contractAccount === undefined) return 0n;
  return contractAccount.balance;
}


// equation (107)
/** c */
export function finalCost(output: Uint8Array) {
  return cost.codeDeposit * BigInt(output.length);
}


// equation (112)
/** F */
export function hasContractCreationFailed(
  /** a */
  contractAddress: Uint8Array,
  /** σ */
  initialState: WorldState,
  /** σ** */
  finalState: WorldState | null,
  /** g** */
  remainingGas: bigint,
  /** c */
  finalCreateCost: bigint,
  /** o */
  output: Uint8Array,
) {
  const contractAccount = initialState[bytesToHexString(contractAddress)];
  return (
    (
      contractAccount !== undefined &&
      (contractAccount.codeHash !== KEC(new Uint8Array()) || contractAccount.nonce !== 0n) 
    ) ||
    (finalState === null && output.length === 0) ||
    remainingGas < finalCreateCost ||
    output.length > 24_576 ||
    output[0] === 0xef
  );
}


// * ---------------------------
// *  7.1. Subtleties.

