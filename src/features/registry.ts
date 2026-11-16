import type { TranslationKey } from '@/i18n';

export type FeatureStatus = 'stable' | 'beta' | 'wip' | 'planned';

export interface FeatureEntry {
  id: string;
  path?: string;
  status: FeatureStatus;
  since: string;
  titleKey: TranslationKey;
  descKey?: TranslationKey;
}

/** E-01: ナビゲーションバッジ・開発状況ページ・ドキュメント生成で共通参照する単一の機能台帳。 */
export const FEATURES: readonly FeatureEntry[] = [
  { id: 'pos', path: '/pos', status: 'stable', since: '0.1', titleKey: 'nav.pos' },
  { id: 'orders', path: '/orders', status: 'stable', since: '0.1', titleKey: 'nav.orders' },
  { id: 'products', path: '/products', status: 'stable', since: '0.1', titleKey: 'nav.products' },
  { id: 'inventory', path: '/inventory', status: 'stable', since: '0.2', titleKey: 'nav.inventory' },
  { id: 'purchases', path: '/purchases', status: 'stable', since: '0.2', titleKey: 'nav.purchases' },
  { id: 'customers', path: '/customers', status: 'stable', since: '0.2', titleKey: 'nav.customers' },
  { id: 'shifts', path: '/shifts', status: 'stable', since: '0.2', titleKey: 'nav.shifts' },
  { id: 'expenses', path: '/expenses', status: 'stable', since: '0.3', titleKey: 'nav.expenses' },
  { id: 'reports', path: '/reports', status: 'stable', since: '0.3', titleKey: 'nav.reports' },
  { id: 'users', path: '/users', status: 'stable', since: '0.3', titleKey: 'nav.users' },
  { id: 'backup', path: '/backup', status: 'stable', since: '0.4', titleKey: 'nav.backup' },
  { id: 'labels', path: '/labels', status: 'stable', since: '0.4', titleKey: 'label.title' },
  {
    id: 'tax-invoice',
    path: '/settings',
    status: 'stable',
    since: '0.6',
    titleKey: 'feat.taxInvoice',
    descKey: 'feat.taxInvoiceDesc',
  },
  {
    id: 'tables',
    path: '/tables',
    status: 'beta',
    since: '0.3',
    titleKey: 'nav.tables',
  },
  {
    id: 'camera-scan',
    status: 'beta',
    since: '0.4',
    titleKey: 'feat.cameraScan',
    descKey: 'feat.cameraScanDesc',
  },
  {
    id: 'delivery',
    status: 'wip',
    since: '0.5',
    titleKey: 'feat.delivery',
    descKey: 'feat.deliveryDesc',
  },
  {
    id: 'receipt-qr',
    status: 'wip',
    since: '0.5',
    titleKey: 'feat.receiptQr',
    descKey: 'feat.receiptQrDesc',
  },
  {
    id: 'shopify-csv',
    path: '/products',
    status: 'stable',
    since: '0.6',
    titleKey: 'feat.shopifyCsv',
    descKey: 'feat.shopifyCsvDesc',
  },
  {
    id: 'multilang-catalog',
    path: '/products',
    status: 'stable',
    since: '0.6',
    titleKey: 'feat.multilangCatalog',
    descKey: 'feat.multilangCatalogDesc',
  },
  {
    id: 'ec-orders',
    path: '/orders',
    status: 'stable',
    since: '0.6',
    titleKey: 'feat.ecOrders',
    descKey: 'feat.ecOrdersDesc',
  },
  {
    id: 'other-ec-csv',
    status: 'planned',
    since: '0.7',
    titleKey: 'feat.otherEcCsv',
    descKey: 'feat.otherEcCsvDesc',
  },
  {
    id: 'romaji-search',
    status: 'planned',
    since: '0.7',
    titleKey: 'feat.romajiSearch',
    descKey: 'feat.romajiSearchDesc',
  },
];

/** 指定されたナビゲーションパスに対応する機能ステータス（stable 以外の注記用）を返す。 */
export function featureStatusForPath(path: string): FeatureStatus | null {
  const hit = FEATURES.find((f) => f.path === path && f.status !== 'stable');
  return hit?.status ?? null;
}
