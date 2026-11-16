import { db } from '@/db/db';
import { getDeviceNo, nextSeq } from '@/db/seq';
import { formatCode, newId } from '@/core/id';
import type { CashMovement, Expense, Order, Refund, Shift, User } from '@/db/types';

export interface ShiftTotals {
  orderCount: number;
  totalSales: number;
  cashSales: number;
  nonCashSales: number;
  refundTotal: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  expenseCash: number;
  discountTotal: number;
  expectedCash: number;
  byMethod: Record<string, number>;
}

/** 伝票および現在シフトで発生した返金・取消明細からシフト集計を再計算する。 */
export function computeShiftTotals(
  shift: Shift,
  orders: Order[],
  movements: CashMovement[],
  expenses: Expense[],
  externalRefunds?: Refund[],
): ShiftTotals {
  // B-02: 返金仕訳(refunds.length > 0)を伴う取消済み伝票は、売上回収自体は当該シフトに残るため含める
  const paid = orders.filter((o) => o.status !== 'open' && (o.status !== 'void' || o.refunds.length > 0));
  const byMethod: Record<string, number> = {};
  let cashSales = 0;
  let nonCashSales = 0;
  let change = 0;

  for (const order of paid) {
    for (const p of order.payments) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
      if (p.method === 'cash') cashSales += p.amount;
      else nonCashSales += p.amount;
    }
    change += order.changeAmount;
  }

  const refunds =
    externalRefunds ??
    paid.flatMap((o) => o.refunds.filter((r) => (r.shiftId !== undefined ? r.shiftId : o.shiftId) === shift.id));
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const cashRefunds = refunds
    .filter((r) => r.method === 'cash')
    .reduce((s, r) => s + Math.max(0, r.amount - (r.debtOffset ?? 0)), 0);

  const cashIn = movements.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0);
  const cashOut = movements.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0);
  const expenseCash = expenses.filter((e) => e.method === 'cash').reduce((s, e) => s + e.amount, 0);

  return {
    orderCount: paid.length,
    totalSales: paid.reduce((s, o) => s + o.total, 0) - refundTotal,
    cashSales: cashSales - change,
    nonCashSales,
    refundTotal,
    cashRefunds,
    cashIn,
    cashOut,
    expenseCash,
    discountTotal: paid.reduce((s, o) => s + o.discount, 0),
    expectedCash:
      shift.openingCash + (cashSales - change) + cashIn - cashOut - cashRefunds - expenseCash,
    byMethod,
  };
}

export async function loadShiftData(shift: Shift): Promise<{
  orders: Order[];
  movements: CashMovement[];
  expenses: Expense[];
  totals: ShiftTotals;
}> {
  const orders = await db.orders.where('shiftId').equals(shift.id).toArray();
  const movements = await db.cashMovements.where('shiftId').equals(shift.id).toArray();
  const expenses = await db.expenses.where('shiftId').equals(shift.id).toArray();
  const ordersWithRefunds = await db.orders.filter((o) => o.refunds.length > 0).toArray();
  const shiftRefunds = ordersWithRefunds.flatMap((o) =>
    o.refunds.filter((r) => (r.shiftId !== undefined ? r.shiftId : o.shiftId) === shift.id),
  );
  return {
    orders,
    movements,
    expenses,
    totals: computeShiftTotals(shift, orders, movements, expenses, shiftRefunds),
  };
}

export async function openShift(user: User, openingCash: number, note = ''): Promise<Shift> {
  return db.transaction('rw', [db.shifts, db.kv], async () => {
    const now = Date.now();
    const seq = await nextSeq('shift');
    const deviceNo = await getDeviceNo();
    const shift: Shift = {
      id: newId('sh'),
      code: formatCode('CA', seq, new Date(now), deviceNo),
      userId: user.id,
      userName: user.name,
      openedAt: now,
      closedAt: 0,
      openingCash: Math.round(openingCash),
      cashIn: 0,
      cashOut: 0,
      cashSales: 0,
      nonCashSales: 0,
      refundTotal: 0,
      expectedCash: Math.round(openingCash),
      countedCash: 0,
      difference: 0,
      orderCount: 0,
      totalSales: 0,
      note,
      status: 'open',
    };
    await db.shifts.add(shift);
    return shift;
  });
}

export async function closeShift(shift: Shift, countedCash: number, note: string): Promise<Shift> {
  const { totals } = await loadShiftData(shift);
  const closed: Shift = {
    ...shift,
    closedAt: Date.now(),
    cashIn: totals.cashIn,
    cashOut: totals.cashOut,
    cashSales: totals.cashSales,
    nonCashSales: totals.nonCashSales,
    refundTotal: totals.refundTotal,
    expectedCash: totals.expectedCash,
    countedCash: Math.round(countedCash),
    difference: Math.round(countedCash) - totals.expectedCash,
    orderCount: totals.orderCount,
    totalSales: totals.totalSales,
    note: note || shift.note,
    status: 'closed',
  };
  await db.shifts.put(closed);
  return closed;
}

export async function addCashMovement(
  shift: Shift,
  type: 'in' | 'out',
  amount: number,
  reason: string,
  note: string,
  user: User | null,
): Promise<void> {
  await db.cashMovements.add({
    id: newId('cm'),
    shiftId: shift.id,
    type,
    amount: Math.round(Math.abs(amount)),
    reason,
    note,
    userId: user?.id ?? '',
    userName: user?.name ?? '',
    at: Date.now(),
  });
}
