import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { ProductThumb } from '@/components/ProductThumb';
import { db } from '@/db/db';
import { newId } from '@/core/id';
import { parseCsv } from '@/services/csv';
import { readXlsx } from '@/services/xlsx';
import { parseMoney } from '@/core/money';
import { PALETTE } from '@/db/defaults';
import { removeTones } from '@/features/pos/PosPage';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import type { Category, Product, StockMovement } from '@/db/types';

interface Row {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number | null;
  minStock: number | null;
  barcode: string;
  image: string;
  isService: boolean;
  active: boolean;
}

/** Header text (tones and case removed) -> field. Covers the exports of the
 *  common Vietnamese POS apps as well as Urito's own CSV columns. */
const HEADERS: Record<string, string[]> = {
  sku: ['ma hang hoa', 'ma hang', 'ma sp', 'ma san pham', 'sku', 'code'],
  name: ['ten hang hoa', 'ten hang', 'ten san pham', 'ten', 'name', 'product name', '商品名'],
  category: ['ten nhom', 'nhom hang', 'nhom', 'category', 'カテゴリー'],
  unit: ['dvt', 'don vi', 'unit'],
  price: ['gia ban', 'gia', 'price', '販売価格'],
  cost: ['gia von', 'von', 'cost', '原価'],
  stock: ['ton kho', 'ton', 'stock', '在庫数'],
  minStock: ['dinh muc ton nho nhat', 'ton toi thieu', 'min stock'],
  barcode: ['ma vach', 'barcode', 'バーコード'],
  image: ['hinh anh', 'anh', 'image'],
  kind: ['loai hang'],
  blocked: ['khong cho phep ban'],
};

const norm = (s: string) => removeTones(s.toLowerCase()).replace(/[?:]/g, '').replace(/\s+/g, ' ').trim();

function mapColumns(head: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  head.forEach((h, i) => {
    const key = norm(h ?? '');
    for (const [field, names] of Object.entries(HEADERS)) {
      if (found[field] === undefined && names.includes(key)) found[field] = i;
    }
  });
  return found;
}

