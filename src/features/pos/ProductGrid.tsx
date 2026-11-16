import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { Button, EmptyState, SearchInput } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { monogram, tint } from '@/components/ProductThumb';
import { useThumb } from '@/lib/thumbCache';
import { ViewMenu } from './ViewMenu';
import type { PosView } from './viewOptions';
import { useMoney, useT } from '@/store/app';
import { formatQty } from '@/core/money';
import { useApp } from '@/store/app';
import { useCart } from '@/store/cart';
import type { Category, Product } from '@/db/types';

export function ProductGrid({
  products,
  categories,
  categoryId,
  onCategory,
  search,
  onSearch,
  onSubmitSearch,
  onPick,
  searchRef,
  heldCount,
  onOpenHeld,
  onScan,
  onCustomItem,
  cartCount,
  cartTotal,
  onOpenCart,
  view,
  onView,
  reserved,
}: {
  products: Product[];
  categories: Category[];
  categoryId: string;
  onCategory: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  onSubmitSearch: () => void;
  onPick: (p: Product, source?: HTMLElement | null) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  heldCount: number;
  onOpenHeld: () => void;
  onScan: () => void;
  onCustomItem: () => void;
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  view: PosView;
  onView: (v: PosView) => void;
  /** Units of each product in the current cart, and held by parked tickets. */
  reserved: Map<string, number>;
}) {
  const t = useT();
  const money = useMoney();
  const sorted = [...categories].filter((c) => c.active).sort((a, b) => a.sort - b.sort);
  // Photos only earn their space when the shop has taken some; until then each
  // product is a price tag, which is what a cashier actually scans for.
  const withImages = products.some((p) => (p.imageRev ?? 0) > 0 || Boolean(p.image));
  const lang = useApp((st) => st.settings.lang);

  // A shop can have hundreds of products with photos. Draw them in pages as the
  // cashier scrolls: far fewer DOM nodes and image downloads on a weak phone.
  const PAGE = 48;
  const filterKey = `${categoryId}|${search}|${view.sort}|${String(view.inStockOnly)}`;
  const [paging, setPaging] = useState({ key: filterKey, count: PAGE });
  const shown = paging.key === filterKey ? paging.count : PAGE;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= products.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.some((e) => e.isIntersecting) &&
        setPaging((prev) => ({
          key: filterKey,
          count: (prev.key === filterKey ? prev.count : PAGE) + PAGE,
        })),
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, products.length, filterKey]);

  return (
    <div className="pos-left">
      <div className="pos-toolbar">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder={t('pos.searchProduct')}
          inputRef={searchRef}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmitSearch();
          }}
        />
        <Button icon="scan" onClick={onScan} title={t('scan.title')} className="scan-btn" />
        <ViewMenu view={view} onChange={onView} />
        <Button icon="edit3" onClick={onCustomItem} title={t('pos.customItem')}>
          <span className="hide-md show-phone">{t('pos.customItemShort')}</span>
        </Button>
        <Button icon="clock" onClick={onOpenHeld} title={t('pos.heldOrders')} className="held-btn">
          <span className="held-label">{t('pos.heldOrders')}</span>
          {heldCount > 0 ? <span className="held-count">{heldCount}</span> : null}
        </Button>
      </div>

      <div className="pos-cats">
        <button
          type="button"
          className={`chip ${categoryId === 'all' ? 'active' : ''}`}
          onClick={() => onCategory('all')}
        >
          {t('pos.allProducts')}
        </button>
        <button
          type="button"
          className={`chip ${categoryId === 'fav' ? 'active' : ''}`}
          onClick={() => onCategory('fav')}
        >
          ★ {t('pos.favorites')}
        </button>
        {sorted.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${categoryId === c.id ? 'active' : ''}`}
            onClick={() => onCategory(c.id)}
          >
            <span className="color-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="grow">
          <EmptyState icon="box" title={t('common.noResults')} />
        </div>
      ) : (
        <div className={`pos-products size-${view.size} ${withImages ? '' : 'tags'}`}>
          {products.slice(0, shown).map((p) => (
            <ProductTile
              key={p.id}
              product={p}
              onPick={onPick}
              priceText={money(p.price)}
              withImage={withImages}
              held={reserved.get(p.id) ?? 0}
            />
          ))}
          {shown < products.length && <div ref={sentinel} className="grid-sentinel" aria-hidden="true" />}
        </div>
      )}

      <button type="button" className="pos-cart-fab" onClick={onOpenCart}>
        <span className="fab-count">{formatQty(cartCount, lang)}</span>
        <span className="grow">{t('pos.cart')}</span>
        <span className="num strong">{money(cartTotal)}</span>
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}

/* Memoised: a shop with hundreds of products should not re-render every tile
 * each time the cart changes. */
const ProductTile = memo(function ProductTile({
  product: p,
  onPick,
  priceText,
  withImage,
  held,
}: {
  product: Product;
  onPick: (p: Product, source?: HTMLElement | null) => void;
  priceText: string;
  withImage: boolean;
  held: number;
}) {
  const t = useT();
  const lang = useApp((s) => s.settings.lang);
  const inCart = useCart((s) => s.qtyByProduct[p.id] ?? 0);
  const taxMode = useApp((s) => s.settings.taxMode);
  const negativeStock = useApp((st) => st.settings.negativeStock);
  const { ref: thumbRef, src: thumbSrc } = useThumb(p.id, p.imageRev, p.image);
  const tracked = p.trackStock && !p.isService;
  // Live figure: what is on the shelf minus what this cart and parked tickets
  // have already claimed - it moves as the cashier taps.
  const available = p.stock - held - inCart;
  const out = tracked && available <= 0;
  const low = tracked && !out && p.minStock > 0 && available <= p.minStock;
  const stock = tracked && (
    <span className={`prod-stock-pill ${out ? 'danger' : low ? 'warn' : ''}`}>
      {out
        ? available < 0 && negativeStock
          ? `${t('pos.outOfStock')} · ${formatQty(available, lang)}`
          : t('pos.outOfStock')
        : formatQty(available, lang)}
    </span>
  );
  const badge = inCart > 0 && <span className="prod-incart">{formatQty(inCart, lang)}</span>;

  if (!withImage) {
    return (
      <button
        type="button"
        className={`prod-tag ${out ? 'out' : ''} ${inCart > 0 ? 'in-cart' : ''}`}
        style={{ '--tag': p.color || 'var(--ink)' } as CSSProperties}
        onClick={(e: MouseEvent<HTMLButtonElement>) => onPick(p, e.currentTarget)}
      >
        <span className="prod-tag-top">
          <span className="prod-mono" style={tint(p.color)}>
            {monogram(p.name)}
          </span>
          {p.favorite && <span className="prod-tag-fav">★</span>}
          {stock}
        </span>
        <span className="prod-name">{p.name}</span>
        {p.sku && <span className="prod-sku">{p.sku}</span>}
        <span className="prod-price">
          {priceText}
          {lang === 'ja' && taxMode === 'inclusive' && (
            <span className="tiny dim">
              {' '}
              {t('tax.includedBadge')}
              {p.taxCategory === 'reduced' ? '※' : ''}
            </span>
          )}
        </span>
        {badge}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`prod-tile ${out ? 'out' : ''} ${inCart > 0 ? 'in-cart' : ''}`}
      onClick={(e: MouseEvent<HTMLButtonElement>) => onPick(p, e.currentTarget)}
    >
      <span ref={thumbRef} className="prod-thumb" style={thumbSrc ? undefined : tint(p.color)}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="prod-initial">{monogram(p.name)}</span>
        )}
        {stock}
        {p.favorite && <span className="prod-fav">★</span>}
      </span>
      <span className="prod-info">
        <span className="prod-name">{p.name}</span>
        {p.sku && <span className="prod-sku">{p.sku}</span>}
        <span className="prod-price">
          {priceText}
          {lang === 'ja' && taxMode === 'inclusive' && (
            <span className="tiny dim">
              {' '}
              {t('tax.includedBadge')}
              {p.taxCategory === 'reduced' ? '※' : ''}
            </span>
          )}
        </span>
      </span>
      {badge}
    </button>
  );
});
