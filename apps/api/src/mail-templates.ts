// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Gabarits des trois courriels transactionnels, en français et en anglais.
//
// Chaque message part en texte brut ET en HTML : le texte reste lisible dans un client
// qui refuse le HTML, et le lien y figure en clair pour être copié à la main. Le HTML
// est volontairement minimal — pas de feuille de style externe, pas d'image distante,
// rien qui demande à charger quoi que ce soit pour être compris.

import type { MailMessage } from './mail.js';

type Locale = 'fr' | 'en';

/** `fr` sauf mention explicite de l'anglais : c'est la langue du projet. */
function pickLocale(locale: string | null | undefined): Locale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Enveloppe HTML commune. Le lien apparaît deux fois — en bouton et en clair — parce
 * qu'un client qui n'affiche pas les liens cliquables ne doit pas rendre le message
 * inutilisable.
 */
function wrap(title: string, body: string, action: { label: string; url: string }): string {
  const url = escapeHtml(action.url);
  return [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f2;',
    'font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f1d19">',
    '<div style="max-width:32rem;margin:0 auto;background:#fff;border-radius:12px;padding:24px">',
    `<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>`,
    body,
    `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;`,
    'background:#4d7c2f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">',
    `${escapeHtml(action.label)}</a></p>`,
    `<p style="margin:0;font-size:13px;color:#6b6659">${escapeHtml(action.url)}</p>`,
    '</div></body></html>',
  ].join('');
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('');
}

export interface InvitationMail {
  to: string;
  locale?: string | null | undefined;
  farmName: string;
  inviterEmail: string;
  url: string;
}

export function invitationMail(input: InvitationMail): MailMessage {
  const ferme = input.farmName;
  if (pickLocale(input.locale) === 'en') {
    const lines = [
      `${input.inviterEmail} invites you to join the farm “${ferme}” on Sillon.`,
      'Sillon is free software for planning and tracking market-garden crops.',
      'If you were not expecting this invitation, simply ignore this message.',
    ];
    return {
      to: input.to,
      subject: `Join the farm “${ferme}” on Sillon`,
      text: `${lines.join('\n\n')}\n\n${input.url}\n`,
      html: wrap(`Join “${ferme}”`, paragraphs(lines), {
        label: 'Accept the invitation',
        url: input.url,
      }),
    };
  }
  const lines = [
    `${input.inviterEmail} vous invite à rejoindre la ferme « ${ferme} » sur Sillon.`,
    'Sillon est un logiciel libre de planification et de suivi des cultures maraîchères.',
    "Si vous n'attendiez pas cette invitation, ignorez simplement ce message.",
  ];
  return {
    to: input.to,
    subject: `Rejoindre la ferme « ${ferme} » sur Sillon`,
    text: `${lines.join('\n\n')}\n\n${input.url}\n`,
    html: wrap(`Rejoindre « ${ferme} »`, paragraphs(lines), {
      label: "Accepter l'invitation",
      url: input.url,
    }),
  };
}

export interface TokenMail {
  to: string;
  locale?: string | null | undefined;
  url: string;
  /** Durée de validité du lien, en heures. */
  validityHours: number;
}

export function confirmationMail(input: TokenMail): MailMessage {
  if (pickLocale(input.locale) === 'en') {
    const lines = [
      'Confirm your email address to finish setting up your Sillon account.',
      `This link is valid for ${input.validityHours} hours.`,
      'If you did not create an account, ignore this message.',
    ];
    return {
      to: input.to,
      subject: 'Confirm your Sillon address',
      text: `${lines.join('\n\n')}\n\n${input.url}\n`,
      html: wrap('Confirm your address', paragraphs(lines), {
        label: 'Confirm my address',
        url: input.url,
      }),
    };
  }
  const lines = [
    'Confirmez votre adresse électronique pour terminer la création de votre compte Sillon.',
    `Ce lien est valable ${input.validityHours} heures.`,
    "Si vous n'avez pas créé de compte, ignorez ce message.",
  ];
  return {
    to: input.to,
    subject: 'Confirmez votre adresse Sillon',
    text: `${lines.join('\n\n')}\n\n${input.url}\n`,
    html: wrap('Confirmez votre adresse', paragraphs(lines), {
      label: 'Confirmer mon adresse',
      url: input.url,
    }),
  };
}

export function passwordResetMail(input: TokenMail): MailMessage {
  if (pickLocale(input.locale) === 'en') {
    const lines = [
      'You asked to reset your Sillon password.',
      `This link is valid for ${input.validityHours} hours and can be used once.`,
      'If you did not ask for this, ignore this message: your password stays unchanged.',
    ];
    return {
      to: input.to,
      subject: 'Reset your Sillon password',
      text: `${lines.join('\n\n')}\n\n${input.url}\n`,
      html: wrap('Reset your password', paragraphs(lines), {
        label: 'Choose a new password',
        url: input.url,
      }),
    };
  }
  const lines = [
    'Vous avez demandé à réinitialiser votre mot de passe Sillon.',
    `Ce lien est valable ${input.validityHours} heures et ne sert qu'une fois.`,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  ];
  return {
    to: input.to,
    subject: 'Réinitialiser votre mot de passe Sillon',
    text: `${lines.join('\n\n')}\n\n${input.url}\n`,
    html: wrap('Réinitialiser votre mot de passe', paragraphs(lines), {
      label: 'Choisir un nouveau mot de passe',
      url: input.url,
    }),
  };
}