export function ImportProductsModal({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const currency = useApp((s) => s.settings.currency);
  const user = useApp((s) => s.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<Map<string, Product>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const keyOf = (r: { sku: string; barcode: string }, map: Map<string, Product>) =>
    (r.sku && map.get(`s:${r.sku.toLowerCase()}`)) || (r.barcode && map.get(`b:${r.barcode}`)) || undefined;

  const read = async (file: File) => {
    setError('');
    setRows([]);
    setFileName(file.name);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const table = isXlsx ? await readXlsx(file) : parseCsv(await file.text());
      if (!table.length) return;

      const [head, ...body] = table;
      const cols = mapColumns(head);
      const num = (v: string | undefined) => Number(String(v ?? '').replace(/[^\d.-]/g, ''));
      const money = (v: string | undefined) => parseMoney(String(v ?? '0'), currency);
      let parsed: Row[];

      if (cols.name !== undefined) {
        const cell = (c: string[], f: string) => (cols[f] === undefined ? '' : String(c[cols[f]] ?? '').trim());
        parsed = body.map((c) => {
          const image = cell(c, 'image');
          return {
            sku: cell(c, 'sku'),
            name: cell(c, 'name'),
            category: cell(c, 'category'),
            unit: cell(c, 'unit'),
            price: money(cell(c, 'price')),
            cost: money(cell(c, 'cost')),
            stock: cols.stock === undefined ? null : Number.isFinite(num(cell(c, 'stock'))) ? num(cell(c, 'stock')) : 0,
            minStock: cols.minStock === undefined ? null : Math.max(0, num(cell(c, 'minStock')) || 0),
            barcode: cell(c, 'barcode'),
            image: /^(https?:|data:image)/i.test(image) ? image : '',
            isService: cell(c, 'kind') === '2',
            active: cell(c, 'blocked') !== '1',
          };
        });
      } else {
        // Plain CSV without recognisable headers: name, price, cost, category, sku, barcode, stock.
        const looksLikeHeader = head.some((c) => /name|tên|商品|price|giá|価格/i.test(c));
        const data = looksLikeHeader ? body : table;
        parsed = data.map((c) => ({
          name: (c[0] ?? '').trim(),
          price: money(c[1]),
          cost: money(c[2]),
          category: (c[3] ?? '').trim(),
          sku: (c[4] ?? '').trim(),
          barcode: (c[5] ?? '').trim(),
          stock: num(c[6]) || 0,
          unit: '',
          minStock: null,
          image: '',
          isService: false,
          active: true,
        }));
      }

      const list = parsed.filter((r) => r.name);
      const map = new Map<string, Product>();
      for (const p of await db.products.toArray()) {
        if (p.sku) map.set(`s:${p.sku.toLowerCase()}`, p);
        if (p.barcode) map.set(`b:${p.barcode}`, p);
      }
      setExisting(map);
      setRows(list);
      if (!list.length) setError(t('products.importNoRows'));
    } catch (err) {
      console.error(err);
      setError(t('products.importReadError'));
    }
  };

  const updates = rows.filter((r) => keyOf(r, existing)).length;
  const additions = rows.length - updates;

  const commit = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const now = Date.now();
      const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
      const newCategories: Category[] = [];
      for (const row of rows) {
        const key = row.category.toLowerCase();
        if (row.category && !catByName.has(key)) {
          const created: Category = {
            id: newId('c'),
            name: row.category,
            color: PALETTE[(categories.length + newCategories.length) % PALETTE.length],
            sort: categories.length + newCategories.length,
            active: true,
          };
          newCategories.push(created);
          catByName.set(key, created);
        }
      }

      const products: Product[] = [];
      const movements: StockMovement[] = [];
      const seen = new Set<string>();
      let created = 0;
      let updated = 0;

      rows.forEach((row, i) => {
        const dupKey = row.sku ? `s:${row.sku.toLowerCase()}` : '';
        if (dupKey && seen.has(dupKey)) return; // same code twice in the file: first one wins
        if (dupKey) seen.add(dupKey);

        const old = keyOf(row, existing);
        const categoryId = catByName.get(row.category.toLowerCase())?.id ?? old?.categoryId ?? '';
        const tracked = !row.isService;
        const stock = row.stock ?? old?.stock ?? 0;

        if (old) {
          updated++;
          products.push({
            ...old,
            name: row.name,
            sku: row.sku || old.sku,
            barcode: row.barcode || old.barcode,
            categoryId,
            unit: row.unit || old.unit,
            price: row.price,
            cost: row.cost,
            trackStock: tracked,
            stock,
            minStock: row.minStock ?? old.minStock,
            isService: row.isService,
            active: row.active,
            image: row.image || old.image,
            updatedAt: now,
          });
        } else {
          created++;
          const id = newId('p');
          products.push({
            id,
            sku: row.sku,
            barcode: row.barcode,
            name: row.name,
            categoryId,
            price: row.price,
            cost: row.cost,
            unit: row.unit,
            trackStock: tracked,
            stock,
            minStock: row.minStock ?? 0,
            isService: row.isService,
            active: row.active,
            color: catByName.get(row.category.toLowerCase())?.color ?? PALETTE[i % PALETTE.length],
            image: row.image,
            modifierGroupIds: [],
            favorite: false,
            sort: i,
            createdAt: now,
            updatedAt: now,
          });
          if (tracked && stock !== 0) {
            movements.push({
              id: newId('sm'),
              productId: id,
              productName: row.name,
              type: 'init',
              qty: stock,
              before: 0,
              after: stock,
              cost: row.cost,
              refType: 'import',
              refId: '',
              note: fileName,
              userId: user?.id ?? '',
              userName: user?.name ?? '',
              at: now,
            });
          }
        }
      });

      await db.transaction('rw', [db.categories, db.products, db.stockMovements], async () => {
        if (newCategories.length) await db.categories.bulkPut(newCategories);
        await db.products.bulkPut(products);
        if (movements.length) await db.stockMovements.bulkPut(movements);
      });

      toast.success(t('products.importedDetail', { added: created, updated }));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('products.importCsv')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!rows.length || busy} onClick={() => void commit()}>
            {t('common.import')} ({rows.length})
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="callout">
          {t('products.csvHint')}
          <div className="small muted mt-4">{t('products.importXlsxHint')}</div>
        </div>

        <input
          className="input"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
          }}
        />

        {error && <div className="callout callout-danger">{error}</div>}

        {rows.length > 0 && (
          <>
            <div className="row gap-8 wrap">
              <span className="badge badge-success">{t('products.importNew', { n: additions })}</span>
              <span className="badge badge-info">{t('products.importUpdate', { n: updates })}</span>
            </div>
            <div className="card table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.category')}</th>
                    <th className="right">{t('common.price')}</th>
                    <th className="right">{t('common.cost')}</th>
                    <th className="right">{t('inv.currentStock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div className="row gap-8">
                          <ProductThumb name={r.name} image={r.image} size={30} />
                          <div>
                            <div className="strong">{r.name}</div>
                            {r.sku && <div className="tiny dim">{r.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{r.category}</td>
                      <td className="right num">{r.price.toLocaleString()}</td>
                      <td className="right num">{r.cost.toLocaleString()}</td>
                      <td className="right num">{r.stock ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && <div className="small dim">{t('products.importPreviewCap', { n: rows.length })}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
