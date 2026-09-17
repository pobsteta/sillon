// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Stockage des photos. Le brief veut un stockage objet S3 hébergé dans l'UE (Scaleway, OVH,
// Hetzner) ; c'est `S3Storage` dès que `S3_BUCKET` est configuré. Sans lui, les fichiers
// vont dans un dossier local, ce qui suffit au développement et à un hébergement modeste.
//
// Les deux implémentations partagent la même interface, et les routes ne savent pas
// laquelle elles ont sous la main.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { Env } from './env.js';

export interface PhotoStorage {
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements PhotoStorage {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    // Le nom d'objet est un UUID généré par l'API : aucun chemin ne vient du client.
    const full = resolve(this.root, key);
    if (!full.startsWith(resolve(this.root))) throw new Error('Clé de stockage invalide');
    return full;
  }

  async put(key: string, content: Buffer): Promise<void> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  // `async` plutôt qu'un renvoi direct : `path()` lève, et une méthode qui annonce une
  // promesse doit rejeter, pas exploser à l'appel. Sinon un `.catch()` ne voit rien passer.
  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

/**
 * Stockage objet S3. Vise n'importe quel service compatible, pas seulement AWS : c'est tout
 * l'intérêt pour un hébergement européen.
 *
 * `forcePathStyle` mérite un mot. Les URL S3 existent en deux formes, `bucket.serveur/clé`
 * et `serveur/bucket/clé`. AWS a retiré la seconde, plusieurs services européens n'ont
 * jamais bien servi la première, et MinIO — l'outil qu'on lance en local pour essayer —
 * ne connaît qu'elle. D'où un réglage explicite plutôt qu'une supposition.
 */
export class S3Storage implements PhotoStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: S3ClientConfig,
    /** Préfixe commun des clés, pour partager un seau entre plusieurs déploiements. */
    private readonly prefix = '',
  ) {
    this.client = new S3Client(config);
  }

  private objet(key: string): string {
    return this.prefix ? `${this.prefix.replace(/\/+$/, '')}/${key}` : key;
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objet(key),
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const reponse = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objet(key) }),
    );
    if (!reponse.Body) throw new Error(`Objet vide : ${this.objet(key)}`);
    // `transformToByteArray` évite d'assembler le flux à la main et gère Node comme le
    // navigateur ; le tampon reste en mémoire, ce que la taille d'une photo autorise.
    return Buffer.from(await reponse.Body.transformToByteArray());
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objet(key) }));
  }
}

/** Choisit le stockage d'après la configuration : S3 s'il est décrit, dossier local sinon. */
export function createStorage(env: Env): PhotoStorage {
  if (!env.S3_BUCKET) return new LocalStorage(env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));

  const config: S3ClientConfig = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    // Sans clés explicites, le client suit sa chaîne habituelle (variables d'environnement,
    // rôle de la machine) : un déploiement qui s'authentifie autrement n'a rien à déclarer.
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  };
  return new S3Storage(env.S3_BUCKET, config, env.S3_PREFIX ?? '');
}
