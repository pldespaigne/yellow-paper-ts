
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// *                                                           *
// *             D. MODIFIED MERKLE PATRICIA TREE              *
// *                                                           *
// * """"""""""""""""""""""""""""""""""""""""""""""""""""""""" *
// * https://ethereum.github.io/yellowpaper/paper.pdf#appendix.D


import { KEC } from '../sections/3_conventions';
import { rlp } from './b_recursive-length-prefix';
import { hexPrefixEncode } from './c_hex-prefix-encoding';


// equation (192)
/** J */
export type Dataset = KeyValue[];

// equation (193)
/** I */
export type KeyValue = [
  /** I0 */
  key: Uint8Array,
  /** I1 */
  value: Uint8Array,
];

// equation (194)
export type NibbleDataset = [ key: number[], value: Uint8Array ][];
/** y(J) */
export function nibblizeDataset(dataset: Dataset): NibbleDataset {
  return dataset.map(([ key, value ]) => ([ nibblizeKey(key), value ]));
}

// equation (195)
/** k' */
export function nibblizeKey(key: Uint8Array): number[] {
  const nibbleKey: number[] = [];
  for (let i = 0 ; i < 2 * key.length ; i++) {
    if (i % 2 === 0) {
      nibbleKey.push(Math.floor(key[i / 2] / 16));
    } else {
      nibbleKey.push(key[Math.floor(i / 2)] % 16);
    }
  }
  return nibbleKey;
}

// equation (196)
/** TRIE(J) */
export function computeRootHash(dataset: Dataset): Uint8Array {
  return KEC(rlp(createNode(nibblizeDataset(dataset), 0)))
}

// equation (197)
/** n(J, i) */
export function n(dataset: NibbleDataset, nibbleIndex: number) {
  if (dataset.length === 0) {
    return new Uint8Array();
  }

  const node = createNode(dataset, nibbleIndex);
  const encodedNode = rlp(node);
  if (encodedNode.length < 32) {
    return node[node.length - 1];
  } else {
    return KEC(encodedNode);
  }
}

export type Leaf = [ Uint8Array, Uint8Array ];
export type Extension = [ Uint8Array, Node ];
export type Branch = [
  Node, // 0
  Node, // 1
  Node, // 2
  Node, // 3
  Node, // 4
  Node, // 5
  Node, // 6
  Node, // 7
  Node, // 8
  Node, // 9
  Node, // 10
  Node, // 11
  Node, // 12
  Node, // 13
  Node, // 14
  Node, // 15
  Uint8Array, // value
];

export type Node = Leaf | Extension | Branch;

// equation (198)
/** c(J, i) */
export function createNode(dataset: NibbleDataset, nibbleIndex: number): Node {
  if (dataset.length === 1) {
    return [ hexPrefixEncode(dataset[0][0].slice(nibbleIndex, dataset[0][0].length - 1), 1), dataset[0][1] ] as Leaf; // leaf node
  }

  let keepGoing = true;
  let commonPrefix: number[] = [ dataset[0][0][0] ]; // first nibble of first key
  while (keepGoing) {
    for (let entry of dataset) {
      const nibble = entry[0][commonPrefix.length - 1];
      if (nibble !== commonPrefix[commonPrefix.length - 1]) {
        keepGoing = false;
        break;
      }
    }
    if (keepGoing) commonPrefix.push(dataset[0][0][commonPrefix.length - 1]);
  }
  if (nibbleIndex !== commonPrefix.length) {
    return [ hexPrefixEncode(dataset[0][0].slice(nibbleIndex, commonPrefix.length - 1), 0), n(dataset, commonPrefix.length) ] as Extension; // extension node
  }

  

  /** u(j) */
  const filterDataset = (nibble: number) => n(dataset.filter(([ key ]) => key[nibbleIndex] === nibble), nibbleIndex + 1);

  /** v */
  const value = dataset.find(([ key ]) => key.length === nibbleIndex)?.[1] ?? new Uint8Array();

  // branch node
  return [
    filterDataset(0),
    filterDataset(1),
    filterDataset(2),
    filterDataset(3),
    filterDataset(4),
    filterDataset(5),
    filterDataset(6),
    filterDataset(7),
    filterDataset(8),
    filterDataset(9),
    filterDataset(10),
    filterDataset(11),
    filterDataset(12),
    filterDataset(13),
    filterDataset(14),
    filterDataset(15),
    value,
  ] as Branch;
}


// * ---------------------------
// *  D.1. Trie Database.

