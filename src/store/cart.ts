import { create } from 'zustand';
import { newId } from '@/core/id';
import { computeLine, computeTotals, lineKey, type Totals } from '@/core/cart';
import { normaliseQty } from '@/core/money';
import type {
  DiscountType,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderType,
  Product,
  Settings,
} from '@/db/types';
import { useApp } from './app';

export interface CartState {
  /** Set when we are editing an order that already exists in the DB
   *  (a held ticket or a table that is still being served). */
  orderId: string | null;
  orderCode: string;
  createdAt: number;
  items: OrderItem[];
  type: OrderType;
  tableId: string | null;
  tableName: string;
  guests: number;
  customerId: string | null;
  customerName: string;
  customerPoints: number;
  discountType: DiscountType;
  discountValue: number;
  pointsUsed: number;
  note: string;
  promotionName: string;

  addProduct: (p: Product, opts?: { qty?: number; modifiers?: OrderItemModifier[]; note?: string }) => void;
  setQty: (lineId: string, qty: number) => void;
  bumpQty: (lineId: string, delta: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, type: DiscountType, value: number) => void;
  setLineNote: (lineId: string, note: string) => void;
  setLineModifiers: (lineId: string, modifiers: OrderItemModifier[]) => void;
  setDiscount: (type: DiscountType, value: number, promotionName?: string) => void;
  setCustomer: (id: string | null, name: string, points: number) => void;
  setTable: (id: string | null, name: string) => void;
  setType: (type: OrderType) => void;
  setGuests: (n: number) => void;
  setNote: (note: string) => void;
  setPointsUsed: (n: number) => void;
  clear: () => void;
  loadOrder: (order: Order) => void;
  isEmpty: () => boolean;
}

const EMPTY = {
  orderId: null,
  orderCode: '',
  createdAt: 0,
  items: [] as OrderItem[],
  type: 'retail' as OrderType,
  tableId: null,
  tableName: '',
  guests: 1,
  customerId: null,
  customerName: '',
  customerPoints: 0,
  discountType: 'none' as DiscountType,
  discountValue: 0,
  pointsUsed: 0,
  note: '',
  promotionName: '',
};

function recalc(item: OrderItem): OrderItem {
  const line = computeLine({
    price: item.price,
    qty: item.qty,
    cost: item.cost,
    modifiers: item.modifiers,
    discountType: item.discountType,
    discountValue: item.discountValue,
  });
  return { ...item, gross: line.gross, discount: line.discount, total: line.total };
}

export const useCart = create<CartState>()((set, get) => ({
  ...EMPTY,

  addProduct(p, opts) {
    const qty = normaliseQty(opts?.qty ?? 1);
    const modifiers = opts?.modifiers ?? [];
    const note = opts?.note ?? '';
    const key = lineKey(p.id, modifiers, note, 'none', 0);
    const items = [...get().items];
    const existing = items.findIndex(
      (i) => lineKey(i.productId, i.modifiers, i.note, i.discountType, i.discountValue) === key,
    );
    if (existing >= 0) {
      items[existing] = recalc({ ...items[existing], qty: normaliseQty(items[existing].qty + qty) });
    } else {
      items.push(
        recalc({
          id: newId('li'),
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          cost: p.cost,
          qty,
          modifiers,
          discountType: 'none',
          discountValue: 0,
          note,
          gross: 0,
          discount: 0,
          total: 0,
          refundedQty: 0,
          taxCategory: p.taxCategory ?? 'standard',
        }),
      );
    }
    set({ items });
  },

  setQty(lineId, qty) {
    const q = normaliseQty(qty);
    if (q <= 0) return get().removeLine(lineId);
    set({ items: get().items.map((i) => (i.id === lineId ? recalc({ ...i, qty: q }) : i)) });
  },

  bumpQty(lineId, delta) {
    const item = get().items.find((i) => i.id === lineId);
    if (!item) return;
    get().setQty(lineId, item.qty + delta);
  },

  removeLine(lineId) {
    set({ items: get().items.filter((i) => i.id !== lineId) });
  },

  setLineDiscount(lineId, type, value) {
    set({
      items: get().items.map((i) =>
        i.id === lineId ? recalc({ ...i, discountType: type, discountValue: value }) : i,
      ),
    });
  },

  setLineNote(lineId, note) {
    set({ items: get().items.map((i) => (i.id === lineId ? { ...i, note } : i)) });
  },

  setLineModifiers(lineId, modifiers) {
    set({ items: get().items.map((i) => (i.id === lineId ? recalc({ ...i, modifiers }) : i)) });
  },

  setDiscount(type, value, promotionName = '') {
    set({ discountType: type, discountValue: value, promotionName });
  },

  setCustomer(id, name, points) {
    set({ customerId: id, customerName: name, customerPoints: points, pointsUsed: 0 });
  },

  setTable(id, name) {
    set({ tableId: id, tableName: name, type: id ? 'dine_in' : get().type });
  },

  setType(type) {
    set({ type, ...(type === 'dine_in' ? {} : { tableId: null, tableName: '' }) });
  },

  setGuests(n) {
    set({ guests: Math.max(1, Math.round(n)) });
  },

  setNote(note) {
    set({ note });
  },

  setPointsUsed(n) {
    set({ pointsUsed: Math.max(0, Math.min(Math.round(n), get().customerPoints)) });
  },

  clear() {
    set({ ...EMPTY, items: [] });
  },

  loadOrder(order) {
    set({
      orderId: order.id,
      orderCode: order.code,
      createdAt: order.createdAt,
      items: order.items.map((i) => recalc(i)),
      type: order.type,
      tableId: order.tableId,
      tableName: order.tableName,
      guests: order.guests,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPoints: 0,
      discountType: order.discountType,
      discountValue: order.discountValue,
      pointsUsed: order.pointsUsed,
      note: order.note,
      promotionName: '',
    });
  },

  isEmpty() {
    return get().items.length === 0;
  },
}));

export function cartTotals(cart: CartState, settings: Settings): Totals {
  return computeTotals({
    items: cart.items,
    discountType: cart.discountType,
    discountValue: cart.discountValue,
    serviceChargeRate: settings.serviceChargeRate,
    taxMode: settings.taxMode,
    taxRate: settings.taxRate,
    taxRates: settings.taxRates,
    taxRounding: settings.taxRounding,
    orderType: cart.type,
    eatInRule: settings.eatInRule,
    roundTo: settings.roundTo,
    pointsUsed: settings.loyaltyEnabled ? cart.pointsUsed : 0,
    pointsValue: settings.loyaltyPointValue,
  });
}

export function useCartTotals(): Totals {
  const cart = useCart();
  const settings = useApp((s) => s.settings);
  return cartTotals(cart, settings);
}
