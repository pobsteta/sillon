// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Envoi des courriels transactionnels : invitation, confirmation d'adresse,
// réinitialisation de mot de passe.
//
// Le transport est une dépendance injectée, pour trois raisons :
//   * les tests vérifient ce qui *part* sans serveur SMTP (`CaptureMailer`) ;
//   * en développement, le message s'affiche dans la console avec son lien, ce qui
//     suffit à dérouler un parcours sans configurer quoi que ce soit ;
//   * en production, `SmtpMailer` parle à un vrai serveur.
//
// Les envois passent par une file de fond (BullMQ) dès que `REDIS_URL` est configuré :
// `QueuedMailer` enveloppe le transport sans que les routes le sachent.

import { createTransport, type Transporter } from 'nodemailer';
import type { JobQueue } from './queue.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Transport SMTP. `url` suit la forme `smtps://utilisateur:motdepasse@serveur:465`. */
export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transporter = createTransport(url);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/**
 * Transport de développement : rien ne part, le message s'affiche. Le lien est imprimé
 * tel quel pour qu'on puisse le coller dans le navigateur.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.info) {}

  async send(message: MailMessage): Promise<void> {
    this.log(
      [
        '',
        '─── courriel non envoyé (transport console) ───',
        `  à      : ${message.to}`,
        `  objet  : ${message.subject}`,
        '',
        message.text.replace(/^/gm, '  '),
        '───────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  }
}

/** Transport de test : garde les messages en mémoire pour que les tests les inspectent. */
export class CaptureMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** Dernier message adressé à cette personne, `undefined` s'il n'y en a pas. */
  lastTo(address: string): MailMessage | undefined {
    return this.sent.filter((m) => m.to.toLowerCase() === address.toLowerCase()).at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Réglages de `QueuedMailer`, tous facultatifs : les défauts conviennent à la production. */
export interface QueuedMailerOptions {
  /** La file est-elle joignable tout de suite ? Sans réponse, on la suppose joignable. */
  joignable?: (() => boolean) | undefined;
  /** Au-delà, la mise en file est réputée perdue et le message part en direct. */
  delaiMs?: number | undefined;
  log?: ((error: unknown) => void) | undefined;
}

/**
 * Transport de production : le message part dans une file de fond, la requête rend la main
 * tout de suite. Un serveur SMTP lent ne ralentit plus ni l'inscription ni l'invitation.
 *
 * Si la file se dérobe — Redis arrêté, réseau coupé — on envoie quand même, en direct.
 * Perdre une invitation serait bien pire que rendre la main une seconde plus tard, et le
 * défaut serait silencieux. L'incident est journalisé pour qu'il ne passe pas inaperçu.
 *
 * Deux garde-fous, parce qu'un seul ne suffit pas :
 *
 *   * `joignable()` évite d'appeler la file quand la connexion n'est pas prête. C'est le
 *     cas courant d'un Redis arrêté, et c'est le seul qui garantisse l'absence de doublon :
 *     aucune commande n'est émise, donc rien ne pourra partir une seconde fois plus tard.
 *   * le délai couvre le reste — connexion perdue en cours de route, Redis qui ne répond
 *     plus. Il est indispensable : `Queue.add()` attend que la connexion soit prête avant
 *     d'émettre quoi que ce soit, et sans échéance cette attente est sans fin. La requête
 *     HTTP resterait suspendue, ce qui est exactement ce qu'on cherchait à éviter.
 */
export class QueuedMailer implements Mailer {
  private readonly joignable: () => boolean;
  private readonly delaiMs: number;
  private readonly log: (error: unknown) => void;

  constructor(
    private readonly queue: JobQueue<MailMessage>,
    private readonly fallback: Mailer,
    options: QueuedMailerOptions = {},
  ) {
    this.joignable = options.joignable ?? (() => true);
    this.delaiMs = options.delaiMs ?? 3_000;
    this.log =
      options.log ??
      ((error) => console.error('File des courriels indisponible, envoi direct :', error));
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.joignable()) {
      this.log(new Error('file des courriels injoignable'));
      await this.fallback.send(message);
      return;
    }

    try {
      await this.avecDelai(this.queue.add('envoi', message));
    } catch (error) {
      this.log(error);
      await this.fallback.send(message);
    }
  }

  private async avecDelai(promesse: Promise<unknown>): Promise<void> {
    let minuteur: NodeJS.Timeout | undefined;
    const echeance = new Promise<never>((_, rejette) => {
      minuteur = setTimeout(
        () => rejette(new Error(`mise en file sans réponse au bout de ${this.delaiMs} ms`)),
        this.delaiMs,
      );
    });
    try {
      // `race` a posé ses gestionnaires sur `promesse` : un rejet tardif reste traité.
      await Promise.race([promesse, echeance]);
    } finally {
      clearTimeout(minuteur);
    }
  }
}

export interface MailerConfig {
  SMTP_URL?: string | undefined;
  MAIL_FROM: string;
  NODE_ENV: string;
}

/**
 * Choisit le transport d'après la configuration. Sans `SMTP_URL`, on retombe sur la
 * console — et en production on le dit haut et fort, parce qu'une invitation qui ne
 * part pas est un défaut silencieux.
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.SMTP_URL) return new SmtpMailer(config.SMTP_URL, config.MAIL_FROM);
  if (config.NODE_ENV === 'production') {
    console.warn(
      'SMTP_URL absent : les courriels ne partiront pas. ' +
        'Invitations, confirmations et réinitialisations resteront sans effet.',
    );
  }
  return new ConsoleMailer();
}
