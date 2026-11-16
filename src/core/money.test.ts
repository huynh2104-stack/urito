import { describe, expect, it } from 'vitest';
import { convertByRate, formatMoney, normaliseQty, parseMoney, percentOf, roundToStep } from './money';

describe('parseMoney 金額文字列解析', () => {
  it('ドット区切りのベトナム金額文字列を解析できる', () => {
    expect(parseMoney('1.250.000', 'VND')).toBe(1_250_000);
  });

  it('カンマ区切りの金額文字列を解析できる', () => {
    expect(parseMoney('1,250,000', 'VND')).toBe(1_250_000);
  });

  it('貼り付けた通貨記号を無視して数値を抽出できる', () => {
    expect(parseMoney('45.000 ₫', 'VND')).toBe(45_000);
    expect(parseMoney('¥1,200', 'JPY')).toBe(1_200);
  });

  it('空文字や不正な入力には 0 を返す', () => {
    expect(parseMoney('', 'VND')).toBe(0);
    expect(parseMoney('abc', 'VND')).toBe(0);
  });

  it('小数点2桁の通貨(USD)でセント単位を保持する', () => {
    expect(parseMoney('12.34', 'USD')).toBe(1_234);
    expect(parseMoney('1,234.50', 'USD')).toBe(123_450);
  });

  it('USDで3桁ごとの桁区切りを小数点と誤認しない', () => {
    expect(parseMoney('1.234', 'USD')).toBe(123_400);
  });
});

describe('formatMoney 金額表示整形', () => {
  it('VNDでは数値の後ろに通貨記号を付ける', () => {
    expect(formatMoney(1_250_000, 'VND', 'vi')).toBe('1.250.000 ₫');
  });

  it('JPYでは数値の前に通貨記号を付ける', () => {
    expect(formatMoney(1_200, 'JPY', 'ja')).toBe('¥1,200');
  });

  it('USDでは小数第2位まで表示する', () => {
    expect(formatMoney(1_234, 'USD', 'en')).toBe('$12.34');
  });
});

describe('端数処理・割合計算', () => {
  it('指定したステップ単位へ最も近い値に丸める', () => {
    expect(roundToStep(101_400, 1_000)).toBe(101_000);
    expect(roundToStep(101_500, 1_000)).toBe(102_000);
  });

  it('丸め設定が無効(0または1)のときは元の金額を保つ', () => {
    expect(roundToStep(101_437, 0)).toBe(101_437);
    expect(roundToStep(101_437, 1)).toBe(101_437);
  });

  it('整数金額のパーセンテージを四捨五入で最小単位へ計算する', () => {
    expect(percentOf(100_000, 8)).toBe(8_000);
    expect(percentOf(12_345, 10)).toBe(1_235);
    expect(percentOf(12_345, 0)).toBe(0);
  });

  it('数量を小数点以下3桁に正規化する', () => {
    expect(normaliseQty(0.1 + 0.2)).toBe(0.3);
    expect(normaliseQty(1.23456)).toBe(1.235);
  });

  it('手動設定した為替レートから外貨の最小単位金額へ換算できる (F-02)', () => {
    // 為替例: 1 JPY = 0.0067 USD なら 1000 JPY = 6.70 USD = 670 セント
    expect(convertByRate(1000, 'JPY', 'USD', 0.0067)).toBe(670);
    // 為替例: 1 USD (100 セント) = 150 JPY なら $12.50 = 1250 セント = 1875 JPY
    expect(convertByRate(1250, 'USD', 'JPY', 150)).toBe(1875);
  });
});
