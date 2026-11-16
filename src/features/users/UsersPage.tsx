import { useState } from 'react';
import { Button, Checkbox, ColorPicker, EmptyState, Field, Input, Modal, Select, SwitchRow } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { PALETTE } from '@/db/defaults';
import { useApp, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import type { Role, User } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const ROLE_KEY: Record<Role, TranslationKey> = {
  owner: 'user.roleOwner',
  manager: 'user.roleManager',
  cashier: 'user.roleCashier',
};

const ROLE_DESC: Record<Role, TranslationKey> = {
  owner: 'user.permOwner',
  manager: 'user.permManager',
  cashier: 'user.permCashier',
};

export function UsersPage() {
  const t = useT();
  const current = useApp((s) => s.user);
  const reloadUsers = useApp((s) => s.reloadUsers);
  const requireLogin = useApp((s) => s.settings.requireLogin);
  const updateSettings = useApp((s) => s.updateSettings);
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const users = useLiveQuery(async () => db.users.toArray(), [], []);
  const active = users.filter((u) => u.active);

  const remove = async (user: User) => {
    if (user.id === current?.id) {
      toast.error(t('user.cannotDeleteSelf'));
      return;
    }
    if (user.role === 'owner' && active.filter((u) => u.role === 'owner').length <= 1) {
      toast.error(t('user.cannotDeleteLastOwner'));
      return;
    }
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: user.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.users.update(user.id, { active: false });
    await reloadUsers();
    toast.success(t('common.deleted'));
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{t('user.title')}</div>
          <div className="page-sub">{active.length}</div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('user.new')}
        </Button>
      </div>

      {active.length > 1 && active.some((u) => u.role === 'owner' && !u.pin) && (
        <div className="callout callout-warn mb-16">{t('user.ownerNoPin')}</div>
      )}

      <div className="card card-pad mb-16">
        <SwitchRow
          label={t('set.requireLogin')}
          hint={t('auth.selectUser')}
          checked={requireLogin}
          onChange={(v) => void updateSettings({ requireLogin: v })}
        />
      </div>

      <div className="card">
        {active.length === 0 ? (
          <EmptyState icon="users" title={t('common.empty')} />
        ) : (
          active.map((user) => (
            <div key={user.id} className="list-row">
              <div className="avatar" style={{ background: user.color }}>
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="grow">
                <div className="strong">
                  {user.name}
                  {user.id === current?.id && <span className="badge badge-brand" style={{ marginLeft: 6 }}>●</span>}
                </div>
                <div className="tiny dim">{t(ROLE_DESC[user.role])}</div>
              </div>
              <span className="badge">{t(ROLE_KEY[user.role])}</span>
              {user.pin && <span className="badge badge-info">PIN</span>}
              <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(user)} />
              <Button variant="ghost" size="sm" icon="trash" onClick={() => void remove(user)} />
            </div>
          ))
        )}
      </div>

      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const t = useT();
  const reloadUsers = useApp((s) => s.reloadUsers);
  const setUser = useApp((s) => s.setUser);
  const current = useApp((s) => s.user);

  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'cashier');
  const [pin, setPin] = useState(user?.pin ?? '');
  const [color, setColor] = useState(user?.color ?? PALETTE[2]);
  const [active, setActive] = useState(user?.active ?? true);

  const save = async () => {
    if (!name.trim()) return;
    const owners = (await db.users.toArray()).filter((u) => u.active && u.role === 'owner');
    const losesOwner = user?.role === 'owner' && (role !== 'owner' || !active);
    if (losesOwner && owners.length <= 1) {
      toast.error(t('user.lastOwnerRole'));
      return;
    }
    if (user && user.id === current?.id && role !== user.role) {
      const ok = await confirmDialog({
        title: t('user.role'),
        message: t('user.selfDemoteConfirm'),
        confirmLabel: t('common.continue'),
        cancelLabel: t('common.cancel'),
        danger: true,
      });
      if (!ok) return;
    }
    const row: User = {
      id: user?.id ?? newId('u'),
      name: name.trim(),
      pin: pin.replace(/\D/g, '').slice(0, 6),
      role,
      active,
      color,
      createdAt: user?.createdAt ?? Date.now(),
    };
    await db.users.put(row);
    await reloadUsers();
    if (current?.id === row.id) {
      await setUser(row.active ? row : null);
      // A demoted user must not be left on a page they can no longer open.
      if (row.role !== 'owner') window.location.hash = '#/';
    }
    toast.success(t('common.saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={user ? t('user.edit') : t('user.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('common.name')} required>
          <Input initialFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('user.role')} hint={t(ROLE_DESC[role])}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="owner">{t('user.roleOwner')}</option>
            <option value="manager">{t('user.roleManager')}</option>
            <option value="cashier">{t('user.roleCashier')}</option>
          </Select>
        </Field>
        <Field label={t('user.pin')} hint={t('user.pinHint')}>
          <Input
            value={pin}
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label={t('common.color')}>
          <ColorPicker value={color} onChange={setColor} colors={PALETTE} />
        </Field>
        <Checkbox checked={active} onChange={setActive} label={t('common.active')} />
      </div>
    </Modal>
  );
}
