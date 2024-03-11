
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *                2. THE BLOCKCHAIN PARADIGM                 *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#section.2


// equation (1) // TODO
// equation (2) // TODO
// equation (3) // TODO
// equation (4) // TODO


// * ---------------------------
// *  2.1. Value.


export const value = {
  wei: 10n ** 0n,
  szabo: 10n ** 12n,
  finney: 10n ** 15n,
  ether: 10n ** 18n,
} as const;


// * ---------------------------
// *  2.2. Which History?


export const fork = {
  /** FHomestead */
  homestead: 1_150_000n,
  /** FTangerineWhistle */
  tangerineWhistle: 2_463_000n,
  /** FSpuriousDragon */
  spuriousDragon: 2_675_000n,
  /** FByzantium */
  byzantium: 4_370_000n,
  /** FConstantinople */
  constantinople: 7_280_000n,
  /** FPetersburg */
  petersburg: 7_280_000n,
  /** FIstanbul */
  istanbul: 9_069_000n,
  /** FMuirGlacier */
  muirGlacier: 9_200_000n,
  /** FBerlin */
  berlin: 12_244_000n,
  /** FLondon */
  london: 12_965_000n,
  /** FArrowGlacier */
  arrowGlacier: 13_773_000n,
  /** FGrayGlacier */
  grayGlacier: 15_050_000n,
  /** FParis */
  paris: 15_537_394n,
} as const;


// equation (5)
/** β */
export const mainNetChainId = 1n;

