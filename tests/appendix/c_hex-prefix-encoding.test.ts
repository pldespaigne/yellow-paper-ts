
import { hexPrefixEncode } from '../../appendix/c_hex-prefix-encoding';


describe('HP', () => {
  test('even length, flag 0', () => {
    const a = [ 1, 2, 3, 4 ];
    const b = hexPrefixEncode(a, 0);
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    expect(hex.length % 2).toBe(0);
    expect(hex[0]).toBe('0');
    expect(hex[1]).toBe('0');
    for (let i = 0; i < a.length; i++) {
      expect(hex[i + 2]).toBe(a[i].toString(16));
    }
  });

  test('even length, flag 1', () => {
    const a = [ 1, 2, 3, 4 ];
    const b = hexPrefixEncode(a, 1);
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    expect(hex.length % 2).toBe(0);
    expect(hex[0]).toBe('2');
    expect(hex[1]).toBe('0');
    for (let i = 0; i < a.length; i++) {
      expect(hex[i + 2]).toBe(a[i].toString(16));
    }
  });

  test('odd length, flag 0', () => {
    const a = [ 1, 2, 3, 4, 5 ];
    const b = hexPrefixEncode(a, 0);
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    expect(hex.length % 2).toBe(0);
    expect(hex[0]).toBe('1');
    for (let i = 0; i < a.length; i++) {
      expect(hex[i + 1]).toBe(a[i].toString(16));
    }
  });

  test('odd length, flag 1', () => {
    const a = [ 1, 2, 3, 4, 5 ];
    const b = hexPrefixEncode(a, 1);
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    expect(hex.length % 2).toBe(0);
    expect(hex[0]).toBe('3');
    for (let i = 0; i < a.length; i++) {
      expect(hex[i + 1]).toBe(a[i].toString(16));
    }
  });
});
