import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Bars, ean13CheckDigit, encodeCode128, generateInternalBarcode } from './barcode';

describe('Code 128', () => {
  it('has 107 symbols that each span 11 modules (stop spans 13)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((s, c) => s + Number(c), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });

  it('uses code set C for even-length digit strings', () => {
    const values = encodeCode128('123456');
    expect(values[0]).toBe(105);
    expect(values.slice(1, 4)).toEqual([12, 34, 56]);
  });

  it('uses code set B for text', () => {
    expect(encodeCode128('AB')[0]).toBe(104);
  });

  it('computes the reference checksum', () => {
    // Hand-worked: 104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7 = 879, 879 % 103 = 55.
    const values = encodeCode128('PJJ123C');
    expect(values[values.length - 2]).toBe(55);
  });

  it('produces a width consistent with its symbol count', () => {
    const { width } = code128Bars('123456');
    // start + 3 data + checksum = 5 symbols * 11, plus a 13-module stop.
    expect(width).toBe(5 * 11 + 13);
  });
});

describe('EAN-13', () => {
  it('calculates the check digit', () => {
    expect(ean13CheckDigit('893460200015')).toBe(6);
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  it('generates internal codes with prefix 20 and a valid check digit', () => {
    const code = generateInternalBarcode(new Set());
    expect(code).toMatch(/^20\d{11}$/);
    expect(Number(code[12])).toBe(ean13CheckDigit(code.slice(0, 12)));
  });
});
