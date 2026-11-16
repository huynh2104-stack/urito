import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useT } from '@/store/app';
import { isDefaultView, type PosView, type SortKey, type TileSize } from './viewOptions';
import type { TranslationKey } from '@/i18n';

const SORTS: { key: SortKey; label: TranslationKey }[] = [
  { key: 'pin', label: 'pos.sortPin' },
  { key: 'sold', label: 'pos.sortSold' },
  { key: 'name', label: 'pos.sortName' },
  { key: 'priceAsc', label: 'pos.sortPriceAsc' },
  { key: 'priceDesc', label: 'pos.sortPriceDesc' },
  { key: 'stock', label: 'pos.sortStock' },
  { key: 'newest', label: 'pos.sortNewest' },
];

const SIZES: { key: TileSize; label: TranslationKey }[] = [
  { key: 's', label: 'pos.sizeS' },
  { key: 'm', label: 'pos.sizeM' },
  { key: 'l', label: 'pos.sizeL' },
];

/** 商品グリッドの並び替え・在庫フィルタ・タイルサイズ切替ポップオーバー。 */
export function ViewMenu({ view, onChange }: { view: PosView; onChange: (v: PosView) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const active = !isDefaultView(view);

  return (
    <div className="view-menu" ref={ref}>
      <button
        type="button"
        className={`btn view-btn ${active ? 'is-active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        title={t('pos.viewOptions')}
      >
        <Icon name="filter" size={16} />
        <span className="hide-md">{t('pos.sort')}</span>
        {active && <span className="view-dot" />}
      </button>

      {open && (
        <div className="menu-pop view-pop" role="menu">
          <div className="view-section">{t('pos.sort')}</div>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="menuitemradio"
              aria-checked={view.sort === s.key}
              className={`menu-item ${view.sort === s.key ? 'is-on' : ''}`}
              onClick={() => onChange({ ...view, sort: s.key })}
            >
              <span className="grow">{t(s.label)}</span>
              {view.sort === s.key && <Icon name="check" size={15} />}
            </button>
          ))}

          <div className="menu-sep" />
          <div className="view-row">
            <span>{t('pos.onlyInStock')}</span>
            <button
              type="button"
              className={`switch ${view.inStockOnly ? 'on' : ''}`}
              aria-pressed={view.inStockOnly}
              aria-label={t('pos.onlyInStock')}
              onClick={() => onChange({ ...view, inStockOnly: !view.inStockOnly })}
            />
          </div>

          <div className="view-row">
            <span>{t('pos.tileSize')}</span>
            <div className="btn-group">
              {SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`btn btn-sm ${view.size === s.key ? 'active' : ''}`}
                  onClick={() => onChange({ ...view, size: s.key })}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
