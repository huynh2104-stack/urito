import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from '@/components/Icon';
import { isCommitEnter } from '@/components/ui';
import { ProductThumb } from '@/components/ProductThumb';
import { formatQty } from '@/core/money';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { useUI } from '@/store/ui';
import type { OrderItem, Product } from '@/db/types';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SWIPE_DELETE = 84;

/** 一旦空にして数値を打ち直せる数量欄。0や空欄の入力中は確定せず、フォーカスアウト時に元の正数値へ戻す。 */
function QtyInput({ item, setQty }: { item: OrderItem; setQty: (n: number) => void }) {
  const t = useT();
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
      aria-label={t('common.qty')}
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
        if (isCommitEnter(e)) (e.target as HTMLInputElement).blur();
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
    /** 保留伝票ですでに引当確保されている数量。 */
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

      /* マイナス在庫禁止設定時は、タイルタップ・+ボタン・手入力いずれの場合も実在庫上限を超えないよう制限する。 */
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

      /* タッチスワイプ操作: 左へしきい値以上スライドしたら明細を削除する。 */
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
            <ProductThumb productId={product?.id} imageRev={product?.imageRev} name={item.name} color={product?.color} image={product?.image} size={40} />
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
              <button type="button" onClick={() => useCart.getState().bumpQty(item.id, -1)} aria-label={t('pos.decreaseQty')}>
                −
              </button>
              <QtyInput item={item} setQty={setQty} />
              <button type="button" onClick={() => setQty(item.qty + 1)} aria-label={t('pos.increaseQty')}>
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
              {over && product && (
                <div className="tiny stock-warn">
                  {t('pos.stockLeft', { n: formatQty(Math.max(0, product.stock - held), lang) })}
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
