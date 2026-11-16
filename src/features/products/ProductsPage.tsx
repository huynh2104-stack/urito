import { useMemo, useState } from 'react';
import { Button, EmptyState, SearchInput, Select, Tabs } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ProductThumb } from '@/components/ProductThumb';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { formatQty } from '@/core/money';
import { useApp, useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { downloadCsv, timestampedName } from '@/services/csv';
import { ensureRollupsBuilt } from '@/services/rollups';
import { exportShopifyCsv } from '@/services/exchange/shopify';
import { exportUritoCsv } from '@/services/exchange/urito';
import { compareProductNames, matchesProduct } from '@/core/search';
import { ProductForm } from './ProductForm';
import { CategoryManager } from './CategoryManager';
import { ModifierManager } from './ModifierManager';
import { ImportProductsModal } from './ImportProducts';
import { navigate } from '@/router';
import type { Product } from '@/db/types';

type TabKey = 'products' | 'categories' | 'modifiers';

export function ProductsPage() {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);

  const [tab, setTab] = useState<TabKey>('products');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const products = useLiveQuery(async () => db.products.toArray(), [], []);
  const categories = useLiveQuery(async () => (await db.categories.toArray()).sort((a, b) => a.sort - b.sort), [], []);
  const modifierGroups = useLiveQuery(async () => db.modifierGroups.toArray(), [], []);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const visible = useMemo(() => {
    let list = [...products].sort((a, b) => a.sort - b.sort || compareProductNames(a, b, settings.lang));
    if (categoryId !== 'all') list = list.filter((p) => p.categoryId === categoryId);
    if (search.trim()) {
      list = list.filter((p) => matchesProduct(p, search));
    }
    return list;
  }, [products, categoryId, search, settings.lang]);

  const remove = async (product: Product) => {
    await ensureRollupsBuilt();
    const [statUsed, openOrders] = await Promise.all([
      db.dailyProductStats.where('productId').equals(product.id).count(),
      db.orders.where('status').equals('open').toArray(),
    ]);
    const used = statUsed > 0 || openOrders.some((o) => o.items.some((i) => i.productId === product.id));
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: product.name }),
      message: used ? t('products.deleteWithOrders') : t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    if (used) await db.products.update(product.id, { active: false, updatedAt: Date.now() });
    else await db.products.delete(product.id);
    toast.success(t('common.deleted'));
  };

  const exportCsv = () => {
    const headers = [
      t('common.name'),
      t('common.price'),
      t('common.cost'),
      t('common.category'),
      t('products.sku'),
      t('products.barcode'),
      t('inv.currentStock'),
      t('common.unit'),
      t('products.minStock'),
    ];
    downloadCsv(
      timestampedName('urito-products'),
      exportUritoCsv(visible, { currency: settings.currency, categoryNames: catName }, headers),
    );
  };

  const exportShopify = () => {
    downloadCsv(
      timestampedName('shopify-products'),
      exportShopifyCsv(visible, {
        currency: settings.currency,
        categoryNames: catName,
        shopName: settings.shopName,
      }),
    );
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('products.title')}</div>
          <div className="page-sub">
            {products.filter((p) => p.active).length} {t('common.items')}
          </div>
        </div>
        <div className="row gap-8">
          <Button icon="barcode" aria-label={t('label.title')} onClick={() => navigate('/labels')}>
            <span className="hide-sm">{t('label.title')}</span>
          </Button>
          <Button icon="upload" aria-label={t('products.importCsv')} onClick={() => setImporting(true)}>
            <span className="hide-sm">{t('products.importCsv')}</span>
          </Button>
          <Button icon="download" aria-label={t('common.export')} onClick={exportCsv}>
            <span className="hide-sm">{t('common.export')}</span>
          </Button>
          <Button icon="download" aria-label={t('products.exportShopify')} onClick={exportShopify}>
            <span className="hide-sm">{t('products.exportShopify')}</span>
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('products.new')}
          </Button>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'products' as const, label: t('products.title'), badge: products.length },
          { key: 'categories' as const, label: t('products.categories'), badge: categories.length },
          { key: 'modifiers' as const, label: t('products.modifierGroups'), badge: modifierGroups.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'products' && (
        <>
          <div className="card card-pad mt-16 mb-16">
            <div className="row gap-8 wrap">
              <SearchInput value={search} onChange={setSearch} placeholder={t('common.searchPlaceholder')} />
              <Select
                aria-label={t('common.category')}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: 200 }}
              >
                <option value="all">{t('common.all')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="card">
            {visible.length === 0 ? (
              <EmptyState
                icon="box"
                title={t('products.noProducts')}
                action={
                  <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                    {t('products.addFirst')}
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>{t('common.name')}</th>
                      <th>{t('common.category')}</th>
                      <th className="right">{t('common.price')}</th>
                      <th className="right">{t('common.cost')}</th>
                      <th className="right">{t('products.margin')}</th>
                      <th className="right">{t('inv.currentStock')}</th>
                      <th className="right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
                      const low = p.trackStock && !p.isService && p.minStock > 0 && p.stock <= p.minStock;
                      return (
                        <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                          <td style={{ width: 48 }}>
                            <ProductThumb productId={p.id} imageRev={p.imageRev} name={p.name} color={p.color} image={p.image} size={36} />
                          </td>
                          <td>
                            <div className="row gap-4">
                              
                              <span className="strong">{p.name}</span>
                              {!p.active && <span className="badge">{t('common.inactive')}</span>}
                            </div>
                            {(p.sku || p.barcode) && (
                              <div className="tiny dim">
                                {p.sku}
                                {p.barcode ? ` · ${p.barcode}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="dim">{catName.get(p.categoryId) ?? t('products.noCategory')}</td>
                          <td className="right num strong">{money(p.price)}</td>
                          <td className="right num dim">{money(p.cost)}</td>
                          <td className="right num">{margin.toFixed(0)}%</td>
                          <td className="right num">
                            {p.isService || !p.trackStock ? (
                              <span className="dim">—</span>
                            ) : (
                              <span className={low ? 'text-danger strong' : ''}>
                                {formatQty(p.stock, settings.lang)}
                              </span>
                            )}
                          </td>
                          <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`pin-btn ${p.favorite ? 'on' : ''}`}
                              aria-pressed={p.favorite}
                              title={p.favorite ? t('products.unpin') : t('products.favorite')}
                              aria-label={p.favorite ? t('products.unpin') : t('products.favorite')}
                              onClick={() =>
                                void db.products.update(p.id, { favorite: !p.favorite, updatedAt: Date.now() })
                              }
                            >
                              <Icon name="star" size={16} />
                            </button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="trash"
                              onClick={() => void remove(p)}
                              aria-label={t('common.delete')}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'categories' && <CategoryManager categories={categories} />}
      {tab === 'modifiers' && <ModifierManager groups={modifierGroups} />}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories}
          modifierGroups={modifierGroups}
          onClose={() => setEditing(null)}
        />
      )}

      {importing && <ImportProductsModal categories={categories} onClose={() => setImporting(false)} />}
    </div>
  );
}
