
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *             H. VIRTUAL MACHINE SPECIFICATION              *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.H


import { bigintToBytes, bigintToHexString, bytesToBigint, bytesToHexString } from '../utils';

import { BlockHeader, Log, WorldState, isAccountDead, parentBlock } from '../sections/4_block-n-tx';
import { AccruedSubState } from '../sections/6_tx-execution';
import { Environment, MachineState } from '../sections/9_execution-model';
import { cost } from './g_fees';
import { KEC } from '../sections/3_conventions';
import { mainNetChainId } from '../sections/2_blockchain';
import { contractCreationAddress, createContract } from '../sections/7_contract-creation';
import { messageCall } from '../sections/8_message-call';


// * ---------------------------
// *  H.1. Gas Cost.


// equation (316)
/** C(σ, μ, A, I) */
export function gasCost(oldWorldState: WorldState, newWorldState: WorldState, machineState: MachineState, subState: AccruedSubState, environment: Environment, newMemoryWordCount: number) {
  const oldMemoryCost = getMemoryCost(machineState.memoryWordCount);
  const newMemoryCost = getMemoryCost(newMemoryWordCount);
  const opcode = getOpcode(machineState, environment);

  let c = newMemoryCost - oldMemoryCost;

  if (opcode === op.SSTORE) {
    c += sstoreCost(oldWorldState, newWorldState, machineState, subState, environment);
  }
  if (opcode === op.EXP && machineState.stack[1] === 0n) {
    c += cost.exp;
  }
  if (opcode === op.EXP && machineState.stack[1] > 0n) {
    // log256(x) is just a fancy way of counting the number of bytes needed to represent x
    let nibbleCount = machineState.stack[1].toString(16).length; // 1 nibble is 4 bits = 1/2 byte
    nibbleCount += nibbleCount % 2 === 0 ? 0 : 1;
    const bytesCount = BigInt(nibbleCount / 2);

    c += cost.exp + (cost.expByte * (1n + bytesCount));
  }
  if ((copyCostInstructions as readonly number[]).includes(opcode)) {
    // ceil(a / 32)
    let a = machineState.stack[2] / 32n;
    if (machineState.stack[2] % 32n !== 0n) a++;

    c += cost.veryLow + (cost.copy * a);
  }
  if (opcode === op.EXTCODECOPY) {
    // ceil(a / 32)
    let a = machineState.stack[3] / 32n;
    if (machineState.stack[3] % 32n !== 0n) a++;

    c += getAccessCost(bigintToBytes(machineState.stack[0] % (2n ** 160n), 20), subState) + (cost.copy * a);
  }
  if ((extAccountCostInstructions as readonly number[]).includes(opcode)) {
    c += getAccessCost(bigintToBytes(machineState.stack[0] % (2n ** 160n), 20), subState);
  }
  if (opcode === op.LOG0) {
    c += cost.log + (cost.logData * machineState.stack[1]);
  }
  if (opcode === op.LOG1) {
    c += cost.log + (cost.logData * machineState.stack[1]) + cost.logTopic;
  }
  if (opcode === op.LOG2) {
    c += cost.log + (cost.logData * machineState.stack[1]) + (2n * cost.logTopic);
  }
  if (opcode === op.LOG3) {
    c += cost.log + (cost.logData * machineState.stack[1]) + (3n * cost.logTopic);
  }
  if (opcode === op.LOG4) {
    c += cost.log + (cost.logData * machineState.stack[1]) + (4n * cost.logTopic);
  }
  if ((callCostInstructions as readonly number[]).includes(opcode)) {
    c += callCost(newWorldState, machineState, subState);
  }
  if (opcode === op.SELFDESTRUCT) {
    c += selfDestructCost(newWorldState, machineState, subState, environment);
  }
  if (opcode === op.CREATE) {
    c += cost.create;
  }
  if (opcode === op.CREATE2) {
    // ceil(a / 32)
    let a = machineState.stack[2] / 32n;
    if (machineState.stack[2] % 32n !== 0n) a++;
    c += cost.create + (cost.keccak256Word * a);
  }
  if (opcode === op.KECCAK256) {
    // ceil(a / 32)
    let a = machineState.stack[1] / 32n;
    if (machineState.stack[1] % 32n !== 0n) a++;
    c += cost.keccak256 + (cost.keccak256Word * a);
  }
  if (opcode === op.JUMPDEST) {
    c += cost.jumpDest;
  }
  if (opcode === op.SLOAD) {
    c += sLoadCost(machineState, subState, environment);
  }
  if ((zeroCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.zero;
  }
  if ((baseCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.base;
  }
  if ((veryLowCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.veryLow;
  }
  if ((lowCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.low;
  }
  if ((midCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.mid;
  }
  if ((highCostInstructions as readonly number[]).includes(opcode)) {
    c += cost.high;
  }
  if (opcode === op.BLOCKHASH) {
    c += cost.blockHash;
  }

  return c;
}

// equation (317) exactly the same as section 9.4.1. equation (151)
/** w */
export function getOpcode(machineState: MachineState, environment: Environment) {
  if (machineState.pc < environment.code.length) {
    return environment.code[Number(machineState.pc)];
  } else {
    return 0;
  }
}

// equation (318)
/** Cmem(a) */
export function getMemoryCost(wordCount: number) {
  return BigInt(Number(cost.memory) * wordCount + Math.floor((wordCount ** 2) / 512));
}

// equation (319)
/** Caaccess(x, A) */
export function getAccessCost(address: Uint8Array, subState: AccruedSubState) {
  if (subState.accessedAccounts.map(bytesToHexString).includes(bytesToHexString(address))) {
    return cost.warmAccess;
  } else {
    return cost.coldAccountAccess;
  }
}

/** Wzero */
// @ts-ignore: variable 'op' used before its declaration. ts(2448)
export const zeroCostInstructions = [ op.STOP, op.RETURN, op.REVERT ] as const;
/** Wbase */
// @ts-ignore
export const baseCostInstructions = [ op.ADDRESS, op.ORIGIN, op.CALLER, op.CALLVALUE, op.CALLDATASIZE, op.CODESIZE, op.GASPRICE, op.COINBASE, op.TIMESTAMP, op.NUMBER, op.DIFFICULTY, op.GASLIMIT, op.CHAINID, op.RETURNDATASIZE, op.POP, op.PC, op.MSIZE, op.GAS, op.BASEFEE ] as const;
/** Wverylow */
export const veryLowCostInstructions = [
  // @ts-ignore
  op.ADD, op.SUB, op.NOT, op.LT, op.GT, op.SLT, op.SGT, op.EQ, op.ISZERO, op.AND, op.OR, op.XOR, op.BYTE, op.SHL, op.SHR, op.SAR, op.CALLDATALOAD, op.MLOAD, op.MSTORE, op.MSTORE8,
  // @ts-ignore
  op.PUSH1, op.PUSH2, op.PUSH3, op.PUSH4, op.PUSH5, op.PUSH6, op.PUSH7, op.PUSH8, op.PUSH9, op.PUSH10, op.PUSH11, op.PUSH12, op.PUSH13, op.PUSH14, op.PUSH15, op.PUSH16, op.PUSH17, op.PUSH18, op.PUSH19, op.PUSH20, op.PUSH21, op.PUSH22, op.PUSH23, op.PUSH24, op.PUSH25, op.PUSH26, op.PUSH27, op.PUSH28, op.PUSH29, op.PUSH30, op.PUSH31, op.PUSH32,
  // @ts-ignore
  op.DUP1, op.DUP2, op.DUP3, op.DUP4, op.DUP5, op.DUP6, op.DUP7, op.DUP8, op.DUP9, op.DUP10, op.DUP11, op.DUP12, op.DUP13, op.DUP14, op.DUP15, op.DUP16,
  // @ts-ignore
  op.SWAP1, op.SWAP2, op.SWAP3, op.SWAP4, op.SWAP5, op.SWAP6, op.SWAP7, op.SWAP8, op.SWAP9, op.SWAP10, op.SWAP11, op.SWAP12, op.SWAP13, op.SWAP14, op.SWAP15, op.SWAP16,
] as const;
/** Wlow */
// @ts-ignore
export const lowCostInstructions = [ op.MUL, op.DIV, op.SDIV, op.MOD, op.SMOD, op.SIGNEXTEND, op.SELFBALANCE ] as const;
/** Wmid */
// @ts-ignore
export const midCostInstructions = [ op.ADDMOD, op.MULMOD, op.JUMPDEST ] as const;
/** Whigh */
// @ts-ignore
export const highCostInstructions = [ op.JUMPI ] as const;
/** Wcopy */
// @ts-ignore
export const copyCostInstructions = [ op.CALLDATACOPY, op.CODECOPY, op.RETURNDATACOPY ] as const;
/** Wcall */
// @ts-ignore
export const callCostInstructions = [ op.CALL, op.CALLCODE, op.DELEGATECALL, op.STATICCALL ] as const;
/** Wextaccount */
// @ts-ignore
export const extAccountCostInstructions = [ op.BALANCE, op.EXTCODESIZE, op.EXTCODEHASH ] as const;

// equation (320)
/** M(s, f, l) */
export function memoryExpansion(wordCount: number, offset: number, size: number) {
  if (size === 0) return wordCount;
  return Math.max(wordCount, Math.ceil((offset + size) / 32));
}

// equation (321)
/** L(n) */
export function allButOne64th(n: bigint) {
  return n - (n / 64n); // bigint divisions are automatically floored down
}


// * ---------------------------
// *  H.2. Instruction Set.


const UINT_256_BOUND = 2n ** 256n;

// equation (322)
/** O(σ, μ, A, I) */
export function step(oldWorldState: WorldState, oldMachineState: MachineState, oldSubState: AccruedSubState, environment: Environment): {
  /** σ' */
  worldState: WorldState,
  /** µ' */
  machineState: MachineState,
  /** A' */
  subState: AccruedSubState,
  /** I */
  environment: Environment,
} {
  /** σ' */
  let worldState = structuredClone(oldWorldState);
  /** µ' */
  let machineState = structuredClone(oldMachineState);
  /** A' */
  let subState = structuredClone(oldSubState);

  const opcode = getOpcode(machineState, environment);
  const getCodeByte = (x: number) => x >= environment.code.length ? 0 : environment.code[x];
  const getDataByte = (x: number) => x >= environment.callData.length ? 0 : environment.callData[x];
  const sign = (x: bigint) => BigInt.asIntN(32, x) < 0 ? -1n : 1n;

  // 0s: Stop and Arithmetic Operations
  if (opcode === op.STOP) { // 0x00
    // TODO

  } else if (opcode === op.ADD) { // 0x01
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = (a + b) % UINT_256_BOUND;
    machineState.stack.unshift(c);

  } else if (opcode === op.MUL) { // 0x02
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = (a * b) % UINT_256_BOUND;
    machineState.stack.unshift(c);

  } else if (opcode === op.SUB) { // 0x03
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    let c = a - b;
    if (c < 0n) c = UINT_256_BOUND + c;
    machineState.stack.unshift(c);

  } else if (opcode === op.DIV) { // 0x04
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    let c = 0n;
    if (b === 0n) c = 0n;
    else c = a / b; // bigint division are automatically floored down
    machineState.stack.unshift(c);

  } else if (opcode === op.SDIV) { // 0x05
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    let c = 0n;
    if (b === 0n) c = 0n;
    else if (BigInt.asIntN(32, a) === (BigInt(-2) ** 255n) && BigInt.asIntN(32, b) === -1n) c = BigInt(-2) ** 255n;
    else c = sign(BigInt.asIntN(32, a) / BigInt.asIntN(32, b)) * (a / b);
    machineState.stack.unshift(BigInt.asUintN(32, c));

  } else if (opcode === op.MOD) { // 0x06
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    let c = 0n;
    if (b === 0n) c = 0n;
    else c = a % b;
    machineState.stack.unshift(c);

  } else if (opcode === op.SMOD) { // 0x07
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    let c = 0n;
    if (b === 0n) c = 0n;
    else c = sign(a) * (a % b);
    machineState.stack.unshift(BigInt.asUintN(32, c));

  } else if (opcode === op.ADDMOD) { // 0x08
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = machineState.stack.shift()!;
    let d = 0n;
    if (c === 0n) d = 0n;
    else d = (a + b) % c;
    machineState.stack.unshift(d);

  } else if (opcode === op.MULMOD) { // 0x09
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = machineState.stack.shift()!;
    let d = 0n;
    if (c === 0n) d = 0n;
    else d = (a * b) % c;
    machineState.stack.unshift(d);

  } else if (opcode === op.EXP) { // 0x0a
    let a = machineState.stack.shift()!;
    let b = machineState.stack.shift()!;
    a = a % UINT_256_BOUND;
    let c = 1n;
    let x = a;
    while (b > 0) {
      let leastSignificantBit = b % 2n;
      b = b / 2n;
      if (leastSignificantBit == 1n) {
        c = c * x;
        c = c % UINT_256_BOUND;
      }
      x = x * x;
      x = x % UINT_256_BOUND;
    }
    machineState.stack.unshift(c);

  } else if (opcode === op.SIGNEXTEND) { // 0x0b
    const a = Number(machineState.stack.shift()!);
    const b = machineState.stack.shift()!;
    const bBits = b.toString(2).padStart(256, '0').split('').map(x => Number(x));
    const t = 256 - 8 * (a + 1);
    const cBits: number[] = [];
    for (let i = 0 ; i < 256 ; i++) {
      if (i <= t) cBits.push(bBits[t]);
      else cBits.push(bBits[i]);
    }
    const c = BigInt('0b' + cBits.join(''));
    machineState.stack.unshift(c);

  // 10s: Comparison & Bitwise Logic Operations
  } else if (opcode === op.LT) { // 0x10
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a < b ? 1n : 0n;
    machineState.stack.unshift(c);

  } else if (opcode === op.GT) { // 0x11
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a > b ? 1n : 0n;
    machineState.stack.unshift(c);

  } else if (opcode === op.SLT) { // 0x12
    const a = BigInt.asIntN(32, machineState.stack.shift()!);
    const b = BigInt.asIntN(32, machineState.stack.shift()!);
    let c = 0n;
    if (a < b) c = 1n;
    else c = 0n;
    machineState.stack.unshift(c);

  } else if (opcode === op.SGT) { // 0x13
    const a = BigInt.asIntN(32, machineState.stack.shift()!);
    const b = BigInt.asIntN(32, machineState.stack.shift()!);
    let c = 0n;
    if (a > b) c = 1n;
    else c = 0n;
    machineState.stack.unshift(c);

  } else if (opcode === op.EQ) { // 0x14
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a === b ? 1n : 0n;
    machineState.stack.unshift(c);

  } else if (opcode === op.ISZERO) { // 0x15
    const a = machineState.stack.shift()!;
    const b = a === 0n ? 1n : 0n;
    machineState.stack.unshift(b);

  } else if (opcode === op.AND) { // 0x16
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a & b;
    machineState.stack.unshift(c);

  } else if (opcode === op.OR) { // 0x17
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a | b;
    machineState.stack.unshift(c);

  } else if (opcode === op.XOR) { // 0x18
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = a ^ b;
    machineState.stack.unshift(c);

  } else if (opcode === op.NOT) { // 0x19
    const a = machineState.stack.shift()!;
    const aBits = a.toString(2).padStart(256, '0').split('').map(x => Number(x));
    const bBits: number[] = [];
    for (let i = 0 ; i < 256 ; i++) {
      if (aBits[i] === 0) bBits.push(1);
      else bBits.push(0);
    }
    const b = BigInt('0b' + bBits.join(''));
    machineState.stack.unshift(b);

  } else if (opcode === op.BYTE) { // 0x1a
    const a = Number(machineState.stack.shift()!);
    const b = machineState.stack.shift()!;
    const bBits = b.toString(2).padStart(256, '0').split('').map(x => Number(x));
    const cBits: number[] = [];
    for (let i = 0 ; i < 256 ; i++) {
      if (i >= 248 && a < 32) cBits.push(bBits[i - 248 + 8 * a]);
      else cBits.push(0);
    }
    const c = BigInt('0b' + cBits.join(''));
    machineState.stack.unshift(c);

  } else if (opcode === op.SHL) { // 0x1b
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = (b * (2n ** a)) % (2n ** 256n);
    machineState.stack.unshift(c);

  } else if (opcode === op.SHR) { // 0x1c
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    const c = b / (2n ** a); // bigint division are automatically floored down
    machineState.stack.unshift(c);

  } else if (opcode === op.SAR) { // 0x1d
    const a = machineState.stack.shift()!;
    const b = BigInt.asIntN(32, machineState.stack.shift()!);
    const c = BigInt.asUintN(32, b / (2n ** a)); // bigint division are automatically floored down
    machineState.stack.unshift(c);

  // 20s: KECCAK256
  } else if (opcode === op.KECCAK256) { // 0x20
    const offset = machineState.stack.shift()!;
    const size = machineState.stack.shift()!;
    const data = machineState.memory.slice(Number(offset), Number(offset + size));
    const hash = KEC(data);
    machineState.stack.unshift(bytesToBigint(hash));

  // 30s: Environmental Information
  } else if (opcode === op.ADDRESS) { // 0x30
    machineState.stack.unshift(bytesToBigint(environment.currentAddress));

  } else if (opcode === op.BALANCE) { // 0x31
    const a = machineState.stack.shift()!;
    const address = bigintToBytes(a % (2n ** 160n), 20);
    let balance = 0n;
    if (worldState[bytesToHexString(address)]) balance = worldState[bytesToHexString(address)].balance;
    else balance = 0n;
    machineState.stack.unshift(balance);
    subState.accessedAccounts.push(address);

  } else if (opcode === op.ORIGIN) { // 0x32
    machineState.stack.unshift(bytesToBigint(environment.originAddress));

  } else if (opcode === op.CALLER) { // 0x33
    machineState.stack.unshift(bytesToBigint(environment.callerAddress));

  } else if (opcode === op.CALLVALUE) { // 0x34
    machineState.stack.unshift(environment.value);

  } else if (opcode === op.CALLDATALOAD) { // 0x35
    const a = machineState.stack.shift()!;
    const data = new Uint8Array(32);
    for (let i = a ; a < a + 32n ; i++) {
      data[Number(i)] = getDataByte(Number(i));
    }
    machineState.stack.unshift(bytesToBigint(data));

  } else if (opcode === op.CALLDATASIZE) { // 0x36
    machineState.stack.unshift(BigInt(environment.callData.length));

  } else if (opcode === op.CALLDATACOPY) { // 0x37
    const memOffset = machineState.stack.shift()!;
    const dataOffset = machineState.stack.shift()!;
    const size = machineState.stack.shift()!;
    for (let i = 0 ; i < size ; i++) machineState.memory[Number(memOffset) + i] = getDataByte(Number(dataOffset) + i);
    machineState.memoryWordCount = memoryExpansion(machineState.memoryWordCount, Number(memOffset), Number(size));

  } else if (opcode === op.CODESIZE) { // 0x38
    machineState.stack.unshift(BigInt(environment.code.length));

  } else if (opcode === op.CODECOPY) { // 0x39
    const memOffset = machineState.stack.shift()!;
    const codeOffset = machineState.stack.shift()!;
    const size = machineState.stack.shift()!;
    for (let i = 0 ; i < size ; i++) machineState.memory[Number(memOffset) + i] = getCodeByte(Number(codeOffset) + i);
    machineState.memoryWordCount = memoryExpansion(machineState.memoryWordCount, Number(memOffset), Number(size));

  } else if (opcode === op.GASPRICE) { // 0x3a
    machineState.stack.unshift(environment.gasPrice);

  } else if (opcode === op.EXTCODESIZE) { // 0x3b
    const a = machineState.stack.shift()!;
    const address = bigintToBytes(a % (2n ** 160n), 20);
    const account = worldState[bytesToHexString(address)];
    if (account !== undefined) machineState.stack.unshift(BigInt(account.code.length));
    else machineState.stack.unshift(0n);

  } else if (opcode === op.EXTCODECOPY) { // 0x3c
    const a = machineState.stack.shift()!;
    const memOffset = Number(machineState.stack.shift()!);
    const codeOffset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    const address = bigintToBytes(a % (2n ** 160n), 20);
    const account = worldState[bytesToHexString(address)];
    const code = account !== undefined ? account.code : new Uint8Array();
    for (let i = 0 ; i < size ; i++) {
      const byte = codeOffset + i < code.length ? code[codeOffset + i] : 0;
      machineState.memory[memOffset + i] = byte;
    }
    machineState.memoryWordCount = memoryExpansion(machineState.memoryWordCount, memOffset, size);

  } else if (opcode === op.RETURNDATASIZE) { // 0x3d
    machineState.stack.unshift(BigInt(machineState.output.length));

  } else if (opcode === op.RETURNDATACOPY) { // 0x3e
    const memOffset = Number(machineState.stack.shift()!);
    const outputOffset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    for (let i = 0 ; i < size ; i++) {
      const byte = outputOffset + i < machineState.output.length ? machineState.output[outputOffset + i] : 0;
      machineState.memory[memOffset + i] = byte;
    }
    machineState.memoryWordCount = memoryExpansion(machineState.memoryWordCount, memOffset, size);

  } else if (opcode === op.EXTCODEHASH) { // 0x3f
    const a = machineState.stack.shift()!;
    const address = bigintToBytes(a % (2n ** 160n), 20);
    if (isAccountDead(worldState, address)) {
      machineState.stack.unshift(0n);
    } else {
      machineState.stack.unshift(bytesToBigint(worldState[bytesToHexString(address)].codeHash));
    }
    subState.accessedAccounts.push(address);

  // 40s: Block Information
  } else if (opcode === op.BLOCKHASH) { // 0x40
    const n = machineState.stack.shift()!;
    const getBlock = (hash: Uint8Array) => ({} as BlockHeader); // ! This should be able to retrieve any block header from it's hash
    const getParent = (hash: Uint8Array, blockNumber: bigint, ttl: number): Uint8Array => {
      const blockHeader = getBlock(hash);
      if (blockNumber > blockHeader.number || ttl === 256 || bytesToBigint(hash) === 0n) return new Uint8Array([ 0 ]);
      if (blockNumber === blockHeader.number) return hash;
      return getParent(blockHeader.parentHash, blockNumber, ttl + 1);
    };
    const blockHash = getParent(environment.blockHeader.parentHash, n, 0);
    machineState.stack.unshift(bytesToBigint(blockHash));

  } else if (opcode === op.COINBASE) { // 0x41
    machineState.stack.unshift(bytesToBigint(environment.blockHeader.coinbase));

  } else if (opcode === op.TIMESTAMP) { // 0x42
    machineState.stack.unshift(environment.blockHeader.timestamp);

  } else if (opcode === op.NUMBER) { // 0x43
    machineState.stack.unshift(environment.blockHeader.number);

  } else if (opcode === op.PREVRANDAO) { // 0x44
    machineState.stack.unshift(bytesToBigint(environment.blockHeader.prevRandao));

  } else if (opcode === op.GASLIMIT) { // 0x45
    machineState.stack.unshift(environment.blockHeader.gasLimit);

  } else if (opcode === op.CHAINID) { // 0x46
    machineState.stack.unshift(mainNetChainId);

  } else if (opcode === op.SELFBALANCE) { // 0x47
    machineState.stack.unshift(worldState[bytesToHexString(environment.currentAddress)].balance);

  } else if (opcode === op.BASEFEE) { // 0x48
    machineState.stack.unshift(environment.blockHeader.baseFeePerGas);

  // 50s: Stack, Memory, Storage and Flow Operations
  } else if (opcode === op.POP) { // 0x50
    machineState.stack.shift();

  } else if (opcode === op.MLOAD) { // 0x51
    const memOffset = Number(machineState.stack.shift()!);
    const data = machineState.memory.slice(memOffset, memOffset + 32);
    machineState.stack.unshift(bytesToBigint(data));
    const count = Math.ceil((memOffset + 32) / 32);
    machineState.memoryWordCount = Math.max(machineState.memoryWordCount, count);

  } else if (opcode === op.MSTORE) { // 0x52
    const memOffset = Number(machineState.stack.shift()!);
    const value = bigintToBytes(machineState.stack.shift()!, 32);
    for (let i = 0 ; i < value.length ; i++) machineState.memory[memOffset + i] = value[i];
    const count = Math.ceil((memOffset + 32) / 32);
    machineState.memoryWordCount = Math.max(machineState.memoryWordCount, count);

  } else if (opcode === op.MSTORE8) { // 0x53
    const memOffset = Number(machineState.stack.shift()!);
    const value = Number(machineState.stack.shift()!) % 256; // this is the same as keeping the least significant byte of the value
    machineState.memory[memOffset] = value;
    const count = Math.ceil((memOffset + 32) / 32);
    machineState.memoryWordCount = Math.max(machineState.memoryWordCount, count);

  } else if (opcode === op.SLOAD) { // 0x54
    const key = bigintToBytes(machineState.stack.shift()!, 32);
    const byteValue: Uint8Array | undefined = worldState[bytesToHexString(environment.currentAddress)]?.storage[bytesToHexString(key)];
    const value = byteValue !== undefined ? bytesToBigint(byteValue) : 0n;
    machineState.stack.unshift(value);
    subState.accessedStorageKeys.push([ environment.currentAddress, key ]);

  } else if (opcode === op.SSTORE) { // 0x55
    const key = bigintToBytes(machineState.stack.shift()!, 32);
    /** v0 */
    const oldValue = oldWorldState[bytesToHexString(environment.currentAddress)]?.storage[bytesToHexString(key)];
    /** v */
    const currentValue = worldState[bytesToHexString(environment.currentAddress)]?.storage[bytesToHexString(key)];
    /** v' */
    const value = bigintToBytes(machineState.stack.shift()!, 32);
    worldState[bytesToHexString(environment.currentAddress)]!.storage[bytesToHexString(key)] = value;
    subState.accessedStorageKeys.push([ environment.currentAddress, key ]);

    let dirtyClear = 0n;
    if (bytesToBigint(oldValue) !== 0n && bytesToBigint(currentValue) === 0n) dirtyClear = -cost.refundStorageClear;
    else if (bytesToBigint(oldValue) !== 0n && bytesToBigint(value) === 0n) dirtyClear = cost.refundStorageClear;
    else dirtyClear = 0n;

    let dirtyReset = 0n;
    if (bytesToBigint(oldValue) === bytesToBigint(value) && bytesToBigint(oldValue) === 0n) dirtyReset = cost.storageSet - cost.warmAccess;
    else if (bytesToBigint(oldValue) === bytesToBigint(value) && bytesToBigint(oldValue) !== 0n) dirtyReset = cost.storageReset - cost.warmAccess;
    else dirtyReset = 0n;

    let refund = 0n;
    if (bytesToBigint(currentValue) !== bytesToBigint(value) && bytesToBigint(oldValue) === bytesToBigint(currentValue) && bytesToBigint(value) === 0n) refund = cost.refundStorageClear;
    else if (bytesToBigint(currentValue) !== bytesToBigint(value) && bytesToBigint(oldValue) !== bytesToBigint(currentValue)) refund = dirtyClear + dirtyReset;
    else refund = 0n;

    subState.refund += refund;

  } else if (opcode === op.JUMP) { // 0x56
    const a = machineState.stack.shift()!;
    machineState.pc = Number(a);

  } else if (opcode === op.JUMPI) { // 0x57
    const a = machineState.stack.shift()!;
    const b = machineState.stack.shift()!;
    if (b !== 0n) machineState.pc = Number(a);
    else machineState.pc++;

  } else if (opcode === op.PC) { // 0x58
    machineState.stack.unshift(BigInt(machineState.pc));

  } else if (opcode === op.MSIZE) { // 0x59
    machineState.stack.unshift(32n * BigInt(machineState.memory.length));

  } else if (opcode === op.GAS) { // 0x5a
    machineState.stack.unshift(machineState.availableGas);

  } else if (opcode === op.JUMPDEST) { // 0x5b
    // do nothing

  // TODO PUSH0 ???

  // 60s & 70s: Push Operations
  } else if (opcode === op.PUSH1) { // 0x60
    const o = machineState.pc + 1;
    const a = new Uint8Array(1);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH2) { // 0x61
    const o = machineState.pc + 1;
    const a = new Uint8Array(2);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH3) { // 0x62
    const o = machineState.pc + 1;
    const a = new Uint8Array(3);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH4) { // 0x63
    const o = machineState.pc + 1;
    const a = new Uint8Array(4);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH5) { // 0x64
    const o = machineState.pc + 1;
    const a = new Uint8Array(5);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH6) { // 0x65
    const o = machineState.pc + 1;
    const a = new Uint8Array(6);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH7) { // 0x66
    const o = machineState.pc + 1;
    const a = new Uint8Array(7);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH8) { // 0x67
    const o = machineState.pc + 1;
    const a = new Uint8Array(8);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH9) { // 0x68
    const o = machineState.pc + 1;
    const a = new Uint8Array(9);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH10) { // 0x69
    const o = machineState.pc + 1;
    const a = new Uint8Array(10);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH11) { // 0x6a
    const o = machineState.pc + 1;
    const a = new Uint8Array(11);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH12) { // 0x6b
    const o = machineState.pc + 1;
    const a = new Uint8Array(12);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH13) { // 0x6c
    const o = machineState.pc + 1;
    const a = new Uint8Array(13);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH14) { // 0x6d
    const o = machineState.pc + 1;
    const a = new Uint8Array(14);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH15) { // 0x6e
    const o = machineState.pc + 1;
    const a = new Uint8Array(15);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH16) { // 0x6f
    const o = machineState.pc + 1;
    const a = new Uint8Array(16);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH17) { // 0x70
    const o = machineState.pc + 1;
    const a = new Uint8Array(17);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH18) { // 0x71
    const o = machineState.pc + 1;
    const a = new Uint8Array(18);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH19) { // 0x72
    const o = machineState.pc + 1;
    const a = new Uint8Array(19);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH20) { // 0x73
    const o = machineState.pc + 1;
    const a = new Uint8Array(20);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH21) { // 0x74
    const o = machineState.pc + 1;
    const a = new Uint8Array(21);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH22) { // 0x75
    const o = machineState.pc + 1;
    const a = new Uint8Array(22);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH23) { // 0x76
    const o = machineState.pc + 1;
    const a = new Uint8Array(23);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH24) { // 0x77
    const o = machineState.pc + 1;
    const a = new Uint8Array(24);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH25) { // 0x78
    const o = machineState.pc + 1;
    const a = new Uint8Array(25);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH26) { // 0x79
    const o = machineState.pc + 1;
    const a = new Uint8Array(26);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH27) { // 0x7a
    const o = machineState.pc + 1;
    const a = new Uint8Array(27);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH28) { // 0x7b
    const o = machineState.pc + 1;
    const a = new Uint8Array(28);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH29) { // 0x7c
    const o = machineState.pc + 1;
    const a = new Uint8Array(29);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH30) { // 0x7d
    const o = machineState.pc + 1;
    const a = new Uint8Array(30);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH31) { // 0x7e
    const o = machineState.pc + 1;
    const a = new Uint8Array(31);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  } else if (opcode === op.PUSH32) { // 0x7f
    const o = machineState.pc + 1;
    const a = new Uint8Array(32);
    for (let i = 0 ; i < a.length ; i++) a[i] = getCodeByte(o + i);
    machineState.stack.unshift(bytesToBigint(a));

  // 80s: Duplication Operations
  } else if (opcode === op.DUP1) { // 0x80
    const a = machineState.stack[0];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP2) { // 0x81
    const a = machineState.stack[1];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP3) { // 0x82
    const a = machineState.stack[2];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP4) { // 0x83
    const a = machineState.stack[3];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP5) { // 0x84
    const a = machineState.stack[4];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP6) { // 0x85
    const a = machineState.stack[5];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP7) { // 0x86
    const a = machineState.stack[6];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP8) { // 0x87
    const a = machineState.stack[7];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP9) { // 0x88
    const a = machineState.stack[8];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP10) { // 0x89
    const a = machineState.stack[9];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP11) { // 0x8a
    const a = machineState.stack[10];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP12) { // 0x8b
    const a = machineState.stack[11];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP13) { // 0x8c
    const a = machineState.stack[12];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP14) { // 0x8d
    const a = machineState.stack[13];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP15) { // 0x8e
    const a = machineState.stack[14];
    machineState.stack.unshift(a);

  } else if (opcode === op.DUP16) { // 0x8f
    const a = machineState.stack[15];
    machineState.stack.unshift(a);

  // 90s: Exchange Operations
  } else if (opcode === op.SWAP1) { // 0x90
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[1];
    machineState.stack[1] = a;

  } else if (opcode === op.SWAP2) { // 0x91
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[2];
    machineState.stack[2] = a;

  } else if (opcode === op.SWAP3) { // 0x92
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[3];
    machineState.stack[3] = a;

  } else if (opcode === op.SWAP4) { // 0x93
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[4];
    machineState.stack[4] = a;

  } else if (opcode === op.SWAP5) { // 0x94
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[5];
    machineState.stack[5] = a;

  } else if (opcode === op.SWAP6) { // 0x95
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[6];
    machineState.stack[6] = a;

  } else if (opcode === op.SWAP7) { // 0x96
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[7];
    machineState.stack[7] = a;

  } else if (opcode === op.SWAP8) { // 0x97
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[8];
    machineState.stack[8] = a;

  } else if (opcode === op.SWAP9) { // 0x98
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[9];
    machineState.stack[9] = a;

  } else if (opcode === op.SWAP10) { // 0x99
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[10];
    machineState.stack[10] = a;

  } else if (opcode === op.SWAP11) { // 0x9a
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[11];
    machineState.stack[11] = a;

  } else if (opcode === op.SWAP12) { // 0x9b
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[12];
    machineState.stack[12] = a;

  } else if (opcode === op.SWAP13) { // 0x9c
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[13];
    machineState.stack[13] = a;

  } else if (opcode === op.SWAP14) { // 0x9d
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[14];
    machineState.stack[14] = a;

  } else if (opcode === op.SWAP15) { // 0x9e
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[15];
    machineState.stack[15] = a;

  } else if (opcode === op.SWAP16) { // 0x9f
    const a = machineState.stack[0];
    machineState.stack[0] = machineState.stack[16];
    machineState.stack[16] = a;

  // a0s: Logging Operations
  } else if (opcode === op.LOG0) { // 0xa0
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    const log: Log = [
      environment.currentAddress,
      [],
      machineState.memory.slice(offset, offset + size),
    ];
    subState.logs.push(log);

  } else if (opcode === op.LOG1) { // 0xa1
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    const topic0 = machineState.stack.shift()!;
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    const log: Log = [
      environment.currentAddress,
      [
        bigintToBytes(topic0, 32),
      ],
      machineState.memory.slice(offset, offset + size),
    ];
    subState.logs.push(log);

  } else if (opcode === op.LOG2) { // 0xa2
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    const topic0 = machineState.stack.shift()!;
    const topic1 = machineState.stack.shift()!;
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    const log: Log = [
      environment.currentAddress,
      [
        bigintToBytes(topic0, 32),
        bigintToBytes(topic1, 32),
      ],
      machineState.memory.slice(offset, offset + size),
    ];
    subState.logs.push(log);

  } else if (opcode === op.LOG3) { // 0xa3
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    const topic0 = machineState.stack.shift()!;
    const topic1 = machineState.stack.shift()!;
    const topic2 = machineState.stack.shift()!;
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    const log: Log = [
      environment.currentAddress,
      [
        bigintToBytes(topic0, 32),
        bigintToBytes(topic1, 32),
        bigintToBytes(topic2, 32),
      ],
      machineState.memory.slice(offset, offset + size),
    ];
    subState.logs.push(log);

  } else if (opcode === op.LOG4) { // 0xa4
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    const topic0 = machineState.stack.shift()!;
    const topic1 = machineState.stack.shift()!;
    const topic2 = machineState.stack.shift()!;
    const topic3 = machineState.stack.shift()!;
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    const log: Log = [
      environment.currentAddress,
      [
        bigintToBytes(topic0, 32),
        bigintToBytes(topic1, 32),
        bigintToBytes(topic2, 32),
        bigintToBytes(topic3, 32),
      ],
      machineState.memory.slice(offset, offset + size),
    ];
    subState.logs.push(log);

  // f0s: System Operations
  } else if (opcode === op.CREATE) { // 0xf0
    const value = machineState.stack.shift()!;
    const memOffset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);

    const code = machineState.memory.slice(memOffset, memOffset + size);
    const salt = new Uint8Array();
    const balanceOk = value <= worldState[bytesToHexString(environment.currentAddress)]!.balance;
    const depthOk = environment.callDepth < 1024;

    let result: ReturnType<typeof createContract>;
    if (balanceOk && depthOk) {
      const createWorldState = structuredClone(worldState);
      createWorldState[bytesToHexString(environment.currentAddress)]!.nonce++;
      result = createContract(
        createWorldState,
        subState,
        environment.currentAddress,
        environment.originAddress,
        allButOne64th(machineState.availableGas),
        environment.gasPrice,
        value,
        code,
        environment.callDepth + 1,
        salt,
        environment.canModifyState,
      );
    } else {
      result = {
        worldState,
        remainingGas: allButOne64th(machineState.availableGas),
        subState,
        status: 0n,
        output: new Uint8Array(),
      };
    }
    worldState = result.worldState;
    subState = result.subState;
    machineState.availableGas -= allButOne64th(machineState.availableGas) - result.remainingGas;
    const contractAddress = (result.status === 0n || !depthOk || !balanceOk) ? 0n : bytesToBigint(contractCreationAddress(environment.currentAddress, worldState[bytesToHexString(environment.currentAddress)]!.nonce, salt, code));
    machineState.stack.unshift(contractAddress);
    machineState.memoryWordCount = memoryExpansion(machineState.memoryWordCount, memOffset, size);
    machineState.output = result.status === 1n ? new Uint8Array() : result.output;

  } else if (opcode === op.CALL) { // 0xf1
    const cost = callGasCost(worldState, machineState, subState);
    machineState.stack.shift()!; // pop gas as it is only used by the above function
    const to = machineState.stack.shift()!;
    const value = machineState.stack.shift()!;
    const inputOffset = Number(machineState.stack.shift()!);
    const inputSize = Number(machineState.stack.shift()!);
    const outputOffset = Number(machineState.stack.shift()!);
    const outputSize = Number(machineState.stack.shift()!);

    const input = machineState.memory.slice(inputOffset, inputOffset + inputSize);
    const balanceOk = value <= worldState[bytesToHexString(environment.currentAddress)]!.balance;
    const depthOk = environment.callDepth < 1024;

    let result: ReturnType<typeof messageCall>;
    if (balanceOk && depthOk) {
      const toAddress = bigintToBytes(to % (2n ** 160n), 20);
      const callSubState = structuredClone(subState);
      callSubState.accessedAccounts.push(toAddress);
      result = messageCall(
        worldState,
        callSubState,
        environment.currentAddress,
        environment.originAddress,
        toAddress,
        toAddress,
        cost,
        environment.gasPrice,
        value,
        value,
        input,
        environment.callDepth + 1,
        environment.canModifyState,
      );
    } else {
      result = {
        worldState,
        remainingGas: cost,
        subState,
        status: 0n,
        output: new Uint8Array(),
      };
    }
    worldState = result.worldState;
    subState = result.subState;
    const n = outputSize < result.output.length ? outputSize : result.output.length; // min(outputSize, result.output.length)
    for (let i = 0 ; i < n ; i++) machineState.memory[n + i] = result.output[i];
    machineState.output = result.output;
    machineState.availableGas -= cost + result.remainingGas;
    const x = (result.status === 0n || !depthOk || !balanceOk) ? 0n : 1n;
    machineState.stack.unshift(x);
    machineState.memoryWordCount = memoryExpansion(memoryExpansion(machineState.memoryWordCount, inputOffset, inputSize), outputOffset, outputSize);

  } else if (opcode === op.CALLCODE) { // 0xf2
    const cost = callGasCost(worldState, machineState, subState);
    machineState.stack.shift()!; // pop gas as it is only used by the above function
    const to = machineState.stack.shift()!;
    const value = machineState.stack.shift()!;
    const inputOffset = Number(machineState.stack.shift()!);
    const inputSize = Number(machineState.stack.shift()!);
    const outputOffset = Number(machineState.stack.shift()!);
    const outputSize = Number(machineState.stack.shift()!);

    const input = machineState.memory.slice(inputOffset, inputOffset + inputSize);
    const balanceOk = value <= worldState[bytesToHexString(environment.currentAddress)]!.balance;
    const depthOk = environment.callDepth < 1024;

    let result: ReturnType<typeof messageCall>;
    if (balanceOk && depthOk) {
      const toAddress = bigintToBytes(to % (2n ** 160n), 20);
      const callSubState = structuredClone(subState);
      callSubState.accessedAccounts.push(toAddress);
      result = messageCall(
        worldState,
        callSubState,
        environment.currentAddress,
        environment.originAddress,
        environment.currentAddress, // only difference from CALL
        toAddress,
        cost,
        environment.gasPrice,
        value,
        value,
        input,
        environment.callDepth + 1,
        environment.canModifyState,
      );
    } else {
      result = {
        worldState,
        remainingGas: cost,
        subState,
        status: 0n,
        output: new Uint8Array(),
      };
    }
    worldState = result.worldState;
    subState = result.subState;
    const n = outputSize < result.output.length ? outputSize : result.output.length; // min(outputSize, result.output.length)
    for (let i = 0 ; i < n ; i++) machineState.memory[n + i] = result.output[i];
    machineState.output = result.output;
    machineState.availableGas -= cost + result.remainingGas;
    const x = (result.status === 0n || !depthOk || !balanceOk) ? 0n : 1n;
    machineState.stack.unshift(x);
    machineState.memoryWordCount = memoryExpansion(memoryExpansion(machineState.memoryWordCount, inputOffset, inputSize), outputOffset, outputSize);

  } else if (opcode === op.RETURN) { // 0xf3
    const data = returnedData(machineState);
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    machineState.output = data;

  } else if (opcode === op.DELEGATECALL) { // 0xf4
    // TODO

  } else if (opcode === op.CREATE2) { // 0xf5
    // TODO

  } else if (opcode === op.STATICCALL) { // 0xfa
    // TODO

  } else if (opcode === op.REVERT) { // 0xfd
    const data = returnedData(machineState);
    const offset = Number(machineState.stack.shift()!);
    const size = Number(machineState.stack.shift()!);
    machineState.memoryWordCount = memoryExpansion(oldMachineState.memoryWordCount, offset, size);
    machineState.output = data;

  } else if (opcode === op.INVALID) { // 0xfe
    // do nothing

  } else if (opcode === op.SELFDESTRUCT) { // 0xff
    subState.selfDestructAccounts.push(environment.currentAddress);
    /** r */
    const address = bigintToBytes(machineState.stack[0] % (2n ** 160n), 20);
    subState.accessedAccounts.push(address);
    const recipientAccount = worldState[bytesToHexString(address)];
    const destructedAccount = worldState[bytesToHexString(environment.currentAddress)];
    if (recipientAccount === undefined || destructedAccount.balance === 0n) {
      delete worldState[bytesToHexString(address)];
    } else if (bytesToHexString(address) !== bytesToHexString(environment.currentAddress)) {
      recipientAccount.balance += destructedAccount.balance;
    } else {
      recipientAccount.balance = 0n;
    }
    destructedAccount.balance = 0n;
  }
  // TODO every other opcode should be treated as INVALID

  return { worldState, machineState, subState, environment };
}


export interface ValidInstruction {
  /** Mnemonic */
  name: string;
  /** δ  */
  pop: number;
  /** α */
  push: number;
};
export interface InvalidInstruction {
  /** Mnemonic */
  name: 'INVALID';
  /** δ  */
  pop: null;
  /** α */
  push: null;
};
export type Instruction = ValidInstruction | InvalidInstruction;

export const instructions: Record<number, Instruction> = {
  // 0s: Stop and Arithmetic Operations
  0x00: { name: 'STOP', pop: 0, push: 0 },
  0x01: { name: 'ADD', pop: 2, push: 1 },
  0x02: { name: 'MUL', pop: 2, push: 1 },
  0x03: { name: 'SUB', pop: 2, push: 1 },
  0x04: { name: 'DIV', pop: 2, push: 1 },
  0x05: { name: 'SDIV', pop: 2, push: 1 },
  0x06: { name: 'MOD', pop: 2, push: 1 },
  0x07: { name: 'SMOD', pop: 2, push: 1 },
  0x08: { name: 'ADDMOD', pop: 3, push: 1 },
  0x09: { name: 'MULMOD', pop: 3, push: 1 },
  0x0a: { name: 'EXP', pop: 2, push: 1 },
  0x0b: { name: 'SIGNEXTEND', pop: 2, push: 1 },
  // 10s: Comparison & Bitwise Logic Operations
  0x10: { name: 'LT', pop: 2, push: 1 },
  0x11: { name: 'GT', pop: 2, push: 1 },
  0x12: { name: 'SLT', pop: 2, push: 1 },
  0x13: { name: 'SGT', pop: 2, push: 1 },
  0x14: { name: 'EQ', pop: 2, push: 1 },
  0x15: { name: 'ISZERO', pop: 1, push: 1 },
  0x16: { name: 'AND', pop: 2, push: 1 },
  0x17: { name: 'OR', pop: 2, push: 1 },
  0x18: { name: 'XOR', pop: 2, push: 1 },
  0x19: { name: 'NOT', pop: 1, push: 1 },
  0x1a: { name: 'BYTE', pop: 2, push: 1 },
  0x1b: { name: 'SHL', pop: 2, push: 1 },
  0x1c: { name: 'SHR', pop: 2, push: 1 },
  0x1d: { name: 'SAR', pop: 2, push: 1 },
  // 20s: KECCAK256
  0x20: { name: 'KECCAK256', pop: 2, push: 1 },
  // 30s: Environmental Information
  0x30: { name: 'ADDRESS', pop: 0, push: 1 },
  0x31: { name: 'BALANCE', pop: 1, push: 1 },
  0x32: { name: 'ORIGIN', pop: 0, push: 1 },
  0x33: { name: 'CALLER', pop: 0, push: 1 },
  0x34: { name: 'CALLVALUE', pop: 0, push: 1 },
  0x35: { name: 'CALLDATALOAD', pop: 1, push: 1 },
  0x36: { name: 'CALLDATASIZE', pop: 0, push: 1 },
  0x37: { name: 'CALLDATACOPY', pop: 3, push: 0 },
  0x38: { name: 'CODESIZE', pop: 0, push: 1 },
  0x39: { name: 'CODECOPY', pop: 3, push: 0 },
  0x3a: { name: 'GASPRICE', pop: 0, push: 1 },
  0x3b: { name: 'EXTCODESIZE', pop: 1, push: 1 },
  0x3c: { name: 'EXTCODECOPY', pop: 4, push: 0 },
  0x3d: { name: 'RETURNDATASIZE', pop: 0, push: 1 },
  0x3e: { name: 'RETURNDATACOPY', pop: 3, push: 0 },
  0x3f: { name: 'EXTCODEHASH', pop: 1, push: 1 },
  // 40s: Block Information
  0x40: { name: 'BLOCKHASH', pop: 1, push: 1 },
  0x41: { name: 'COINBASE', pop: 0, push: 1 },
  0x42: { name: 'TIMESTAMP', pop: 0, push: 1 },
  0x43: { name: 'NUMBER', pop: 0, push: 1 },
  0x44: { name: 'PREVRANDAO', pop: 0, push: 1 },
  0x45: { name: 'GASLIMIT', pop: 0, push: 1 },
  0x46: { name: 'CHAINID', pop: 0, push: 1 },
  0x47: { name: 'SELFBALANCE', pop: 0, push: 1 },
  0x48: { name: 'BASEFEE', pop: 0, push: 1 },
  // 50s: Stack, Memory, Storage and Flow Operations
  0x50: { name: 'POP', pop: 1, push: 0 },
  0x51: { name: 'MLOAD', pop: 1, push: 1 },
  0x52: { name: 'MSTORE', pop: 2, push: 0 },
  0x53: { name: 'MSTORE8', pop: 2, push: 0 },
  0x54: { name: 'SLOAD', pop: 1, push: 1 },
  0x55: { name: 'SSTORE', pop: 2, push: 0 },
  0x56: { name: 'JUMP', pop: 1, push: 0 },
  0x57: { name: 'JUMPI', pop: 2, push: 0 },
  0x58: { name: 'PC', pop: 0, push: 1 },
  0x59: { name: 'MSIZE', pop: 0, push: 1 },
  0x5a: { name: 'GAS', pop: 0, push: 1 },
  0x5b: { name: 'JUMPDEST', pop: 0, push: 0 },
  // 60s & 70s: Push Operations
  0x60: { name: 'PUSH1', pop: 0, push: 1 },
  0x61: { name: 'PUSH2', pop: 0, push: 1 },
  0x62: { name: 'PUSH3', pop: 0, push: 1 },
  0x63: { name: 'PUSH4', pop: 0, push: 1 },
  0x64: { name: 'PUSH5', pop: 0, push: 1 },
  0x65: { name: 'PUSH6', pop: 0, push: 1 },
  0x66: { name: 'PUSH7', pop: 0, push: 1 },
  0x67: { name: 'PUSH8', pop: 0, push: 1 },
  0x68: { name: 'PUSH9', pop: 0, push: 1 },
  0x69: { name: 'PUSH10', pop: 0, push: 1 },
  0x6a: { name: 'PUSH11', pop: 0, push: 1 },
  0x6b: { name: 'PUSH12', pop: 0, push: 1 },
  0x6c: { name: 'PUSH13', pop: 0, push: 1 },
  0x6d: { name: 'PUSH14', pop: 0, push: 1 },
  0x6e: { name: 'PUSH15', pop: 0, push: 1 },
  0x6f: { name: 'PUSH16', pop: 0, push: 1 },
  0x70: { name: 'PUSH17', pop: 0, push: 1 },
  0x71: { name: 'PUSH18', pop: 0, push: 1 },
  0x72: { name: 'PUSH19', pop: 0, push: 1 },
  0x73: { name: 'PUSH20', pop: 0, push: 1 },
  0x74: { name: 'PUSH21', pop: 0, push: 1 },
  0x75: { name: 'PUSH22', pop: 0, push: 1 },
  0x76: { name: 'PUSH23', pop: 0, push: 1 },
  0x77: { name: 'PUSH24', pop: 0, push: 1 },
  0x78: { name: 'PUSH25', pop: 0, push: 1 },
  0x79: { name: 'PUSH26', pop: 0, push: 1 },
  0x7a: { name: 'PUSH27', pop: 0, push: 1 },
  0x7b: { name: 'PUSH28', pop: 0, push: 1 },
  0x7c: { name: 'PUSH29', pop: 0, push: 1 },
  0x7d: { name: 'PUSH30', pop: 0, push: 1 },
  0x7e: { name: 'PUSH31', pop: 0, push: 1 },
  0x7f: { name: 'PUSH32', pop: 0, push: 1 },
  // 80s: Duplication Operations
  0x80: { name: 'DUP1', pop: 1, push: 2 },
  0x81: { name: 'DUP2', pop: 2, push: 3 },
  0x82: { name: 'DUP3', pop: 3, push: 4 },
  0x83: { name: 'DUP4', pop: 4, push: 5 },
  0x84: { name: 'DUP5', pop: 5, push: 6 },
  0x85: { name: 'DUP6', pop: 6, push: 7 },
  0x86: { name: 'DUP7', pop: 7, push: 8 },
  0x87: { name: 'DUP8', pop: 8, push: 9 },
  0x88: { name: 'DUP9', pop: 9, push: 10 },
  0x89: { name: 'DUP10', pop: 10, push: 11 },
  0x8a: { name: 'DUP11', pop: 11, push: 12 },
  0x8b: { name: 'DUP12', pop: 12, push: 13 },
  0x8c: { name: 'DUP13', pop: 13, push: 14 },
  0x8d: { name: 'DUP14', pop: 14, push: 15 },
  0x8e: { name: 'DUP15', pop: 15, push: 16 },
  0x8f: { name: 'DUP16', pop: 16, push: 17 },
  // 90s: Exchange Operations
  0x90: { name: 'SWAP1', pop: 2, push: 2 },
  0x91: { name: 'SWAP2', pop: 3, push: 3 },
  0x92: { name: 'SWAP3', pop: 4, push: 4 },
  0x93: { name: 'SWAP4', pop: 5, push: 5 },
  0x94: { name: 'SWAP5', pop: 6, push: 6 },
  0x95: { name: 'SWAP6', pop: 7, push: 7 },
  0x96: { name: 'SWAP7', pop: 8, push: 8 },
  0x97: { name: 'SWAP8', pop: 9, push: 9 },
  0x98: { name: 'SWAP9', pop: 10, push: 10 },
  0x99: { name: 'SWAP10', pop: 11, push: 11 },
  0x9a: { name: 'SWAP11', pop: 12, push: 12 },
  0x9b: { name: 'SWAP12', pop: 13, push: 13 },
  0x9c: { name: 'SWAP13', pop: 14, push: 14 },
  0x9d: { name: 'SWAP14', pop: 15, push: 15 },
  0x9e: { name: 'SWAP15', pop: 16, push: 16 },
  0x9f: { name: 'SWAP16', pop: 17, push: 17 },
  // a0s: Logging Operations
  0xa0: { name: 'LOG0', pop: 2, push: 0 },
  0xa1: { name: 'LOG1', pop: 3, push: 0 },
  0xa2: { name: 'LOG2', pop: 4, push: 0 },
  0xa3: { name: 'LOG3', pop: 5, push: 0 },
  0xa4: { name: 'LOG4', pop: 6, push: 0 },
  // f0s: System Operations
  0xf0: { name: 'CREATE', pop: 3, push: 1 },
  0xf1: { name: 'CALL', pop: 7, push: 1 },
  0xf2: { name: 'CALLCODE', pop: 7, push: 1 },
  0xf3: { name: 'RETURN', pop: 2, push: 0 },
  0xf4: { name: 'DELEGATECALL', pop: 6, push: 1 },
  0xf5: { name: 'CREATE2', pop: 4, push: 1 },
  0xfa: { name: 'STATICCALL', pop: 6, push: 1 },
  0xfd: { name: 'REVERT', pop: 2, push: 0 },
  0xfe: { name: 'INVALID', pop: null, push: null },
  0xff: { name: 'SELFDESTRUCT', pop: 1, push: 0 },
};

export const op: Record<string, number> = {};
Object.entries(instructions).forEach(([k, v]) => op[v.name] = Number(k));

/** CSLOAD */
export function sLoadCost(machineState: MachineState, subState: AccruedSubState, environment: Environment) {
  const isWarm = subState.accessedStorageKeys.some(slot =>
    bytesToHexString(slot[0]) === bytesToHexString(environment.currentAddress) &&
    bytesToHexString(slot[1]) === bigintToHexString(machineState.stack[0])
  );
  if (isWarm) {
    return cost.warmAccess;
  }
  return cost.coldSload;
}

/** CSSTORE */
export function sstoreCost(checkpointWorldState: WorldState, transitionalWorldState: WorldState, machineState: MachineState, subState: AccruedSubState, environment: Environment) {
  let gasCost = 0n;

  const isWarm = subState.accessedStorageKeys.some(slot =>
    bytesToHexString(slot[0]) === bytesToHexString(environment.currentAddress) &&
    bytesToHexString(slot[1]) === bigintToHexString(machineState.stack[0])
  );
  if (isWarm) {
    gasCost += 0n;
  } else {
    gasCost += cost.coldSload;
  }

  /** v0 */
  const originalValue = bytesToBigint(checkpointWorldState[bytesToHexString(environment.currentAddress)]?.storage[bigintToHexString(machineState.stack[0])]) ?? 0n;
  /** v */
  const currentValue = bytesToBigint(transitionalWorldState[bytesToHexString(environment.currentAddress)]?.storage[bigintToHexString(machineState.stack[0])]) ?? 0n;
  /** v' */
  const newValue = machineState.stack[1];

  if (currentValue === newValue || originalValue !== currentValue) {
    gasCost += cost.warmAccess;
  } else if (currentValue !== newValue && originalValue === currentValue && originalValue === 0n) {
    gasCost += cost.storageSet;
  } else if (currentValue !== newValue && originalValue === currentValue && newValue === 0n) {
    gasCost += cost.storageReset;
  }

  return gasCost;
}

/** JJUMP */
export function jumpTarget(machineState: MachineState) {
  return machineState.stack[0];
}

/** JJUMPI */
export function jumpiTarget(machineState: MachineState) {
  if (machineState.stack[1] !== 0n) return machineState.stack[0];
  return machineState.pc + 1;
}

/** CCALL */
export function callCost(worldState: WorldState, machineState: MachineState, subState: AccruedSubState) {
  const cap = gasCap(worldState, machineState, subState);
  const extra = extraCost(worldState, machineState, subState);

  return cap + extra;
}

/** CCALLGAS */
export function callGasCost(worldState: WorldState, machineState: MachineState, subState: AccruedSubState) {
  const cap = gasCap(worldState, machineState, subState);
  if (machineState.stack[2] !== 0n) {
    return cap + cost.callStipend;
  }
  return cap;
}

/** CGASCAP */
export function gasCap(worldState: WorldState, machineState: MachineState, subState: AccruedSubState) {
  const extra = extraCost(worldState, machineState, subState);
  if (machineState.availableGas >= extra) {
    const a = allButOne64th(machineState.availableGas - extra);
    return a < machineState.stack[0] ? a : machineState.stack[0]; // min(a, machineState.stack[0])
  }
  return machineState.stack[0];
}

/** CEXTRA */
export function extraCost(worldState: WorldState, machineState: MachineState, subState: AccruedSubState) {
  const access = getAccessCost(bigintToBytes(machineState.stack[1] % (2n ** 160n), 20), subState);
  const transfer = transferCost(machineState);
  const newAccount = newAccountCost(worldState, machineState);

  return access + transfer + newAccount;
}

/** CXFER */
export function transferCost(machineState: MachineState) {
  if (machineState.stack[2] === 0n) {
    return cost.callValue;
  }
  return 0n;
}

/** CNEW */
export function newAccountCost(worldState: WorldState, machineState: MachineState) {
  if (isAccountDead(worldState, bigintToBytes(machineState.stack[1] % (2n ** 160n), 20)) && machineState.stack[2] === 0n) {
    return cost.newAccount;
  }
  return 0n;
}

/** HRETURN */
export function returnedData(machineState: MachineState) {
  return machineState.memory.slice(Number(machineState.stack[0]), Number(machineState.stack[0] + machineState.stack[1] - 1n));
}

/** CSELFDESTRUCT */
export function selfDestructCost(worldState: WorldState, machineState: MachineState, subState: AccruedSubState, environment: Environment) {
  /** r */
  const address = bigintToBytes(machineState.stack[0] % (2n ** 160n), 20);

  const accessCost = subState.accessedAccounts.map(bytesToHexString).includes(bytesToHexString(address)) ? 0n : cost.coldAccountAccess;
  const newAccountCost = isAccountDead(worldState, address) || worldState[bytesToHexString(environment.currentAddress)]?.balance !== 0n ? cost.newAccount : 0n;

  return cost.selfDestruct + accessCost + newAccountCost;
}

