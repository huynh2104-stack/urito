import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from '@/components/Icon';
import { ProductThumb } from '@/components/ProductThumb';
import { formatQty } from '@/core/money';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { useUI } from '@/store/ui';
import type { OrderItem, Product } from '@/db/types';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SWIPE_DELETE = 84;

/** Quantity field that lets you clear it and type a new number. The cart only
 *  changes when the text is a valid quantity above zero; an empty or "0" draft
 *  is left alone until you leave the field, then it snaps back. */
function QtyInput({ item, setQty }: { item: OrderItem; setQty: (n: number) => void }) {
  const lang = useApp((s) => s.settings.lang);
  const [draft, setDraft] = useState<string | null>(null);

  const parse = (text: string): number | null => {
    const n = Number(text.trim().replace(',', '.'));
    return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <input
      value={draft ?? formatQty(item.qty, lang)}
      inputMode="decimal"
      aria-label="qty"
      onFocus={(e) => {
        setDraft(String(item.qty).replace('.', lang === 'vi' ? ',' : '.'));
        e.target.select();
      }}
      onChange={(e) => {
        const text = e.target.value.replace(/[^\d.,]/g, '');
        setDraft(text);
        const n = parse(text);
        if (n !== null) setQty(n);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function CartLine({
  item,
  product,
  held,
  onEdit,
}: {
  item: OrderItem;
  product?: Product;
  /** Units of this product already promised to parked tickets. */
  held: number;
  onEdit: (lineId: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const [phase, setPhase] = useState<'idle' | 'leaving' | 'collapsing'>('idle');
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  /* With "sell when out of stock" off, the cart may not exceed what is on the
     shelf - whether the item came from a tile tap, the + button or typing. */
  const negativeStock = useApp((s) => s.settings.negativeStock);
  const others = useCart((s) =>
    s.items.filter((i) => i.productId === item.productId && i.id !== item.id).reduce((n, i) => n + i.qty, 0),
  );
  const tracked = !!product && product.trackStock && !product.isService;
  const limit = tracked && !negativeStock ? Math.max(0, product.stock - held - others) : Infinity;
  const over = tracked && item.qty + others + held > product.stock;
  const setQty = (n: number) => {
    if (n > limit) {
      useUI.getState().showStockAlert(t('pos.stockBlocked', { name: item.name, n: limit }));
      useCart.getState().setQty(item.id, Math.max(limit, 0.001));
    } else useCart.getState().setQty(item.id, n);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const remove = () => {
    if (phase !== 'idle') return;
    if (reduced()) {
      useCart.getState().removeLine(item.id);
      return;
    }
    setPhase('leaving');
    timers.current.push(window.setTimeout(() => setPhase('collapsing'), 230));
    timers.current.push(window.setTimeout(() => useCart.getState().removeLine(item.id), 430));
  };

  /* Touch: drag the row left; past the threshold it is deleted. */
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || phase !== 'idle') return;
    drag.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) {
        d.active = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else return;
    }
    setDx(Math.max(Math.min(mx, 0), -180));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (dx <= -SWIPE_DELETE) {
      setDx(0);
      remove();
    } else setDx(0);
  };

  const dragging = dx !== 0 && phase === 'idle';

  return (
    <div
      className={`cart-line-wrap ${phase === 'collapsing' ? 'collapsing' : ''}`}
      data-product={item.productId}
    >
      <div className="cart-line-inner">
        <div className={`cart-line-bg ${phase !== 'idle' || dx < 0 ? 'show' : ''}`} aria-hidden="true">
          <Icon name="trash" size={18} />
          <span>{t('common.delete')}</span>
        </div>
        <div
          className={`cart-line ${phase !== 'idle' ? 'leaving' : ''}`}
          style={dragging ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <div className="cart-line-top">
            <ProductThumb name={item.name} color={product?.color} image={product?.image} size={40} />
            <button type="button" className="cart-line-name" onClick={() => onEdit(item.id)}>
              {item.name}
              {item.modifiers.length > 0 && (
                <div className="cart-line-mods">{item.modifiers.map((m) => m.name).join(', ')}</div>
              )}
              {item.note && <div className="cart-line-note">* {item.note}</div>}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon cart-line-x"
              onClick={remove}
              aria-label={t('common.delete')}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="cart-line-bottom">
            <div className="qty-stepper">
              <button type="button" onClick={() => useCart.getState().bumpQty(item.id, -1)} aria-label="-">
                −
              </button>
              <QtyInput item={item} setQty={setQty} />
              <button type="button" onClick={() => setQty(item.qty + 1)} aria-label="+">
                +
              </button>
            </div>
            <div className="right">
              {item.discount > 0 && (
                <div className="tiny dim" style={{ textDecoration: 'line-through' }}>
                  {money(item.gross)}
                </div>
              )}
              <div className="num strong">{money(item.total)}</div>
              {over && (
                <div className="tiny stock-warn">
                  {t('pos.stockLeft', { n: formatQty(Math.max(0, product!.stock - held), lang) })}
                </div>
              )}
              {item.qty !== 1 && (
                <div className="tiny dim">
                  {formatQty(item.qty, lang)} × {money(item.total / item.qty)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
