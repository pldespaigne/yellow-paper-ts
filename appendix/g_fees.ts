
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                     G. FEE SCHEDULE                       *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.G


/** G */
export const cost = {
  /** Gzero */
  zero: 0n,
  /** Gjumpdest */
  jumpDest: 1n,
  /** Gbase */
  base: 2n,
  /** Gverylow */
  veryLow: 3n,
  /** Glow */
  low: 5n,
  /** Gmid */
  mid: 8n,
  /** Ghigh */
  high: 10n,
  /** Gwarmaccess */
  warmAccess: 100n,
  /** Gaccesslistaddress */
  accessListAddress: 2_400n,
  /** Gaccessliststorage */
  accessListStorage: 1_900n,
  /** Gcoldaccountaccess */
  coldAccountAccess: 2_600n,
  /** Gcoldsload */
  coldSload: 2_100n,
  /** Gsset */
  storageSet: 20_000n,
  /** Gsreset */
  storageReset: 2_900n,
  /** Rsclear */
  refundStorageClear: 4_800n, // storageRest + accessListStorage,
  /** Gselfdestruct */
  selfDestruct: 5_000n,
  /** Gcreate */
  create: 32_000n,
  /** Gcodedeposit */
  codeDeposit: 200n,
  /** Gcallvalue */
  callValue: 9_000n,
  /** Gcallstipend */
  callStipend: 2_300n,
  /** Gnewaccount */
  newAccount: 25_000n,
  /** Gexp */
  exp: 10n,
  /** Gexpbyte */
  expByte: 50n,
  /** Gmemory */
  memory: 3n,
  /** Gtxcreate */
  txCreate: 32_000n,
  /** Gtxdatazero */
  txDataZero: 4n,
  /** Gtxdatanonzero */
  txDataNonZero: 16n,
  /** Gtransaction */
  transaction: 21_000n,
  /** Glog */
  log: 375n,
  /** Glogdata */
  logData: 8n,
  /** Glogtopic */
  logTopic: 375n,
  /** Gkeccak256 */
  keccak256: 30n,
  /** Gkeccak256word */
  keccak256Word: 6n,
  /** Gcopy */
  copy: 3n,
  /** Gblockhash */
  blockHash: 20n,
} as const;
(cost as any).refundStorageClear = cost.storageReset + cost.accessListStorage;

