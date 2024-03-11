
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                    9. EXECUTION MODEL                     *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.9

import { BlockHeader } from "./4_block-n-tx";


// * ---------------------------
// *  9.1. Basics.


// * ---------------------------
// *  9.2. Fees Overview.


// * ---------------------------
// *  9.3. Execution Environment.


/** I */
export interface Environment {
  /** Ia */
  currentAddress: Uint8Array;
  /** Io */
  originAddress: Uint8Array;
  /** Ip */
  gasPrice: bigint;
  /** Id */
  callData: Uint8Array;
  /** Is */
  callerAddress: Uint8Array;
  /** Iv */
  value: bigint;
  /** Ib */
  code: Uint8Array;
  /** IH */
  blockHeader: BlockHeader;
  /** Ie */
  callDepth: number;
  /** Iw */
  canModifyState: boolean;
};


// equation (137) // TODO


// * ---------------------------
// *  9.4. Execution Overview.


// equation (138) // TODO
// equation (139) // TODO
// equation (140) // TODO
// equation (141) // TODO
// equation (142) // TODO
// equation (143) // TODO
// equation (144) // TODO
// equation (145) // TODO
// equation (146) // TODO
// equation (147) // TODO
// equation (148) // TODO
// equation (149) // TODO
// equation (150) // TODO


// *    9.4.1. Machine State.


/** μ */
export interface MachineState {
  /** μg */
  availableGas: bigint;
  /** μpc */
  pc: number;
  /** μm */
  memory: Uint8Array;
  /** μi */
  memoryWordCount: number;
  /** μs */
  stack: bigint[];
  /** μo */
  output: Uint8Array;
};


// equation (151) // TODO


// *    9.4.2. Exceptional Halting.


// equation (152) // TODO
// equation (153) // TODO


// *    9.4.3. Jump Destination Validity.


// equation (154) // TODO
// equation (155) // TODO
// equation (156) // TODO


// *    9.4.4. Normal Halting.


// equation (157) // TODO


// *    9.4.5. The Execution Cycle.


// equation (158) // TODO
// equation (159) // TODO
// equation (160) // TODO
// equation (161) // TODO
// equation (162) // TODO
// equation (163) // TODO
// equation (164) // TODO
// equation (165) // TODO
// equation (166) // TODO
// equation (167) // TODO

