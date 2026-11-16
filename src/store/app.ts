import { useMemo } from 'react';
import { create } from 'zustand';
import { liveQuery } from 'dexie';
import {
  clearDemoScenarioStorage,
  db,
  ensureDbOpen,
  getDemoScenario,
  isDemoMode,
  kvGet,
  kvSet,
  setDemoScenarioStorage,
  type DemoScenario,
} from '@/db/db';
import { loadOrInitSettings, seedWorkspace } from '@/db/seed';
import { BACKGROUND_TASKS, runBackgroundMigrations } from '@/db/migrations/background';
import { hasPin } from '@/core/pin';
import { ensureFontsForLang } from '@/lib/fonts';
import { defaultSettings } from '@/db/defaults';
import { makeT, type TFunc } from '@/i18n';
import { formatAmount, formatMoney } from '@/core/money';
import type { BusinessType, Role, Settings, Shift, User } from '@/db/types';
import { initCartDraft, useCart } from './cart';

const DEMO_CONFIG: Record<DemoScenario, { businessType: BusinessType; shopName: string }> = {
  'ja-retail': { businessType: 'retail', shopName: 'うりと商店' },
  'ja-cafe': { businessType: 'cafe', shopName: '喫茶うりと' },
  'ja-restaurant': { businessType: 'restaurant', shopName: 'うりと食堂' },
};

async function seedDemoScenario(scenario: DemoScenario): Promise<Settings> {
  const cfg = DEMO_CONFIG[scenario];
  await Promise.all(db.tables.map((t) => t.clear()));
  useCart.getState().clear();
  return seedWorkspace({
    businessType: cfg.businessType,
    lang: 'ja',
    currency: 'JPY',
    shopName: cfg.shopName,
    ownerName: '店主',
    withSampleData: true,
    withSampleHistory: true,
  });
}

const LAST_USER_KEY = 'session.lastUserId';
/** Stored instead of a user id when someone signs out, so a reload shows the
 *  staff picker instead of silently signing the first user back in. */
const SIGNED_OUT = '__signed_out__';

export type SettingsPatch = Partial<Settings> | ((cur: Settings) => Partial<Settings>);

export interface AppState {
  ready: boolean;
  settings: Settings;
  users: User[];
  user: User | null;
  shift: Shift | null;
  /** Set when the service worker has a newer build waiting. */
  updateReady: boolean;
  demoScenario: DemoScenario | null;

  init: () => Promise<void>;
  switchDemoScenario: (scenario: DemoScenario) => Promise<void>;
  resetDemo: () => Promise<void>;
  exitDemo: () => void;
  reloadSettings: () => Promise<void>;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  reloadUsers: () => Promise<void>;
  setUser: (user: User | null) => Promise<void>;
  signOut: () => Promise<void>;
  reloadShift: () => Promise<void>;
  setUpdateReady: (v: boolean) => void;
}

let settingsSub: { unsubscribe: () => void } | null = null;

export const useApp = create<AppState>()((set, get) => ({
  ready: false,
  settings: defaultSettings(),
  users: [],
  user: null,
  shift: null,
  updateReady: false,
  demoScenario: null,

  async init() {
    await ensureDbOpen();
    let settings = await loadOrInitSettings();
    const demoScenario = isDemoMode() ? (getDemoScenario() ?? 'ja-retail') : null;
    if (demoScenario && !settings.onboarded) {
      settings = await seedDemoScenario(demoScenario);
    }
    applyDomSettings(settings);

    settingsSub?.unsubscribe();
    settingsSub = liveQuery(() => db.settings.get('app')).subscribe({
      next: (fresh) => {
        if (!fresh) return;
        applyDomSettings(fresh);
        set({ settings: fresh });
      },
    });

    const users = await db.users.filter((u) => u.active).toArray();
    let user: User | null = null;
    if (demoScenario) {
      user = users.find((u) => u.role === 'owner') ?? users[0] ?? null;
    } else {
      const lastId = await kvGet<string>(LAST_USER_KEY);
      const signedOut = lastId === SIGNED_OUT && users.length > 1;
      if (lastId && !signedOut) user = users.find((u) => u.id === lastId) ?? null;
      // 自動ログインは安全な場合のみ（PIN未設定の単一アカウント等）
      if (!user && !signedOut && !settings.requireLogin) {
        const fallback = users.find((u) => u.role === 'owner') ?? users[0];
        if (fallback && !hasPin(fallback)) user = fallback;
      }
      if (user && hasPin(user) && settings.requireLogin) user = null;
    }
    const shift = user ? await findOpenShift(user.id) : null;
    set({ ready: true, settings, users, user, shift, demoScenario });
    await initCartDraft();
    void runBackgroundMigrations(BACKGROUND_TASKS)
      .then(() => get().reloadUsers())
      .catch(() => {});
  },

  async switchDemoScenario(scenario) {
    setDemoScenarioStorage(scenario);
    const settings = await seedDemoScenario(scenario);
    applyDomSettings(settings);
    const users = await db.users.filter((u) => u.active).toArray();
    const user = users.find((u) => u.role === 'owner') ?? users[0] ?? null;
    const shift = user ? await findOpenShift(user.id) : null;
    set({ ready: true, settings, users, user, shift, demoScenario: scenario });
  },

  async resetDemo() {
    const cur = get().demoScenario ?? getDemoScenario() ?? 'ja-retail';
    await get().switchDemoScenario(cur);
  },

  exitDemo() {
    clearDemoScenarioStorage();
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.location.href = url.toString();
    }
  },

  async reloadSettings() {
    const settings = await loadOrInitSettings();
    applyDomSettings(settings);
    set({ settings });
  },

  async updateSettings(patch) {
    const next = await db.transaction('rw', db.settings, async () => {
      const cur = (await db.settings.get('app')) ?? get().settings;
      const partial = typeof patch === 'function' ? patch(cur) : patch;
      const mergedBackup = partial.backup ? { ...cur.backup, ...partial.backup } : cur.backup;
      const updated: Settings = {
        ...cur,
        ...partial,
        backup: mergedBackup,
        id: 'app',
        updatedAt: Date.now(),
      };
      await db.settings.put(updated);
      return updated;
    });
    applyDomSettings(next);
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

function applyDomSettings(settings: Settings): void {
  ensureFontsForLang(settings.lang);
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.lang = settings.lang;
}

export function applyTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
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
  roadmap: 'sell',
};

export function can(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export function useCan(permission: Permission): boolean {
  const user = useApp((s) => s.user);
  return can(user, permission);
}
