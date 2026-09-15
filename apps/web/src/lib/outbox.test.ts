// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// File d'attente hors ligne : c'est elle qui garantit qu'une récolte saisie au champ
// n'est pas perdue. IndexedDB est remplacé par une carte en mémoire.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('./idb.js', () => ({
  idbGet: async (key: string) => store.get(key),
  idbSet: async (key: string, value: unknown) => void store.set(key, value),
  idbDelete: async (key: string) => void store.delete(key),
}));

const { enqueue, flushOutbox, readOutbox } = await import('./outbox.js');

const response = (status: number) => new Response(null, { status });

beforeEach(() => {
  store.clear();
});

describe('file d’attente hors ligne', () => {
  it('conserve les saisies dans l’ordre', async () => {
    await enqueue({ method: 'POST', url: '/api/a', body: { q: 1 }, label: 'Récolte' });
    await enqueue({ method: 'POST', url: '/api/b', body: { q: 2 }, label: 'Tâche' });

    const entries = await readOutbox();
    expect(entries.map((entry) => entry.url)).toEqual(['/api/a', '/api/b']);
    expect(entries[0]!.queuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejoue puis vide la file quand le réseau revient', async () => {
    await enqueue({ method: 'POST', url: '/api/a', label: 'Récolte' });
    await enqueue({ method: 'PATCH', url: '/api/b', label: 'Tâche' });

    const sent: string[] = [];
    const result = await flushOutbox(async (entry) => {
      sent.push(`${entry.method} ${entry.url}`);
      return response(200);
    });

    expect(sent).toEqual(['POST /api/a', 'PATCH /api/b']);
    expect(result).toEqual({ sent: 2, dropped: 0 });
    expect(await readOutbox()).toHaveLength(0);
  });

  it('s’arrête à la première panne réseau et garde le reste', async () => {
    await enqueue({ method: 'POST', url: '/api/a', label: 'Récolte' });
    await enqueue({ method: 'POST', url: '/api/b', label: 'Récolte' });

    let call = 0;
    const result = await flushOutbox(async () => {
      call += 1;
      if (call === 2) throw new TypeError('Failed to fetch');
      return response(201);
    });

    expect(result.sent).toBe(1);
    expect((await readOutbox()).map((entry) => entry.url)).toEqual(['/api/b']);
  });

  it('abandonne une saisie refusée pour ne pas bloquer les suivantes', async () => {
    await enqueue({ method: 'POST', url: '/api/refuse', label: 'Récolte' });
    await enqueue({ method: 'POST', url: '/api/ok', label: 'Récolte' });

    const result = await flushOutbox(async (entry) =>
      response(entry.url.endsWith('refuse') ? 422 : 200),
    );

    expect(result).toEqual({ sent: 1, dropped: 1 });
    expect(await readOutbox()).toHaveLength(0);
  });

  it('réessaie plus tard quand le serveur est en panne', async () => {
    await enqueue({ method: 'POST', url: '/api/a', label: 'Récolte' });
    const result = await flushOutbox(async () => response(503));
    expect(result.sent).toBe(0);
    expect(await readOutbox()).toHaveLength(1);
  });
});
