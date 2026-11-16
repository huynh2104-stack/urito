import { computeTotals } from '@/core/cart';
import { effectiveTaxRateBp } from '@/core/tax';
import type { Order, OrderItem, Settings, TaxCategory } from '@/db/types';

const SAMPLE_NAMES: Record<string, [string, string]> = {
  vi: ['Cà phê sữa', 'Bánh mì thịt'],
  ja: ['ブレンドコーヒー', '玉子サンド ※テイクアウト'],
  en: ['Milk coffee', 'Sandwich'],
};

/** 設定画面のレシートプレビュー用ダミー伝票（標準10%＋軽減8%の混合例）を生成する。 */
export function sampleOrder(settings: Settings): Order {
  const scale = settings.currency === 'VND' ? 1 : settings.currency === 'JPY' ? 1 / 170 : 1 / 25;
  const price = (vnd: number) =>
    Math.max(
      1,
      Math.round((vnd * scale) / (settings.currency === 'VND' ? 1 : 10)) * (settings.currency === 'VND' ? 1 : 10),
    );
  const [nameA, nameB] = SAMPLE_NAMES[settings.lang] ?? SAMPLE_NAMES.en;

  const mk = (id: string, name: string, unitPrice: number, qty: number, taxCategory: TaxCategory): OrderItem => ({
    id,
    productId: id,
    name,
    unit: '',
    price: unitPrice,
    cost: Math.round(unitPrice * 0.4),
    qty,
    modifiers: [],
    discountType: 'none',
    discountValue: 0,
    note: '',
    gross: unitPrice * qty,
    discount: 0,
    total: unitPrice * qty,
    refundedQty: 0,
    taxCategory,
    taxRateBp: effectiveTaxRateBp(taxCategory, 'retail', settings),
  });

  const pA = settings.currency === 'JPY' ? 450 : price(30000);
  const pB = settings.currency === 'JPY' ? 380 : price(35000);
  const items = [mk('s1', nameA, pA, 2, 'standard'), mk('s2', nameB, pB, 1, 'reduced')];
  const totals = computeTotals({
    items,
    discountType: 'none',
    discountValue: 0,
    serviceChargeRate: settings.serviceChargeRate,
    taxMode: settings.taxMode,
    taxRate: settings.taxRate,
    taxRates: settings.taxRates,
    taxRounding: settings.taxRounding,
    orderType: 'retail',
    eatInRule: settings.eatInRule,
    roundTo: settings.roundTo,
  });

  const now = Date.now();
  return {
    id: 'preview',
    code: `${settings.orderPrefix}01-261116-0001`,
    type: 'retail',
    status: 'paid',
    tableId: null,
    tableName: '',
    guests: 1,
    customerId: null,
    customerName: '',
    items,
    subtotal: totals.subtotal,
    discountType: 'none',
    discountValue: 0,
    discount: totals.discount,
    serviceCharge: totals.serviceCharge,
    taxMode: settings.taxMode,
    taxRate: settings.taxRate,
    tax: totals.tax,
    taxLines: totals.taxLines,
    rounding: totals.rounding,
    total: totals.total,
    cogs: totals.cogs,
    paidAmount: totals.total,
    changeAmount: 0,
    dueAmount: 0,
    payments: [{ id: 'p1', method: 'cash', amount: totals.total, ref: '', at: now }],
    refunds: [],
    refundedAmount: 0,
    pointsEarned: 0,
    pointsUsed: 0,
    pointsValue: 0,
    note: '',
    userId: '',
    userName: '—',
    shiftId: null,
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    voidedAt: 0,
    voidReason: '',
  };
}
