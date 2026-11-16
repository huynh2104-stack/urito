import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { useApp, useT } from '@/store/app';
import { useCart, useCartTotals } from '@/store/cart';
import { toast, confirmDialog, useUI } from '@/store/ui';
import { useReserved } from '@/lib/useReserved';
import { holdOrder } from '@/services/orders';
import { navigate, useRoute } from '@/router';
import { ProductGrid } from './ProductGrid';
import { CartPanel } from './CartPanel';
import { ModifierModal } from './ModifierModal';
import { PaymentModal } from './PaymentModal';
import { CustomerPickerModal } from './CustomerPicker';
import { HeldOrdersModal } from './HeldOrders';
import { LineEditorModal } from './LineEditor';
import { DiscountModal } from './DiscountModal';
import { TablePickerModal } from './TablePicker';
import { CameraScanner } from '@/components/CameraScanner';
import { CustomItemModal } from './CustomItemModal';
import { Icon } from '@/components/Icon';
import { flyToCart } from '@/lib/fly';
import { DAY } from '@/core/date';
import { buildProductSearchIndex, compareProductNames, matchesProduct, normaliseCode, normaliseText, searchIndexedProducts } from '@/core/search';
import { arrangeProducts, loadView, saveView, type PosView } from './viewOptions';
import type { ModifierGroup, Product } from '@/db/types';

