// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Mot de passe oublié : la demande d'un lien, puis le choix du nouveau mot de passe
// depuis le lien reçu. Deux pages publiques — on y arrive sans session.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../lib/api.js';
import { Field } from '../components/ui.js';

/** Cadre commun aux deux écrans, calé sur celui de la page de connexion. */
function PublicCard({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sillon</h1>
        <p className="text-earth-700 dark:text-earth-200">{title}</p>
      </div>
      {children}
      <Link to="/connexion" className="btn-ghost w-full">
        {t('auth.backToSignIn')}
      </Link>
    </main>
  );
}

export function PasswordForgottenPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/auth/password-reset', { method: 'POST', body: { email } });
    } catch {
      // Une panne réseau ne doit pas non plus distinguer les cas : on l'avale
      // volontairement, mais explicitement — sans ce `catch`, la promesse était
      // rejetée dans le vide.
    } finally {
      setBusy(false);
      // Le serveur répond pareil que l'adresse existe ou non ; l'écran fait de même,
      // sans quoi il révélerait ce que la route prend soin de taire.
      setSent(true);
    }
  };

  if (sent) {
    return (
      <PublicCard title={t('auth.forgotten.title')}>
        <p role="status" className="card text-sm">
          {t('auth.forgotten.sent')}
        </p>
      </PublicCard>
    );
  }

  return (
    <PublicCard title={t('auth.forgotten.title')}>
      <form className="card space-y-4" onSubmit={(event) => void submit(event)}>
        <p className="text-sm text-earth-700 dark:text-earth-200">{t('auth.forgotten.intro')}</p>
        <Field
          label={t('auth.email')}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className="btn-primary w-full" disabled={busy || !email}>
          {busy ? t('common.loading') : t('auth.forgotten.submit')}
        </button>
      </form>
    </PublicCard>
  );
}

export function PasswordResetPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, password },
      });
      await navigate({ to: '/connexion' });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicCard title={t('auth.reset.title')}>
      <form className="card space-y-4" onSubmit={(event) => void submit(event)}>
        <Field
          label={t('auth.reset.newPassword')}
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          hint={t('auth.passwordHint')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error ?? undefined}
        />
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || password.length < 10}
        >
          {busy ? t('common.loading') : t('auth.reset.submit')}
        </button>
      </form>
    </PublicCard>
  );
}

export function EmailConfirmationPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'pending' | 'done' | 'failed'>('pending');

  useEffect(() => {
    // Le jeton ne sert qu'une fois : il faut donc l'échanger une fois, et pas à chaque
    // rendu. `ignore` couvre le double montage du mode strict en développement.
    let ignore = false;
    void api('/api/auth/confirm', { method: 'POST', body: { token } })
      .then(() => !ignore && setState('done'))
      .catch(() => !ignore && setState('failed'));
    return () => {
      ignore = true;
    };
  }, [token]);

  return (
    <PublicCard title={t('auth.confirm.title')}>
      <p role="status" className="card text-sm">
        {state === 'pending' && t('common.loading')}
        {state === 'done' && t('auth.confirm.done')}
        {state === 'failed' && t('auth.confirm.failed')}
      </p>
    </PublicCard>
  );
}
