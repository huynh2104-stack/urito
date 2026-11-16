import { computeTotals } from '@/core/cart';
import type { Order, OrderItem, Settings } from '@/db/types';

const SAMPLE_NAMES: Record<string, [string, string]> = {
  vi: ['Cà phê sữa', 'Bánh mì thịt'],
  ja: ['カフェラテ', 'サンドイッチ'],
  en: ['Milk coffee', 'Sandwich'],
};

/** A fake invoice used only to preview the receipt layout in Settings. */
export function sampleOrder(settings: Settings): Order {
  const scale = settings.currency === 'VND' ? 1 : settings.currency === 'JPY' ? 1 / 170 : 1 / 25;
  const price = (vnd: number) => Math.max(1, Math.round((vnd * scale) / (settings.currency === 'VND' ? 1 : 10)) * (settings.currency === 'VND' ? 1 : 10));
  const [nameA, nameB] = SAMPLE_NAMES[settings.lang] ?? SAMPLE_NAMES.en;

  const mk = (id: string, name: string, unitPrice: number, qty: number): OrderItem => ({
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
  });

  const items = [mk('s1', nameA, price(30000), 2), mk('s2', nameB, price(35000), 1)];
  const totals = computeTotals({
    items,
    discountType: 'none',
    discountValue: 0,
    serviceChargeRate: settings.serviceChargeRate,
    taxMode: settings.taxMode,
    taxRate: settings.taxRate,
    roundTo: settings.roundTo,
  });

  const now = Date.now();
  return {
    id: 'preview',
    code: `${settings.orderPrefix}000000-0001`,
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
