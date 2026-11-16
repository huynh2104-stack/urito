import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { arrangeProducts, loadView, saveView, type PosView } from './viewOptions';
import type { ModifierGroup, Product } from '@/db/types';

export function PosPage() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const shift = useApp((s) => s.shift);
  const cart = useCart();
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

  // An emptied cart (sale finished, cleared) has nothing to show: back to the products.
  useEffect(() => {
    if (cart.items.length === 0) setCartOpen(false);
  }, [cart.items.length]);
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
  const cartQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of cart.items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.qty);
    return m;
  }, [cart.items]);
  const stockAlert = useUI((s) => s.stockAlert);
  const heldCount = useLiveQuery(async () => db.orders.where('status').equals('open').count(), [], 0);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    [products],
  );

  const modsById = useMemo(() => new Map(modifierGroups.map((g) => [g.id, g])), [modifierGroups]);

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
    if (cart.items.length === 0 && !cart.orderId) {
      useCart.getState().setType(settings.businessType === 'retail' ? 'retail' : 'dine_in');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.businessType]);

  const groupsFor = useCallback(
    (product: Product): ModifierGroup[] =>
      product.modifierGroupIds.map((id) => modsById.get(id)).filter(Boolean) as ModifierGroup[],
    [modsById],
  );

  const pick = useCallback(
    (product: Product, qty = 1, source?: HTMLElement | null) => {
      if (product.trackStock && !product.isService && !settings.negativeStock) {
        const inCart = cart.items
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
    [cart.items, groupsFor, settings.negativeStock, t, reserved],
  );

  /** Resolve a scanned or typed code. "3*8934..." adds three at once - the
   *  shorthand grocery cashiers use when a customer buys a whole case. */
  const addByCode = (raw: string): boolean => {
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
    const qty = match ? Number(match[1].replace(',', '.')) : 1;
    const term = (match ? match[2] : raw).trim();
    if (!term) return false;
    const exact = activeProducts.find(
      (p) => (p.barcode && p.barcode === term) || (p.sku && p.sku.toLowerCase() === term.toLowerCase()),
    );
    const matches = filterProducts(activeProducts, term);
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
    if (!cart.items.length) return;
    await holdOrder(cart, { user, settings, shiftId: shift?.id ?? null });
    useCart.getState().clear();
    toast.success(t('pos.hold'));
  };

  const doClear = async () => {
    if (!cart.items.length) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items.length, user, settings, shift]);

  const visible = useMemo(() => {
    let list = arrangeProducts(activeProducts, view, sold);
    if (categoryId === 'fav') list = list.filter((p) => p.favorite);
    else if (categoryId !== 'all') list = list.filter((p) => p.categoryId === categoryId);
    const term = search.replace(/^\s*\d+(?:[.,]\d+)?\s*[*xX]\s*/, '');
    return term.trim() ? filterProducts(list, term) : list;
  }, [activeProducts, categoryId, search, view, sold]);

  return (
    <div className="pos">
      {stockAlert && (
        <div className="stock-alert" role="alert" onClick={() => useUI.setState({ stockAlert: null })}>
          <Icon name="alert" size={20} />
          <span className="grow">{stockAlert}</span>
          <Icon name="x" size={16} />
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
        onPick={(p, el) => pick(p, 1, el)}
        view={view}
        onView={changeView}
        searchRef={searchRef}
        heldCount={heldCount}
        onOpenHeld={() => setShowHeld(true)}
        onScan={() => setScanning(true)}
        onCustomItem={() => setCustomOpen(true)}
        cartCount={totals.unitCount}
        cartQty={cartQty}
        reserved={reserved}
        cartTotal={totals.total}
        onOpenCart={() => setCartOpen(true)}
      />

      <CartPanel
        open={cartOpen}
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

export function filterProducts(products: Product[], term: string): Product[] {
  const q = term.trim().toLowerCase();
  if (!q) return products;
  const normalised = removeTones(q);
  return products.filter((p) => {
    const name = p.name.toLowerCase();
    return (
      name.includes(q) ||
      removeTones(name).includes(normalised) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q)
    );
  });
}

/** Lets a cashier type "ca phe" and still find "Cà phê" - typing tones on a
 *  busy counter is slow, and this is how Vietnamese users expect search to work. */
export function removeTones(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
