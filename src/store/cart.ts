import { useMemo } from 'react';
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
import { kvDelete, kvGet, kvSet } from '@/db/db';
import { makeT } from '@/i18n';
import { toast } from './ui';
import { useApp } from './app';

export interface CartState {
  /** DB 上の既存伝票（保留伝票や提供中テーブル伝票）を再編集しているときの伝票 ID。 */
  orderId: string | null;
  orderCode: string;
  createdAt: number;
  items: OrderItem[];
  qtyByProduct: Record<string, number>;
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
  promotionId: string | null;
  promotionName: string;

  addProduct: (p: Product, opts?: { qty?: number; modifiers?: OrderItemModifier[]; note?: string }) => void;
  setQty: (lineId: string, qty: number) => void;
  bumpQty: (lineId: string, delta: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, type: DiscountType, value: number) => void;
  setLineNote: (lineId: string, note: string) => void;
  setLineModifiers: (lineId: string, modifiers: OrderItemModifier[]) => void;
  setDiscount: (type: DiscountType, value: number, promotionName?: string, promotionId?: string | null) => void;
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
  qtyByProduct: {} as Record<string, number>,
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
  promotionId: null as string | null,
  promotionName: '',
};

const DRAFT_KEY = 'cart.draft';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface CartDraft {
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
  promotionId: string | null;
  promotionName: string;
  savedAt: number;
}

let draftTimer: ReturnType<typeof setTimeout> | null = null;
let draftUnsub: (() => void) | null = null;
let suppressDraftSave = false;

function computeQtyByProduct(items: OrderItem[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const i of items) {
    map[i.productId] = normaliseQty((map[i.productId] ?? 0) + i.qty);
  }
  return map;
}

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
    set({ items, qtyByProduct: computeQtyByProduct(items) });
  },

  setQty(lineId, qty) {
    const q = normaliseQty(qty);
    if (q <= 0) return get().removeLine(lineId);
    const items = get().items.map((i) => (i.id === lineId ? recalc({ ...i, qty: q }) : i));
    set({ items, qtyByProduct: computeQtyByProduct(items) });
  },

  bumpQty(lineId, delta) {
    const item = get().items.find((i) => i.id === lineId);
    if (!item) return;
    get().setQty(lineId, item.qty + delta);
  },

  removeLine(lineId) {
    const items = get().items.filter((i) => i.id !== lineId);
    set({ items, qtyByProduct: computeQtyByProduct(items) });
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

  setDiscount(type, value, promotionName = '', promotionId = null) {
    set({ discountType: type, discountValue: value, promotionName, promotionId });
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
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    suppressDraftSave = true;
    try {
      set({ ...EMPTY, items: [] });
    } finally {
      suppressDraftSave = false;
    }
    void kvDelete(DRAFT_KEY).catch(() => {});
  },

  loadOrder(order) {
      const items = order.items.map((i) => recalc(i));
    set({
      orderId: order.id,
      orderCode: order.code,
      createdAt: order.createdAt,
      items,
      qtyByProduct: computeQtyByProduct(items),
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
      promotionId: null,
      promotionName: '',
    });
  },

  isEmpty() {
    return get().items.length === 0;
  },
}));

/** B-05: カート下書きを IndexedDB (kv['cart.draft']) から復元し、以降の変更を 250ms デバウンスで自動保存する。 */
export async function initCartDraft(now = Date.now()): Promise<boolean> {
  if (!draftUnsub) {
    draftUnsub = useCart.subscribe((state) => {
      if (suppressDraftSave) return;
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = null;
        if (state.items.length === 0) {
          void kvDelete(DRAFT_KEY).catch(() => {});
          return;
        }
        const draft: CartDraft = {
          orderId: state.orderId,
          orderCode: state.orderCode,
          createdAt: state.createdAt,
          items: state.items,
          type: state.type,
          tableId: state.tableId,
          tableName: state.tableName,
          guests: state.guests,
          customerId: state.customerId,
          customerName: state.customerName,
          customerPoints: state.customerPoints,
          discountType: state.discountType,
          discountValue: state.discountValue,
          pointsUsed: state.pointsUsed,
          note: state.note,
          promotionId: state.promotionId,
          promotionName: state.promotionName,
          savedAt: Date.now(),
        };
        void kvSet(DRAFT_KEY, draft).catch(() => {});
      }, 250);
    });
  }

  const draft = await kvGet<CartDraft>(DRAFT_KEY);
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) return false;
  if (now - draft.savedAt >= DRAFT_TTL_MS) {
    await kvDelete(DRAFT_KEY);
    return false;
  }
  if (!useCart.getState().isEmpty()) return false;

  suppressDraftSave = true;
  try {
    const items = draft.items.map((i) => recalc(i));
    useCart.setState({
      orderId: draft.orderId ?? null,
      orderCode: draft.orderCode ?? '',
      createdAt: draft.createdAt ?? 0,
      items,
      qtyByProduct: computeQtyByProduct(items),
      type: draft.type ?? 'retail',
      tableId: draft.tableId ?? null,
      tableName: draft.tableName ?? '',
      guests: draft.guests ?? 1,
      customerId: draft.customerId ?? null,
      customerName: draft.customerName ?? '',
      customerPoints: draft.customerPoints ?? 0,
      discountType: draft.discountType ?? 'none',
      discountValue: draft.discountValue ?? 0,
      pointsUsed: draft.pointsUsed ?? 0,
      note: draft.note ?? '',
      promotionId: draft.promotionId ?? null,
      promotionName: draft.promotionName ?? '',
    });
  } finally {
    suppressDraftSave = false;
  }
  if (typeof window !== 'undefined') {
    const t = makeT(useApp.getState().settings.lang);
    toast.info(t('pos.draftRestored'));
  }
  return true;
}

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
  const items = useCart((s) => s.items);
  const discountType = useCart((s) => s.discountType);
  const discountValue = useCart((s) => s.discountValue);
  const type = useCart((s) => s.type);
  const pointsUsed = useCart((s) => s.pointsUsed);
  const settings = useApp((s) => s.settings);
  return useMemo(
    () =>
      computeTotals({
        items,
        discountType,
        discountValue,
        serviceChargeRate: settings.serviceChargeRate,
        taxMode: settings.taxMode,
        taxRate: settings.taxRate,
        taxRates: settings.taxRates,
        taxRounding: settings.taxRounding,
        orderType: type,
        eatInRule: settings.eatInRule,
        roundTo: settings.roundTo,
        pointsUsed: settings.loyaltyEnabled ? pointsUsed : 0,
        pointsValue: settings.loyaltyPointValue,
      }),
    [items, discountType, discountValue, type, pointsUsed, settings],
  );
}
