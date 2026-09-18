// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Briques d'interface communes. Toutes respectent les contraintes du §7.3 :
// cibles d'au moins 44 px, contrastes élevés, libellés reliés aux champs.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field"
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint || error ? (
        <p
          id={`${id}-hint`}
          className={`mt-1 text-xs ${error ? 'text-red-700 dark:text-red-300' : 'text-earth-700 dark:text-earth-200'}`}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Champ de mot de passe avec bascule d'affichage.
 *
 * Trois précautions qui ne se voient pas : le bouton est `type="button"` (dans un
 * formulaire, un bouton sans type **soumet**, et cliquer sur l'œil tenterait de se
 * connecter) ; il porte `aria-pressed`, donc un lecteur d'écran annonce l'état et pas
 * seulement l'action ; et l'`autoComplete` reste celui du champ, pour ne pas priver les
 * gestionnaires de mots de passe de ce qu'ils attendent.
 */
export function PasswordField({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="field pr-12"
          type={visible ? 'text' : 'password'}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex min-h-11 w-11 items-center justify-center text-earth-700 hover:text-earth-900 dark:text-earth-200 dark:hover:text-white"
          aria-pressed={visible}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          onClick={() => setVisible((etat) => !etat)}
        >
          <span aria-hidden>{visible ? '🙈' : '👁'}</span>
        </button>
      </div>
      {hint || error ? (
        <p
          id={`${id}-hint`}
          className={`mt-1 text-xs ${error ? 'text-red-700 dark:text-red-300' : 'text-earth-700 dark:text-earth-200'}`}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field" {...props}>
        {children}
      </select>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        id={id}
        type="checkbox"
        className="size-5 accent-sillon-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/** Tiroir plein écran sur mobile, panneau latéral sur grand écran. */
export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 no-print"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-earth-50 p-4 shadow-xl dark:bg-earth-900 sm:rounded-l-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-earth-700 dark:text-earth-200">{message}</p>
      {action}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <p role="status" className="py-8 text-center text-earth-700 dark:text-earth-200">
      {t('common.loading')}
    </p>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : t('common.error');
  return (
    <div
      role="alert"
      className="card border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="card">
      <p className="text-sm text-earth-700 dark:text-earth-200">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">{hint}</p> : null}
    </div>
  );
}

export function ColorChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="chip" style={{ backgroundColor: `${color}22`, color }}>
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}
