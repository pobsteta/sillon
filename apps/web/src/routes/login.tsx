// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/locale.js';
import { ApiError, api, clearApiCache } from '../lib/api.js';
import { Field, PasswordField } from '../components/ui.js';

function SillonMark() {
  return (
    <div className="login-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path
          d="M8 19c12 0 19 5 24 13 5-8 12-13 24-13"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M8 31c12 0 19 5 24 13 5-8 12-13 24-13"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".72"
        />
        <path
          d="M8 43c12 0 19 5 24 13 5-8 12-13 24-13"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".42"
        />
      </svg>
    </div>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 3.5C11 3.8 5.4 7.4 5.4 13.2c0 3.5 2.4 5.8 5.5 5.8 5.6 0 9-5.8 9.6-15.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M4 21c2.1-4.3 5.5-7.4 10.4-9.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  const [totpCode, setTotpCode] = useState('');
  const [totpRequis, setTotpRequis] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await api('/api/auth/login', {
          method: 'POST',
          body: { email, password, totpCode: totpCode || undefined },
        });
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
      await clearApiCache();
      await queryClient.invalidateQueries();
      await navigate({ to: '/' });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'totp_required') {
        setTotpRequis(true);
        setError(null);
      } else {
        setError(cause instanceof ApiError ? cause.message : t('common.error'));
      }
      setTotpCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div className="login-visual-grid" />
        <div className="login-sun" />
        <div className="login-horizon">
          <span className="login-tree login-tree-a" />
          <span className="login-tree login-tree-b" />
          <span className="login-tree login-tree-c" />
          <span className="login-tree login-tree-d" />
        </div>
        <div className="login-field-lines">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="login-visual-content">
          <div className="flex items-center gap-3">
            <SillonMark />
            <div>
              <div className="text-2xl font-semibold tracking-tight">Sillon</div>
              <div className="text-sm opacity-75">{t('app.tagline')}</div>
            </div>
          </div>
          <div className="mt-auto max-w-xl">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] opacity-75">
              <LeafIcon />
              <span>Votre ferme, au fil des saisons</span>
            </div>
            <p className="text-4xl font-semibold leading-[1.08] tracking-tight lg:text-5xl">
              Cultiver mieux.
              <br />
              Planifier simplement.
            </p>
            <p className="mt-5 max-w-lg text-base leading-7 opacity-80">
              Un espace de travail pensé pour le maraîchage : plan de culture, tâches, assolement,
              commandes et récoltes réunis au même endroit.
            </p>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-top">
          <div className="flex items-center gap-2 text-sm font-medium text-sillon-700 dark:text-sillon-300">
            <span className="login-mobile-mark">
              <SillonMark />
            </span>
            {t('app.name')}
          </div>
          <select
            aria-label={t('common.language')}
            className="login-language"
            value={i18n.resolvedLanguage}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
        </div>

        <div className="login-form-wrap">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-earth-900 dark:text-earth-50">
              {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-earth-700 dark:text-earth-200">
              {t('auth.welcome')}
            </p>
          </div>

          <form className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
            <Field
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <PasswordField
              label={t('auth.password')}
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

            {totpRequis && mode === 'signIn' ? (
              <Field
                label={t('auth.totpCode')}
                hint={t('auth.totpHint')}
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                required
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            ) : null}

            {error ? (
              <p role="alert" className="login-error">
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full login-submit" disabled={busy}>
              {busy ? t('common.loading') : t(`auth.${mode}`)}
              {!busy ? (
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M4 10h11M10.5 5.5 15 10l-4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>

            <div className="login-divider">
              <span>ou</span>
            </div>

            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                setError(null);
                setTotpRequis(false);
                setTotpCode('');
              }}
            >
              {mode === 'signIn' ? t('auth.noAccount') : t('auth.hasAccount')}
            </button>

            {mode === 'signIn' ? (
              <Link to="/mot-de-passe-oublie" className="login-forgot">
                {t('auth.forgotten.link')}
              </Link>
            ) : null}
          </form>
        </div>

        <div className="login-footer">
          <span>{t('auth.credits')}</span>
          <span className="login-secure">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect
                x="4.5"
                y="8.5"
                width="11"
                height="8"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M7 8.5V6.7a3 3 0 0 1 6 0v1.8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            Connexion sécurisée
          </span>
        </div>
      </section>
    </main>
  );
}
