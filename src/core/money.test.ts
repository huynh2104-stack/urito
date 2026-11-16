import { describe, expect, it } from 'vitest';
import { formatMoney, normaliseQty, parseMoney, percentOf, roundToStep } from './money';

describe('parseMoney', () => {
  it('reads a Vietnamese amount with dot separators', () => {
    expect(parseMoney('1.250.000', 'VND')).toBe(1_250_000);
  });

  it('reads an amount with comma separators', () => {
    expect(parseMoney('1,250,000', 'VND')).toBe(1_250_000);
  });

  it('ignores the currency symbol the user pastes in', () => {
    expect(parseMoney('45.000 ₫', 'VND')).toBe(45_000);
    expect(parseMoney('¥1,200', 'JPY')).toBe(1_200);
  });

  it('returns 0 for empty or nonsense input', () => {
    expect(parseMoney('', 'VND')).toBe(0);
    expect(parseMoney('abc', 'VND')).toBe(0);
  });

  it('keeps cents for two-decimal currencies', () => {
    expect(parseMoney('12.34', 'USD')).toBe(1_234);
    expect(parseMoney('1,234.50', 'USD')).toBe(123_450);
  });

  it('treats a grouping separator as grouping, not a decimal point', () => {
    expect(parseMoney('1.234', 'USD')).toBe(123_400);
  });
});

describe('formatMoney', () => {
  it('puts the symbol after the number for VND', () => {
    expect(formatMoney(1_250_000, 'VND', 'vi')).toBe('1.250.000 ₫');
  });

  it('puts the symbol before the number for JPY', () => {
    expect(formatMoney(1_200, 'JPY', 'ja')).toBe('¥1,200');
  });

  it('shows two decimals for USD', () => {
    expect(formatMoney(1_234, 'USD', 'en')).toBe('$12.34');
  });
});

describe('rounding', () => {
  it('rounds a total to the nearest step', () => {
    expect(roundToStep(101_400, 1_000)).toBe(101_000);
    expect(roundToStep(101_500, 1_000)).toBe(102_000);
  });

  it('leaves the amount alone when rounding is off', () => {
    expect(roundToStep(101_437, 0)).toBe(101_437);
    expect(roundToStep(101_437, 1)).toBe(101_437);
  });

  it('rounds percentages half-up to the minor unit', () => {
    expect(percentOf(100_000, 8)).toBe(8_000);
    expect(percentOf(12_345, 10)).toBe(1_235);
    expect(percentOf(12_345, 0)).toBe(0);
  });

  it('keeps quantities to three decimals', () => {
    expect(normaliseQty(0.1 + 0.2)).toBe(0.3);
    expect(normaliseQty(1.23456)).toBe(1.235);
  });
});
