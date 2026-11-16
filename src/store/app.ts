import { useMemo } from 'react';
import { create } from 'zustand';
import { db, ensureDbOpen, kvGet, kvSet } from '@/db/db';
import { loadOrInitSettings } from '@/db/seed';
import { defaultSettings } from '@/db/defaults';
import { makeT, type TFunc } from '@/i18n';
import { formatAmount, formatMoney } from '@/core/money';
import type { Role, Settings, Shift, User } from '@/db/types';

const LAST_USER_KEY = 'session.lastUserId';
/** Stored instead of a user id when someone signs out, so a reload shows the
 *  staff picker instead of silently signing the first user back in. */
const SIGNED_OUT = '__signed_out__';

export interface AppState {
  ready: boolean;
  settings: Settings;
  users: User[];
  user: User | null;
  shift: Shift | null;
  /** Set when the service worker has a newer build waiting. */
  updateReady: boolean;

  init: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  reloadUsers: () => Promise<void>;
  setUser: (user: User | null) => Promise<void>;
  signOut: () => Promise<void>;
  reloadShift: () => Promise<void>;
  setUpdateReady: (v: boolean) => void;
}

export const useApp = create<AppState>()((set, get) => ({
  ready: false,
  settings: defaultSettings(),
  users: [],
  user: null,
  shift: null,
  updateReady: false,

  async init() {
    await ensureDbOpen();
    const settings = await loadOrInitSettings();
    applyTheme(settings.theme);
    document.documentElement.lang = settings.lang;
    const users = await db.users.filter((u) => u.active).toArray();
    let user: User | null = null;
    const lastId = await kvGet<string>(LAST_USER_KEY);
    const signedOut = lastId === SIGNED_OUT && users.length > 1;
    if (lastId && !signedOut) user = users.find((u) => u.id === lastId) ?? null;
    // Auto sign-in only when it is safe: a single account without a PIN, or the
    // shop has switched the staff picker off and the fallback is not PIN-locked.
    if (!user && !signedOut && !settings.requireLogin) {
      const fallback = users.find((u) => u.role === 'owner') ?? users[0];
      if (fallback && !fallback.pin) user = fallback;
    }
    if (user?.pin && settings.requireLogin) user = null;
    const shift = user ? await findOpenShift(user.id) : null;
    set({ ready: true, settings, users, user, shift });
  },

  async reloadSettings() {
    const settings = await loadOrInitSettings();
    applyTheme(settings.theme);
    document.documentElement.lang = settings.lang;
    set({ settings });
  },

  async updateSettings(patch) {
    const next: Settings = { ...get().settings, ...patch, updatedAt: Date.now() };
    await db.settings.put(next);
    applyTheme(next.theme);
    document.documentElement.lang = next.lang;
    set({ settings: next });
  },

  async reloadUsers() {
    const users = (await db.users.toArray()).filter((u) => u.active);
    const current = get().user;
    // Keep the signed-in user object fresh so a role or PIN change applies now.
    const fresh = current ? (users.find((u) => u.id === current.id) ?? null) : null;
    set({ users, user: fresh });
  },

  async setUser(user) {
    await kvSet(LAST_USER_KEY, user?.id ?? '');
    const shift = user ? await findOpenShift(user.id) : null;
    set({ user, shift });
  },

  async signOut() {
    await kvSet(LAST_USER_KEY, SIGNED_OUT);
    set({ user: null, shift: null });
  },

  async reloadShift() {
    const user = get().user;
    set({ shift: user ? await findOpenShift(user.id) : null });
  },

  setUpdateReady(v) {
    set({ updateReady: v });
  },
}));

/** A shift belongs to whoever opened it; any open shift keeps the drawer live. */
export async function findOpenShift(userId: string): Promise<Shift | null> {
  const own = await db.shifts.where('status').equals('open').toArray();
  if (!own.length) return null;
  return own.find((s) => s.userId === userId) ?? own[0];
}

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
}

/* --------------------------------------------------------------- selectors */

export function useT(): TFunc {
  const lang = useApp((s) => s.settings.lang);
  return makeT(lang);
}

export interface MoneyFormatter {
  (minor: number): string;
  plain: (minor: number) => string;
}

export function useMoney(): MoneyFormatter {
  const currency = useApp((s) => s.settings.currency);
  const lang = useApp((s) => s.settings.lang);
  return useMemo(() => {
    const fn = ((minor: number) => formatMoney(minor, currency, lang)) as MoneyFormatter;
    return Object.assign(fn, {
      plain: (minor: number) => formatAmount(minor, currency, lang),
    });
  }, [currency, lang]);
}

export function useLang() {
  return useApp((s) => s.settings.lang);
}

/* ------------------------------------------------------------- permissions */

export type Permission =
  | 'sell'
  | 'viewAllOrders'
  | 'voidOrder'
  | 'refund'
  | 'manageProducts'
  | 'manageInventory'
  | 'managePurchases'
  | 'manageCustomers'
  | 'viewReports'
  | 'manageStaff'
  | 'manageSettings'
  | 'manageBackup'
  | 'deleteData';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'sell', 'viewAllOrders', 'voidOrder', 'refund', 'manageProducts', 'manageInventory',
    'managePurchases', 'manageCustomers', 'viewReports', 'manageStaff', 'manageSettings',
    'manageBackup', 'deleteData',
  ],
  manager: [
    'sell', 'viewAllOrders', 'voidOrder', 'refund', 'manageProducts', 'manageInventory',
    'managePurchases', 'manageCustomers', 'viewReports', 'manageBackup',
  ],
  cashier: ['sell', 'manageCustomers'],
};

/** Which permission each top-level route needs; the router refuses the rest. */
export const ROUTE_PERMISSION: Record<string, Permission> = {
  '': 'sell',
  pos: 'sell',
  tables: 'sell',
  orders: 'sell',
  shifts: 'sell',
  customers: 'manageCustomers',
  products: 'manageProducts',
  labels: 'manageProducts',
  promotions: 'manageProducts',
  inventory: 'manageInventory',
  purchases: 'managePurchases',
  suppliers: 'managePurchases',
  expenses: 'viewReports',
  reports: 'viewReports',
  users: 'manageStaff',
  backup: 'manageBackup',
  settings: 'manageSettings',
};

export function can(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export function useCan(permission: Permission): boolean {
  const user = useApp((s) => s.user);
  return can(user, permission);
}
