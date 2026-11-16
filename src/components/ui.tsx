import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { formatAmount, parseMoney } from '@/core/money';
import { useApp, useT } from '@/store/app';
import { useUI } from '@/store/ui';

/* ---------------------------------------------------------------- button */

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'soft';

export function Button({
  variant = 'default',
  size,
  icon,
  block,
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn-${variant}` : '',
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    !children && icon ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- field */

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function useInitialFocus(ref: RefObject<HTMLInputElement | null>, enabled?: boolean) {
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [ref, enabled]);
}

export function Input({
  className = '',
  initialFocus,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { initialFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useInitialFocus(ref, initialFocus);
  return <input ref={ref} className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="checkbox-text">{label}</span>
        {hint && <div className="hint">{hint}</div>}
      </span>
    </label>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="switch-row">
      <div>
        <div style={{ fontWeight: 550 }}>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <button
        type="button"
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        aria-pressed={checked}
        aria-label={label}
        disabled={disabled}
      />
    </div>
  );
}

/* ----------------------------------------------------------- money input */

export function MoneyInput({
  value,
  onChange,
  className = '',
  initialFocus,
  onEnter,
  id,
  disabled,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  initialFocus?: boolean;
  onEnter?: () => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const currency = useApp((s) => s.settings.currency);
  const lang = useApp((s) => s.settings.lang);
  const ref = useRef<HTMLInputElement>(null);
  useInitialFocus(ref, initialFocus);
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(() => (value ? formatAmount(value, currency, lang) : ''));

  const formatted = value ? formatAmount(value, currency, lang) : '';
  const displayValue = isFocused ? text : formatted;

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    onChange(parseMoney(raw, currency));
  };

  return (
    <input
      ref={ref}
      id={id}
      className={`input input-money ${className}`}
      inputMode="numeric"
      value={displayValue}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={(e) => {
        setIsFocused(true);
        setText(formatted);
        e.target.select();
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      onChange={handle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) onEnter();
      }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className = '',
  initialFocus,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  initialFocus?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  const ref = useRef<HTMLInputElement>(null);
  useInitialFocus(ref, initialFocus);
  return (
    <input
      ref={ref}
      type="number"
      className={`input ${className}`}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      {...rest}
    />
  );
}

/* ----------------------------------------------------------------- badge */

export function Badge({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'info' | 'brand';
  children: ReactNode;
}) {
  return <span className={`badge ${tone !== 'default' ? `badge-${tone}` : ''}`}>{children}</span>;
}

/* ----------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  size,
  footer,
  children,
  closeOnOverlay = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
  closeOnOverlay?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------ empty state */

export function EmptyState({
  icon = 'box',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} strokeWidth={1.6} />
      </div>
      <div className="empty-title">{title}</div>
      {description && <div className="small">{description}</div>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

/* ------------------------------------------------------------------ tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tab ${value === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge ? <span className="badge badge-brand" style={{ marginLeft: 6 }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- search */

export function SearchInput({
  value,
  onChange,
  placeholder,
  initialFocus,
  inputRef,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  initialFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const targetRef = inputRef ?? localRef;
  useInitialFocus(targetRef, initialFocus);
  return (
    <div className="search-wrap">
      <span className="search-icon">
        <Icon name="search" size={15} />
      </span>
      <input
        ref={targetRef}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/* -------------------------------------------------------------- stat card */

export function Stat({
  label,
  value,
  delta,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tone?: 'success' | 'danger' | 'warn';
  icon?: IconName;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <div className="stat-label">{label}</div>
        {icon && (
          <span className={`stat-icon ${tone ?? ''}`}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className={`stat-value ${tone ? `text-${tone}` : ''}`}>{value}</div>
      {delta !== undefined && delta !== null ? (
        <div className={`stat-delta ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          <Icon name={delta >= 0 ? 'arrowUp' : 'arrowDown'} size={12} />
          {Math.abs(delta).toFixed(1)}%{hint ? <span className="dim"> {hint}</span> : null}
        </div>
      ) : hint ? (
        <div className="stat-delta dim">{hint}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------- confirm + toast */

export function ConfirmHost() {
  const confirms = useUI((s) => s.confirms);
  const answer = useUI((s) => s.answer);
  const current = confirms[0];
  if (!current) return null;
  return (
    <Modal
      open
      size="sm"
      title={current.title}
      onClose={() => answer(current.id, false)}
      footer={
        <>
          <Button onClick={() => answer(current.id, false)}>{current.cancelLabel}</Button>
          <Button variant={current.danger ? 'danger' : 'primary'} onClick={() => answer(current.id, true)}>
            {current.confirmLabel}
          </Button>
        </>
      }
    >
      {current.message && <p className="muted" style={{ margin: 0 }}>{current.message}</p>}
    </Modal>
  );
}

export function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-stack">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismiss(t.id)}
          style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
        >
          <Icon
            name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : t.kind === 'warning' ? 'alert' : 'info'}
            size={16}
          />
          <span className="grow">{t.message}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- prompt */

/** Small inline text prompt used for reasons, notes and names. */
export function PromptModal({
  open,
  title,
  label,
  initial = '',
  placeholder,
  multiline,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  if (!open) return null;
  return (
    <PromptModalBody
      title={title}
      label={label}
      initial={initial}
      placeholder={placeholder}
      multiline={multiline}
      confirmLabel={confirmLabel}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

function PromptModalBody({
  title,
  label,
  initial,
  placeholder,
  multiline,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  label?: string;
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const id = useId();

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSubmit(value.trim())}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <Field label={label}>
        {multiline ? (
          <Textarea id={id} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <Input
            id={id}
            value={value}
            initialFocus
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(value.trim());
            }}
          />
        )}
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------- colour pick */

export function ColorPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: string[];
}) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${value === c ? 'active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}
