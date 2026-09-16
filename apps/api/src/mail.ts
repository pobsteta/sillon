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
// Le brief prévoit que les envois passeront un jour par une file de fond (BullMQ) ;
// l'interface ci-dessous s'y prête sans toucher aux routes.

import { createTransport, type Transporter } from 'nodemailer';

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
