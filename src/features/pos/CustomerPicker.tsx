import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal, SearchInput } from '@/components/ui';
import { db } from '@/db/db';
import { docPrefixes } from '@/db/defaults';
import { nextSeq } from '@/db/seq';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { toast } from '@/store/ui';
import { normaliseCode, normaliseText } from '@/core/search';
import type { Customer } from '@/db/types';

export function CustomerPickerModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const loyalty = useApp((s) => s.settings.loyaltyEnabled);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const customers = useLiveQuery(async () => db.customers.filter((c) => c.active).toArray(), [], []);

  const filtered = useMemo(() => {
    const q = normaliseText(search.trim());
    const phoneQ = normaliseCode(search);
    const list = q
      ? customers.filter(
          (c) => normaliseText(c.name).includes(q) || normaliseCode(c.phone).includes(phoneQ),
        )
      : customers;
    return list.sort((a, b) => b.orderCount - a.orderCount).slice(0, 60);
  }, [customers, search]);

  const choose = (customer: Customer | null) => {
    useCart.getState().setCustomer(customer?.id ?? null, customer?.name ?? '', customer?.points ?? 0);
    onClose();
  };

  const create = async () => {
    if (!name.trim()) return;
    const customer = await db.transaction('rw', [db.customers, db.kv], async () => {
      const seq = await nextSeq('customer');
      const row: Customer = {
        id: newId('cu'),
        code: `${docPrefixes(lang).customer}${String(seq).padStart(4, '0')}`,
        name: name.trim(),
        phone: phone.trim(),
        address: '',
        note: '',
        points: 0,
        debt: 0,
        totalSpent: 0,
        orderCount: 0,
        birthday: '',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.customers.add(row);
      return row;
    });
    toast.success(t('common.saved'));
    choose(customer);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('pos.selectCustomer')}
      footer={
        <>
          <Button onClick={() => choose(null)}>{t('pos.walkIn')}</Button>
          <span className="grow" />
          {creating ? (
            <>
              <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void create()} disabled={!name.trim()}>
                {t('common.save')}
              </Button>
            </>
          ) : (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {t('cus.new')}
            </Button>
          )}
        </>
      }
    >
      {creating ? (
        <div className="col gap-12">
          <Field label={t('common.name')} required>
            <Input initialFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('common.phone')}>
            <Input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="col gap-12">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('cus.searchPlaceholder')}
            initialFocus
          />
          <div className="card" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty small">{t('cus.noCustomers')}</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="list-row w-full"
                  style={{ background: 'none', border: 0, textAlign: 'left' }}
                  onClick={() => choose(c)}
                >
                  <div className="grow">
                    <div className="strong">{c.name}</div>
                    <div className="tiny dim">
                      {c.phone || c.code} · {t('cus.orderCount')}: {c.orderCount}
                    </div>
                  </div>
                  <div className="right">
                    {loyalty && <div className="small">{c.points} P</div>}
                    {c.debt > 0 && <div className="tiny text-danger">{money(c.debt)}</div>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
