
import { rlp } from '../../appendix/b_recursive-length-prefix';
import { KEC } from '../../sections/3_conventions';


describe('RLP', () => {
  test('encode empty bytes', () => {
    const a = rlp(new Uint8Array());
    expect(a.length).toEqual(1);
    expect(a[0]).toEqual(128);
  });

  test('encode empty list', () => {
    const a = rlp([]);
    expect(a.length).toEqual(1);
    expect(a[0]).toEqual(192);
  });

  test('encode nested empty list', () => {
    const a = rlp([[], [[]], [[], [[]]]]);
    expect(a.length).toEqual(8);
    expect(a[0]).toEqual(199);
    expect(a[1]).toEqual(192);
    expect(a[2]).toEqual(193);
    expect(a[3]).toEqual(192);
    expect(a[4]).toEqual(195);
    expect(a[5]).toEqual(192);
    expect(a[6]).toEqual(193);
    expect(a[7]).toEqual(192);
  });

  test('encode simple list', () => {
    const a = rlp([1n, 2n, 3n, 4n]);
    expect(a.length).toEqual(5);
    expect(a[0]).toEqual(196);
    expect(a[1]).toEqual(1);
    expect(a[2]).toEqual(2);
    expect(a[3]).toEqual(3);
    expect(a[4]).toEqual(4);
  });

  test('test', () => {
    const a = KEC(rlp(new Uint8Array()));
    const b = KEC(rlp([]));
    
    console.log([...a].map(x => x.toString(16).padStart(2, '0')).join(''));
    console.log([...b].map(x => x.toString(16).padStart(2, '0')).join(''));
  });
});

