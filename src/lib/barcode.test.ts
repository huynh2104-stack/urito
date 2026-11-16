import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Bars, ean13CheckDigit, encodeCode128, generateInternalBarcode } from './barcode';

describe('Code 128 エンコーダ', () => {
  it('全107シンボルが11モジュール幅を持つ（ストップ文字のみ13幅）', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((s, c) => s + Number(c), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });

  it('偶数桁の数字列には Code Set C を使用する', () => {
    const values = encodeCode128('123456');
    expect(values[0]).toBe(105);
    expect(values.slice(1, 4)).toEqual([12, 34, 56]);
  });

  it('英字文字列には Code Set B を使用する', () => {
    expect(encodeCode128('AB')[0]).toBe(104);
  });

  it('標準計算式どおりのチェックサム値を算出する', () => {
    // 手計算検算: 104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7 = 879, 879 % 103 = 55
    const values = encodeCode128('PJJ123C');
    expect(values[values.length - 2]).toBe(55);
  });

  it('シンボル数に一致した総モジュール幅を出力する', () => {
    const { width } = code128Bars('123456');
    // 開始 + データ3語 + チェックサム = 5シンボル×11幅 ＋ ストップ13幅
    expect(width).toBe(5 * 11 + 13);
  });
});

describe('EAN-13 バーコード生成', () => {
  it('チェックデジットを正しく計算する', () => {
    expect(ean13CheckDigit('893460200015')).toBe(6);
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  it('インストアコード用プレフィックス20と有効なチェックデジットを生成する', () => {
    const code = generateInternalBarcode(new Set());
    expect(code).toMatch(/^20\d{11}$/);
    expect(Number(code[12])).toBe(ean13CheckDigit(code.slice(0, 12)));
  });
});
