// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { ApiError, api, clearApiCache } from '../lib/api.js';
import { Field } from '../components/ui.js';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await api('/api/auth/login', { method: 'POST', body: { email, password } });
      } else {
        await api('/api/auth/register', {
          method: 'POST',
          body: {
            email,
            password,
            farmName: farmName || undefined,
            locale: locale === 'en' ? 'en' : 'fr',
          },
        });
      }
      // Un autre compte a pu se servir de cet appareil : ses réponses mises en cache par
      // le service worker ne doivent pas ressortir hors ligne sous cette session.
      await clearApiCache();
      await queryClient.invalidateQueries();
      await navigate({ to: '/' });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-sillon-700 dark:text-sillon-300">
          {t('app.name')}
        </h1>
        <p className="mt-1 text-earth-700 dark:text-earth-200">{t('auth.welcome')}</p>
      </div>

      <form className="card space-y-4" onSubmit={submit} noValidate>
        <Field
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label={t('auth.password')}
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signUp' ? 10 : undefined}
          hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mode === 'signUp' ? (
          <Field
            label={t('auth.farmName')}
            value={farmName}
            onChange={(event) => setFarmName(event.target.value)}
          />
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('common.loading') : t(`auth.${mode}`)}
        </button>

        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          {mode === 'signIn' ? t('auth.noAccount') : t('auth.hasAccount')}
        </button>

        {mode === 'signIn' ? (
          <Link to="/mot-de-passe-oublie" className="btn-ghost w-full">
            {t('auth.forgotten.link')}
          </Link>
        ) : null}
      </form>

      <div className="flex items-center justify-between gap-3 text-xs text-earth-700 dark:text-earth-200">
        <p>{t('auth.credits')}</p>
        <select
          aria-label={t('common.language')}
          className="field max-w-28 text-xs"
          value={i18n.resolvedLanguage}
          onChange={(event) => void i18n.changeLanguage(event.target.value)}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
    </main>
  );
}
