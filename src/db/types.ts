/** Urito domain model.
 *
 *  Money rule: every monetary value is an INTEGER in the currency minor unit
 *  (VND / JPY -> 1 = 1 dong / 1 yen, USD -> 1 = 1 cent).
 *  No floats anywhere, so no rounding drift in receipts or reports.
 */

export type ID = string;
export type Lang = 'vi' | 'ja' | 'en';
export type CurrencyCode = 'VND' | 'JPY' | 'USD';
export type Role = 'owner' | 'manager' | 'cashier';
export type BusinessType = 'retail' | 'cafe' | 'restaurant';
export type TaxMode = 'none' | 'inclusive' | 'exclusive';
export type DiscountType = 'none' | 'percent' | 'amount';
export type OrderType = 'retail' | 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'open' | 'paid' | 'void' | 'refunded';
export type PayMethod = 'cash' | 'card' | 'transfer' | 'ewallet' | 'qr' | 'debt' | 'points';
export type StockMoveType = 'in' | 'out' | 'adjust' | 'sale' | 'return' | 'waste' | 'init';

/* ------------------------------------------------------------------ settings */

export interface BackupSettings {
  auto: boolean;
  intervalMin: number;
  keep: number;
  folderLabel: string;
  lastAt: number;
  lastError: string;
  onOrderCount: number;
}

export interface Settings {
  id: 'app';
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  taxCode: string;
  logo: string;
  businessType: BusinessType;
  currency: CurrencyCode;
  lang: Lang;
  theme: 'light' | 'dark';
  taxMode: TaxMode;
  taxRate: number;
  serviceChargeRate: number;
  roundTo: number;
  receiptWidth: 58 | 80;
  receiptFooter: string;
  receiptShowLogo: boolean;
  receiptShowQr: boolean;
  bankInfo: string;
  printAfterPay: boolean;
  requireLogin: boolean;
  negativeStock: boolean;
  orderPrefix: string;
  nextOrderNo: number;
  loyaltyEnabled: boolean;
  loyaltyEarnPer: number;
  loyaltyPointValue: number;
  backup: BackupSettings;
  onboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------- catalogue */

export interface User {
  id: ID;
  name: string;
  pin: string;
  pinHash?: string;
  pinSalt?: string;
  role: Role;
  active: boolean;
  color: string;
  createdAt: number;
}

export interface Category {
  id: ID;
  name: string;
  color: string;
  sort: number;
  active: boolean;
}

export interface ModifierOption {
  id: ID;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: ID;
  name: string;
  required: boolean;
  multiple: boolean;
  options: ModifierOption[];
  sort: number;
}

export interface Product {
  id: ID;
  sku: string;
  barcode: string;
  name: string;
  categoryId: ID;
  price: number;
  cost: number;
  unit: string;
  trackStock: boolean;
  stock: number;
  minStock: number;
  isService: boolean;
  active: boolean;
  color: string;
  image: string;
  modifierGroupIds: ID[];
  favorite: boolean;
  sort: number;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ parties */

export interface Customer {
  id: ID;
  code: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  points: number;
  debt: number;
  totalSpent: number;
  orderCount: number;
  birthday: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Supplier {
  id: ID;
  name: string;
  phone: string;
  address: string;
  note: string;
  debt: number;
  active: boolean;
  createdAt: number;
}

/* ------------------------------------------------------------------- tables */

export interface Area {
  id: ID;
  name: string;
  sort: number;
}

export interface DiningTable {
  id: ID;
  areaId: ID;
  name: string;
  seats: number;
  sort: number;
}

/* ------------------------------------------------------------------- orders */

export interface OrderItemModifier {
  id: ID;
  name: string;
  priceDelta: number;
}

export interface OrderItem {
  id: ID;
  productId: ID;
  name: string;
  unit: string;
  price: number;
  cost: number;
  qty: number;
  modifiers: OrderItemModifier[];
  discountType: DiscountType;
  discountValue: number;
  note: string;
  gross: number;
  discount: number;
  total: number;
  refundedQty: number;
}

export interface Payment {
  id: ID;
  method: PayMethod;
  amount: number;
  ref: string;
  at: number;
}

export interface Refund {
  id: ID;
  at: number;
  amount: number;
  reason: string;
  method: PayMethod;
  userId: ID;
  items: { itemId: ID; qty: number; amount: number }[];
  restock: boolean;
}

export interface Order {
  id: ID;
  code: string;
  type: OrderType;
  status: OrderStatus;
  tableId: ID | null;
  tableName: string;
  guests: number;
  customerId: ID | null;
  customerName: string;
  items: OrderItem[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  serviceCharge: number;
  taxMode: TaxMode;
  taxRate: number;
  tax: number;
  rounding: number;
  total: number;
  cogs: number;
  paidAmount: number;
  changeAmount: number;
  dueAmount: number;
  payments: Payment[];
  refunds: Refund[];
  refundedAmount: number;
  pointsEarned: number;
  pointsUsed: number;
  pointsValue: number;
  note: string;
  userId: ID;
  userName: string;
  shiftId: ID | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number;
  voidedAt: number;
  voidReason: string;
}

/* ---------------------------------------------------------------- inventory */

export interface StockMovement {
  id: ID;
  productId: ID;
  productName: string;
  type: StockMoveType;
  qty: number;
  before: number;
  after: number;
  cost: number;
  refType: string;
  refId: string;
  note: string;
  userId: ID;
  userName: string;
  at: number;
}

export interface PurchaseItem {
  productId: ID;
  name: string;
  qty: number;
  cost: number;
  total: number;
}

export interface Purchase {
  id: ID;
  code: string;
  supplierId: ID | null;
  supplierName: string;
  items: PurchaseItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  status: 'draft' | 'received';
  note: string;
  userId: ID;
  userName: string;
  createdAt: number;
  receivedAt: number;
}

/* ------------------------------------------------------------ cash & shifts */

export interface Shift {
  id: ID;
  code: string;
  userId: ID;
  userName: string;
  openedAt: number;
  closedAt: number;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  nonCashSales: number;
  refundTotal: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  orderCount: number;
  totalSales: number;
  note: string;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: ID;
  shiftId: ID;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  note: string;
  userId: ID;
  userName: string;
  at: number;
}

export interface Expense {
  id: ID;
  category: string;
  amount: number;
  note: string;
  method: PayMethod;
  shiftId: ID | null;
  userId: ID;
  userName: string;
  at: number;
}

/* --------------------------------------------------------------- promotions */

export interface Promotion {
  id: ID;
  name: string;
  code: string;
  type: 'percent' | 'amount';
  value: number;
  minTotal: number;
  active: boolean;
  startAt: number;
  endAt: number;
  usageCount: number;
}

/* ---------------------------------------------------------------------- kv */

export interface KV {
  key: string;
  value: unknown;
}
