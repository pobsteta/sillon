// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Second facteur (§6 du brief : « TOTP optionnel »), dans les réglages du compte.
//
// L'enrôlement se fait en deux temps, et c'est délibéré : le secret est d'abord préparé
// sans être actif, puis un premier code l'active. Activer d'emblée enfermerait dehors qui
// aurait mal recopié le secret ou mal réglé l'horloge de son téléphone.
//
// Le secret s'affiche en toutes lettres à côté du QR code. Ce n'est pas une facilité de
// développement : au champ, on scanne ; au bureau, sur un poste sans caméra, on recopie.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { Field } from './ui.js';

interface EtatTotp {
  enabled: boolean;
  recoveryCodesLeft: number;
}

interface Preparation {
  uri: string;
  secret: string;
}

export function SecondFactor() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [codesSecours, setCodesSecours] = useState<string[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const etat = useQuery({
    queryKey: ['totp'],
    queryFn: () => api<EtatTotp>('/api/auth/totp'),
  });

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    setOccupe(true);
    try {
      await action();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setOccupe(false);
    }
  };

  const preparer = () =>
    agir(async () => {
      setPreparation(await api<Preparation>('/api/auth/totp/setup', { method: 'POST' }));
      setCodesSecours(null);
    });

  const activer = () =>
    agir(async () => {
      const reponse = await api<{ recoveryCodes: string[] }>('/api/auth/totp/enable', {
        method: 'POST',
        body: { code },
      });
      setPreparation(null);
      setCode('');
      // Montrés une fois et une seule : ils sont hachés en base, personne ne les relira.
      setCodesSecours(reponse.recoveryCodes);
      await queryClient.invalidateQueries({ queryKey: ['totp'] });
    });

  const desactiver = () =>
    agir(async () => {
      await api('/api/auth/totp/disable', { method: 'POST', body: { password: motDePasse } });
      setMotDePasse('');
      setCodesSecours(null);
      await queryClient.invalidateQueries({ queryKey: ['totp'] });
    });

  const actif = etat.data?.enabled ?? false;

  return (
    <section className="card mt-6">
      <h2 className="mb-1 text-lg font-semibold">{t('totp.title')}</h2>
      <p className="mb-3 text-sm text-earth-700 dark:text-earth-200">{t('totp.intro')}</p>

      {erreur ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-100 p-3 text-sm text-red-900">
          {erreur}
        </p>
      ) : null}

      {codesSecours ? (
        <div className="mb-4 rounded-lg border border-sillon-300 p-3">
          <p className="text-sm font-semibold">{t('totp.recoveryTitle')}</p>
          <p className="mt-1 text-xs text-earth-700 dark:text-earth-200">
            {t('totp.recoveryHint')}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm tabular-nums">
            {codesSecours.map((secours) => (
              <li key={secours}>{secours}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {actif ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t('totp.enabled')}{' '}
            <span className="text-earth-700 dark:text-earth-200">
              {t('totp.recoveryLeft', { count: etat.data?.recoveryCodesLeft ?? 0 })}
            </span>
          </p>
          {/* Le mot de passe est redemandé : une session ouverte sur un poste laissé sans
              surveillance ne doit pas suffire à retirer la protection. */}
          <Field
            label={t('totp.confirmPassword')}
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            disabled={occupe || motDePasse.length === 0}
            onClick={() => void desactiver()}
          >
            {t('totp.disable')}
          </button>
        </div>
      ) : preparation ? (
        <div className="space-y-3">
          <p className="text-sm">{t('totp.scan')}</p>
          {/* Le QR code est rendu par l'application d'authentification à partir de l'URI ;
              faute de caméra, le secret se recopie à la main juste en dessous. */}
          <p className="break-all rounded-lg bg-earth-100 p-2 font-mono text-xs dark:bg-earth-700">
            {preparation.secret}
          </p>
          <a className="btn-ghost inline-block" href={preparation.uri}>
            {t('totp.openApp')}
          </a>
          <Field
            label={t('totp.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={occupe || code.length < 6}
              onClick={() => void activer()}
            >
              {t('totp.enable')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPreparation(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={occupe}
          onClick={() => void preparer()}
        >
          {t('totp.setup')}
        </button>
      )}
    </section>
  );
}
