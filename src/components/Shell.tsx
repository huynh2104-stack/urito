import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Button, Modal, Select } from './ui';
import { Logo } from './Logo';
import { navigate, useRoute } from '@/router';
import { can, useApp, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { confirmDialog, toast, useUI } from '@/store/ui';
import { applyServiceWorkerUpdate } from '@/lib/sw';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { db, isDemoMode, type DemoScenario } from '@/db/db';
import { featureStatusForPath } from '@/features/registry';
import type { Permission } from '@/store/app';
import type { TranslationKey } from '@/i18n';
import type { BusinessType, Role } from '@/db/types';

interface NavEntry {
  path: string;
  labelKey: TranslationKey;
  icon: IconName;
  permission: Permission;
  /** 指定された業種タイプ以外では非表示にする。 */
  onlyFor?: BusinessType[];
  badge?: 'lowStock' | 'openOrders';
}

const NAV: { groupKey: TranslationKey; items: NavEntry[] }[] = [
  {
    groupKey: 'nav.groupSell',
    items: [
      { path: '/', labelKey: 'nav.dashboard', icon: 'dashboard', permission: 'sell' },
      { path: '/pos', labelKey: 'nav.pos', icon: 'pos', permission: 'sell' },
      {
        path: '/tables',
        labelKey: 'nav.tables',
        icon: 'table',
        permission: 'sell',
        onlyFor: ['cafe', 'restaurant'],
        badge: 'openOrders',
      },
      { path: '/orders', labelKey: 'nav.orders', icon: 'receipt', permission: 'sell' },
      { path: '/shifts', labelKey: 'nav.shifts', icon: 'clock', permission: 'sell' },
      { path: '/customers', labelKey: 'nav.customers', icon: 'users', permission: 'manageCustomers' },
    ],
  },
  {
    groupKey: 'nav.groupManage',
    items: [
      { path: '/products', labelKey: 'nav.products', icon: 'box', permission: 'manageProducts' },
      { path: '/inventory', labelKey: 'nav.inventory', icon: 'warehouse', permission: 'manageInventory', badge: 'lowStock' },
      { path: '/purchases', labelKey: 'nav.purchases', icon: 'truck', permission: 'managePurchases' },
      { path: '/suppliers', labelKey: 'nav.suppliers', icon: 'store', permission: 'managePurchases' },
      { path: '/promotions', labelKey: 'nav.promotions', icon: 'tag', permission: 'manageProducts' },
      { path: '/expenses', labelKey: 'nav.expenses', icon: 'wallet', permission: 'viewReports' },
      { path: '/reports', labelKey: 'nav.reports', icon: 'chart', permission: 'viewReports' },
    ],
  },
  {
    groupKey: 'nav.groupSystem',
    items: [
      { path: '/users', labelKey: 'nav.users', icon: 'user', permission: 'manageStaff' },
      { path: '/backup', labelKey: 'nav.backup', icon: 'cloud', permission: 'manageBackup' },
      { path: '/settings', labelKey: 'nav.settings', icon: 'settings', permission: 'manageSettings' },
      { path: '/roadmap', labelKey: 'nav.roadmap', icon: 'list', permission: 'sell' },
    ],
  },
];

const TITLE_EXTRA: Record<string, TranslationKey> = { labels: 'label.title' };

export const ROLE_LABEL: Record<Role, TranslationKey> = {
  owner: 'user.roleOwner',
  manager: 'user.roleManager',
  cashier: 'user.roleCashier',
};

function isActive(itemPath: string, routePath: string): boolean {
  return itemPath === '/' ? routePath === '/' : routePath.startsWith(itemPath);
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const route = useRoute();
  const { settings, user, updateReady, demoScenario, switchDemoScenario, resetDemo, exitDemo } = useApp();
  const demo = isDemoMode();
  const wipBanner = featureStatusForPath('/' + (route.segments[0] ?? '')) === 'wip';
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const setSidebar = useUI((s) => s.setSidebar);

  const lowStockCount = useLiveQuery(
    async () =>
      (await db.products.toArray()).filter(
        (p) => p.active && p.trackStock && !p.isService && p.minStock > 0 && p.stock <= p.minStock,
      ).length,
    [],
    0,
  );
  const openOrderCount = useLiveQuery(async () => db.orders.where('status').equals('open').count(), [], 0);

  useEffect(() => {
    setSidebar(false);
  }, [route.path, setSidebar]);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => can(user, i.permission) && (!i.onlyFor || i.onlyFor.includes(settings.businessType)),
        ),
      })).filter((g) => g.items.length),
    [user, settings.businessType],
  );

  const flat = groups.flatMap((g) => g.items);
  const current = flat.find((i) => isActive(i.path, route.path));
  const extra = TITLE_EXTRA[route.segments[0] ?? ''];
  const title = extra ? t(extra) : current ? t(current.labelKey) : '';

  const badgeFor = (item: NavEntry) =>
    item.badge === 'lowStock' ? lowStockCount : item.badge === 'openOrders' ? openOrderCount : 0;

  /* スマートフォン向けには利用頻度の高い4画面へ届く下部ナビゲーションを表示する。 */
  const bottom = [
    flat.find((i) => i.path === '/'),
    flat.find((i) => i.path === '/pos'),
    flat.find((i) => i.path === (settings.businessType === 'retail' ? '/products' : '/tables')) ??
      flat.find((i) => i.path === '/shifts'),
    flat.find((i) => i.path === '/orders'),
  ].filter(Boolean) as NavEntry[];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {settings.logo ? (
            <img className="sidebar-logo-img" src={settings.logo} alt="" />
          ) : (
            <Logo size={36} />
          )}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="sidebar-shop truncate">{settings.shopName || t('app.name')}</div>
            <div className="sidebar-sub truncate">Urito POS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div key={group.groupKey} className="nav-section">
              <div className="nav-group">{t(group.groupKey)}</div>
              {group.items.map((item) => {
                const badge = badgeFor(item);
                const fStatus = featureStatusForPath(item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`nav-item ${isActive(item.path, route.path) ? 'active' : ''}`}
                    onClick={() => {
                      navigate(item.path);
                      setSidebar(false);
                    }}
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="grow truncate">{t(item.labelKey)}</span>
                    {fStatus && (
                      <span
                        className={`badge ${fStatus === 'beta' ? 'badge-info' : 'badge-warn'}`}
                        style={{ fontSize: 10, padding: '1px 5px' }}
                      >
                        {t(fStatus === 'beta' ? 'roadmap.statusBeta' : 'roadmap.statusWip')}
                      </span>
                    )}
                    {badge > 0 && <span className="nav-badge">{badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <UserMenu placement="up" />
        </div>
      </aside>

      <div className="main-area">
        {demo && (
          <div
            className="row wrap gap-8 between"
            style={{
              padding: '6px 12px',
              background: 'var(--c-warn-soft)',
              color: 'var(--c-warn)',
              borderBottom: '1px solid var(--c-border)',
              fontSize: 12.5,
            }}
          >
            <span className="row gap-6" style={{ alignItems: 'center', fontWeight: 600 }}>
              <Icon name="info" size={14} />
              {t('demo.banner')}
            </span>
            <span className="row wrap gap-6" style={{ alignItems: 'center' }}>
              <Select
                value={demoScenario ?? 'ja-retail'}
                aria-label={t('demo.banner')}
                onChange={(e) => void switchDemoScenario(e.target.value as DemoScenario)}
                style={{ height: 28, padding: '2px 24px 2px 8px', fontSize: 12, width: 'auto' }}
              >
                <option value="ja-retail">{t('demo.retail')}</option>
                <option value="ja-cafe">{t('demo.cafe')}</option>
                <option value="ja-restaurant">{t('demo.restaurant')}</option>
              </Select>
              <Button size="sm" onClick={() => void resetDemo().then(() => toast.success(t('demo.resetDone')))}>
                {t('demo.reset')}
              </Button>
              <Button size="sm" variant="ghost" onClick={exitDemo}>
                {t('demo.exit')}
              </Button>
            </span>
          </div>
        )}
        <header className="topbar">
          <button
            type="button"
            className="icon-btn mobile-only"
            onClick={() => setSidebar(!sidebarOpen)}
            aria-label={t('common.menu')}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-title truncate">{title}</div>
          <span className="grow" />
          {updateReady && (
            <Button
              size="sm"
              variant="soft"
              icon="refresh"
              aria-label={t('pwa.updateAvailable')}
              title={t('pwa.updateAvailable')}
              onClick={() => {
                void (async () => {
                  if (!useCart.getState().isEmpty()) {
                    const ok = await confirmDialog({
                      title: t('pwa.reloadConfirmTitle'),
                      message: t('pwa.reloadConfirmMessage'),
                      confirmLabel: t('pwa.reload'),
                      cancelLabel: t('common.cancel'),
                    });
                    if (!ok) return;
                  }
                  if (!applyServiceWorkerUpdate()) window.location.reload();
                })();
              }}
            >
              <span className="hide-sm">{t('pwa.updateAvailable')}</span>
            </Button>
          )}
          <OnlineDot />
          {route.segments[0] !== 'pos' && (
            <Button
              size="sm"
              variant="primary"
              icon="pos"
              aria-label={t('nav.pos')}
              onClick={() => navigate('/pos')}
              className="hide-sm"
            >
              {t('nav.pos')}
            </Button>
          )}
          <div className="mobile-only">
            <UserMenu placement="down" compact />
          </div>
        </header>
        {wipBanner && (
          <div className="callout callout-warn" style={{ margin: '10px 16px 0' }}>
            {t('roadmap.wipBanner')}
          </div>
        )}
        {children}

        <nav className="bottom-nav">
          {bottom.map((item) => {
            const badge = badgeFor(item);
            return (
              <button
                key={item.path}
                type="button"
                className={`bottom-item ${isActive(item.path, route.path) ? 'active' : ''}`}
                onClick={() => {
                      navigate(item.path);
                      setSidebar(false);
                    }}
              >
                <span className="bottom-icon">
                  <Icon name={item.icon} size={21} />
                  {badge > 0 && <span className="bottom-badge">{badge}</span>}
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
          <button type="button" className="bottom-item" onClick={() => setSidebar(true)}>
            <span className="bottom-icon">
              <Icon name="menu" size={21} />
            </span>
            <span>{t('common.more')}</span>
          </button>
        </nav>
      </div>

      {sidebarOpen && <div className="scrim" role="presentation" onClick={() => setSidebar(false)} />}
    </div>
  );
}

function OnlineDot() {
  const t = useT();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <span className="badge badge-warn" title={t('pwa.offline')}>
      <span className="color-dot" style={{ background: 'var(--c-warn)' }} />
      Offline
    </span>
  );
}

/* --------------------------------------------------------------- user menu */

function UserMenu({ placement, compact }: { placement: 'up' | 'down'; compact?: boolean }) {
  const t = useT();
  const { settings, user, shift, users, updateSettings, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const [askShift, setAskShift] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;
  const ownShift = shift && shift.userId === user.id;

  const switchUser = () => {
    setOpen(false);
    if (ownShift) setAskShift(true);
    else void signOut();
  };

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className={`user-chip ${compact ? 'compact' : ''}`} onClick={() => setOpen(!open)}>
        <span className="avatar" style={{ background: user.color }}>
          {user.name.trim().slice(0, 1).toUpperCase()}
        </span>
        {!compact && (
          <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="user-chip-name truncate">{user.name}</span>
            <span className="user-chip-role truncate">
              {t(ROLE_LABEL[user.role])}
              {' · '}
              {shift ? t('shift.current') : t('shift.noShift')}
            </span>
          </span>
        )}
        {!compact && <Icon name="chevronDown" size={15} />}
      </button>

      {open && (
        <div className={`menu-pop ${placement === 'up' ? 'up' : 'down'}`}>
          <div className="menu-head">
            <div className="strong">{user.name}</div>
            <div className="tiny dim">{t(ROLE_LABEL[user.role])}</div>
          </div>
          {users.length > 1 && (
            <button type="button" className="menu-item" onClick={switchUser}>
              <Icon name="users" size={16} /> {t('user.switch')}
            </button>
          )}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate(shift ? '/shifts?handover=1' : '/shifts');
            }}
          >
            <Icon name="clock" size={16} /> {shift ? t('shift.handover') : t('shift.open')}
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onClick={() => void updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
            {settings.theme === 'dark' ? t('set.themeLight') : t('set.themeDark')}
          </button>
          <div className="menu-langs">
            {(['vi', 'ja', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`chip ${settings.lang === l ? 'active' : ''}`}
                onClick={() => void updateSettings({ lang: l })}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {users.length > 1 && (
            <>
              <div className="menu-sep" />
              <button type="button" className="menu-item text-danger" onClick={switchUser}>
                <Icon name="logout" size={16} /> {t('nav.logout')}
              </button>
            </>
          )}
        </div>
      )}

      <Modal
        open={askShift}
        onClose={() => setAskShift(false)}
        size="sm"
        title={t('user.switch')}
        footer={
          <>
            <Button
              onClick={() => {
                setAskShift(false);
                void signOut();
              }}
            >
              {t('shift.keepOpen')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAskShift(false);
                navigate('/shifts?handover=1');
              }}
            >
              {t('shift.handover')}
            </Button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          {t('shift.signOutOpen')}
        </p>
      </Modal>
    </div>
  );
}
