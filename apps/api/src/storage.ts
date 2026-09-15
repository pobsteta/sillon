// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Stockage des photos. En production, le brief prévoit un stockage objet S3 hébergé dans
// l'UE ; l'interface ci-dessous s'y prête (une implémentation S3 remplace `LocalStorage`
// sans toucher aux routes). Par défaut, les fichiers vont dans un dossier local.

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

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

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

export function createStorage(): PhotoStorage {
  return new LocalStorage(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));
}