export function PosPage() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const shift = useApp((s) => s.shift);
  const cartHasItems = useCart((s) => s.items.length > 0);
  const cartHasOrder = useCart((s) => Boolean(s.orderId));
  const totals = useCartTotals();
  const route = useRoute();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // カートが空になったらモバイルのドロワーは閉じた扱いにする。
  const showMobileCart = cartOpen && cartHasItems;
  const [view, setView] = useState<PosView>(loadView);
  const changeView = (v: PosView) => {
    setView(v);
    saveView(v);
  };

  const products = useLiveQuery(async () => db.products.toArray(), [], []);
  const categories = useLiveQuery(async () => db.categories.toArray(), [], []);
  const modifierGroups = useLiveQuery(async () => db.modifierGroups.toArray(), [], []);
  /* Units sold per product over the last 30 days - only read when sorting by it. */
  const sold = useLiveQuery(
    async () => {
      if (view.sort !== 'sold') return new Map<string, number>();
      const since = Date.now() - 30 * DAY;
      const map = new Map<string, number>();
      await db.orders
        .where('createdAt')
        .aboveOrEqual(since)
        .each((o) => {
          if (o.status === 'void') return;
          for (const i of o.items) map.set(i.productId, (map.get(i.productId) ?? 0) + i.qty);
        });
      return map;
    },
    [view.sort],
    new Map<string, number>(),
  );
  const reserved = useReserved();
  const stockAlert = useUI((s) => s.stockAlert);
  const heldCount = useLiveQuery(async () => db.orders.where('status').equals('open').count(), [], 0);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active).sort((a, b) => a.sort - b.sort || compareProductNames(a, b, settings.lang)),
    [products, settings.lang],
  );

  const modsById = useMemo(() => new Map(modifierGroups.map((g) => [g.id, g])), [modifierGroups]);

  const searchIndex = useMemo(() => buildProductSearchIndex(activeProducts), [activeProducts]);
  const deferredSearch = useDeferredValue(search);

  /* Resume a table order or a held ticket passed in the URL. */
  const resumeId = route.query.get('order');
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    void (async () => {
      const order = await db.orders.get(resumeId);
      if (!cancelled && order && order.status === 'open') useCart.getState().loadOrder(order);
      navigate('/pos', true);
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  useEffect(() => {
    if (!cartHasItems && !cartHasOrder) {
      useCart.getState().setType(settings.businessType === 'retail' ? 'retail' : 'dine_in');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 業態切り替え時のみ既定の注文種別を合わせる
  }, [settings.businessType]);

  const groupsFor = useCallback(
    (product: Product): ModifierGroup[] =>
      product.modifierGroupIds.map((id) => modsById.get(id)).filter(Boolean) as ModifierGroup[],
    [modsById],
  );

  const pick = useCallback(
    (product: Product, qty = 1, source?: HTMLElement | null) => {
      if (product.trackStock && !product.isService && !settings.negativeStock) {
        const inCart = useCart.getState().items
          .filter((i) => i.productId === product.id)
          .reduce((s, i) => s + i.qty, 0);

        const held = reserved.get(product.id) ?? 0;
        if (product.stock - held - inCart - qty < 0) {
          useUI.getState().showStockAlert(
            t('pos.stockBlocked', { name: product.name, n: Math.max(0, product.stock - held - inCart) }) +
              (held > 0 ? ' ' + t('pos.stockHeld', { n: held }) : ''),
          );
          return;
        }
      }
      const groups = groupsFor(product);
      if (groups.length) setPendingProduct(product);
      else {
        useCart.getState().addProduct(product, { qty });
        flyToCart(source ?? null, product.id);
      }
    },
    [groupsFor, settings.negativeStock, t, reserved],
  );

  const handleTilePick = useCallback(
    (product: Product, source?: HTMLElement | null) => {
      pick(product, 1, source);
    },
    [pick],
  );

  /** Resolve a scanned or typed code. "3*8934..." adds three at once - the
   *  shorthand grocery cashiers use when a customer buys a whole case. */
  const addByCode = (raw: string): boolean => {
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
    const qty = match ? Number(match[1].replace(',', '.')) : 1;
    const term = (match ? match[2] : raw).trim();
    if (!term) return false;
    const normTerm = normaliseCode(term);
    const exact = searchIndex.byBarcode.get(normTerm) ?? searchIndex.bySku.get(normTerm);
    const matches = exact ? [exact] : searchIndexedProducts(searchIndex, term);
    const target = exact ?? (matches.length === 1 ? matches[0] : null);
    if (target) {
      pick(target, qty > 0 ? qty : 1);
      toast.success(t('pos.scanned', { name: qty > 1 ? `${qty} × ${target.name}` : target.name }));
      return true;
    }
    if (!matches.length) toast.error(t('pos.notFound', { code: term }));
    return false;
  };

  /* Barcode scanners type into the search box and press Enter. */
  const submitSearch = () => {
    if (addByCode(search)) setSearch('');
  };

  const doHold = async () => {
    const cartState = useCart.getState();
    if (!cartState.items.length) return;
    await holdOrder(cartState, { user, settings, shiftId: shift?.id ?? null });
    useCart.getState().clear();
    toast.success(t('pos.hold'));
  };

  const doClear = async () => {
    if (!useCart.getState().items.length) return;
    const ok = await confirmDialog({
      title: t('pos.clearCart'),
      message: t('pos.clearCartConfirm'),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (ok) useCart.getState().clear();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (useCart.getState().items.length) setShowPayment(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        void doHold();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- F2/F4/F9ショートカット内で最新のハンドラ・状態を参照する
  }, [user, settings, shift]);

  const visible = useMemo(() => {
    const term = deferredSearch.replace(/^\s*\d+(?:[.,]\d+)?\s*[*xX]\s*/, '').trim();
    const base = term ? searchIndexedProducts(searchIndex, term) : activeProducts;
    let list = arrangeProducts(base, view, sold, settings.lang);
    if (categoryId === 'fav') list = list.filter((p) => p.favorite);
    else if (categoryId !== 'all') list = list.filter((p) => p.categoryId === categoryId);
    return list;
  }, [activeProducts, searchIndex, deferredSearch, categoryId, view, sold, settings.lang]);

  return (
    <div className="pos">
      {stockAlert && (
        <div className="stock-alert" role="alert">
          <Icon name="alert" size={20} />
          <span className="grow">{stockAlert}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => useUI.setState({ stockAlert: null })}
            aria-label={t('common.close')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      <ProductGrid
        products={visible}
        categories={categories}
        categoryId={categoryId}
        onCategory={setCategoryId}
        search={search}
        onSearch={setSearch}
        onSubmitSearch={submitSearch}
        onPick={handleTilePick}
        view={view}
        onView={changeView}
        searchRef={searchRef}
        heldCount={heldCount}
        onOpenHeld={() => setShowHeld(true)}
        onScan={() => setScanning(true)}
        onCustomItem={() => setCustomOpen(true)}
        cartCount={totals.unitCount}
        reserved={reserved}
        cartTotal={totals.total}
        onOpenCart={() => setCartOpen(true)}
      />

      <CartPanel
        open={showMobileCart}
        onClose={() => setCartOpen(false)}
        totals={totals}
        onEditLine={setEditingLine}
        onPay={() => setShowPayment(true)}
        onHold={() => void doHold()}
        onClear={() => void doClear()}
        onPickCustomer={() => setShowCustomer(true)}
        onDiscount={() => setShowDiscount(true)}
        onPickTable={() => setShowTables(true)}
        products={products}
      />

      {pendingProduct && (
        <ModifierModal
          product={pendingProduct}
          groups={groupsFor(pendingProduct)}
          onClose={() => setPendingProduct(null)}
          onConfirm={(modifiers, qty, note) => {
            useCart.getState().addProduct(pendingProduct, { modifiers, qty, note });
            setPendingProduct(null);
          }}
        />
      )}

      {editingLine && (
        <LineEditorModal
          lineId={editingLine}
          modifierGroups={modifierGroups}
          onClose={() => setEditingLine(null)}
        />
      )}

      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onDetect={(code) => {
            if (addByCode(code)) setScanning(false);
          }}
        />
      )}
      {customOpen && <CustomItemModal onClose={() => setCustomOpen(false)} />}
      {showCustomer && <CustomerPickerModal onClose={() => setShowCustomer(false)} />}
      {showHeld && <HeldOrdersModal onClose={() => setShowHeld(false)} />}
      {showDiscount && <DiscountModal onClose={() => setShowDiscount(false)} />}
      {showTables && <TablePickerModal onClose={() => setShowTables(false)} />}
    </div>
  );
}

/** D-05: NFKC・かな統合・ベトナム語声調除去を含む商品検索を行う。 */
export function filterProducts(products: Product[], term: string): Product[] {
  return products.filter((p) => matchesProduct(p, term));
}

/** D-05: テキスト検索用正規化関数の互換エイリアス。 */
export const removeTones = normaliseText;
