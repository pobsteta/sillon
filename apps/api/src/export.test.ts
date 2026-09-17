// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Export complet d'une ferme (§3.6). L'essai qui compte est celui du cloisonnement :
// la plupart des tables de liaison n'ont pas de `farm_id`, donc pas de politique RLS,
// et leur isolement ne tient qu'aux clauses écrites dans `EXPORT_TABLES`.

import { Prisma } from '@prisma/client';
import { unzipSync, strFromU8 } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  mailbox,
  registerAccount,
  resetDatabase,
  type TestAccount,
} from './test-support.js';
import { disconnectPrisma, getPrisma } from './db.js';
import { EXPORT_EXCLUSIONS, EXPORT_TABLES, archiveName, parTranches } from './export.js';

let app: FastifyInstance;
let account: TestAccount;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
});

beforeEach(async () => {
  await resetDatabase();
  mailbox.clear();
  account = await registerAccount(app, { farmName: 'Jardin des Sillons' });
});

const headers = () => ({ cookie: account.cookie });

/** Télécharge l'archive et la dépose en mémoire, fichier par fichier. */
async function fetchArchive(cookie: string, farmId = account.farmId) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/farms/${farmId}/export.zip`,
    headers: { cookie },
  });
  return response;
}

function entries(payload: Buffer): Record<string, string> {
  const files = unzipSync(new Uint8Array(payload));
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

/** Lit un fichier de l'archive, en disant lequel manque plutôt que d'échouer plus loin. */
function fichier(files: Record<string, string>, name: string): string {
  const found = files[name];
  if (found === undefined) throw new Error(`${name} absent de l’archive`);
  return found;
}

/** Lit un CSV de l'archive en colonnes nommées. Aucun champ de l'export ne contient de
 *  « ; » ni de retour ligne, donc une découpe simple suffit ici. */
function table(csv: string): Record<string, string>[] {
  const lines = csv
    .replace(/^\ufeff/, '')
    .trimEnd()
    .split('\r\n');
  const headers = (lines[0] ?? '').split(';');
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

async function firstCrop() {
  const response = await app.inject({
    method: 'GET',
    url: `/api/farms/${account.farmId}/crops`,
    headers: headers(),
  });
  return response.json()[0];
}

async function createPlanting(farm: TestAccount, cropId: number, overrides = {}) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/farms/${farm.farmId}/plantings`,
    headers: { cookie: farm.cookie },
    payload: {
      cropId,
      plantingType: 'direct_seeded',
      length: 30_000,
      rows: 2,
      spacingPlants: 500,
      // La date de semis fait naître les lignes filles — `planting_dates`,
      // `planting_durations`, `harvest_periods` — sans lesquelles l'essai de
      // cloisonnement ne testerait rien.
      sowingDate: '2026-03-15',
      ...overrides,
    },
  });
  if (response.statusCode !== 201) throw new Error(`Série refusée : ${response.body}`);
  return response.json();
}

describe('export complet de la ferme', () => {
  it('livre une archive avec un CSV par table et sa notice', async () => {
    const crop = await firstCrop();
    await createPlanting(account, crop.id);

    const response = await fetchArchive(account.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toContain('sillon-jardin-des-sillons-');
    // L'archive ne doit pas traîner dans un cache partagé : elle contient toute la ferme.
    expect(response.headers['cache-control']).toBe('private, no-store');

    const files = entries(response.rawPayload);
    for (const table of EXPORT_TABLES) {
      expect(Object.keys(files), `${table.file}.csv attendu`).toContain(`${table.file}.csv`);
    }
    expect(Object.keys(files)).toContain('LISEZMOI.txt');

    // Les unités sont indéchiffrables sans la notice : 30000 est une longueur en mm.
    expect(fichier(files, 'LISEZMOI.txt')).toContain('millimètres');
    expect(fichier(files, 'LISEZMOI.txt')).toContain('secondes');
    expect(fichier(files, 'series.csv')).toContain('30000');

    // Une table vide garde son en-tête, pour dire qu'elle existe et qu'elle est vide.
    expect(fichier(files, 'invitations.csv').trim().split('\r\n')).toHaveLength(1);
    expect(fichier(files, 'invitations.csv')).toContain('email');
  });

  it('ne laisse filtrer aucune ligne d’une autre ferme', async () => {
    // Le cœur de l'affaire. `planting_dates`, `harvest_periods`, `location_assignments`…
    // n'ont pas de colonne `farm_id` : aucune politique RLS ne les protège, seul le
    // filtrage par relation le fait. Un `COPY` brut, lui, exporterait les deux fermes.
    const crop = await firstCrop();
    const mienne = await createPlanting(account, crop.id);

    const autre = await registerAccount(app, {
      email: 'voisine@example.org',
      farmName: 'Ferme Voisine',
    });
    const autreCrop = await app.inject({
      method: 'GET',
      url: `/api/farms/${autre.farmId}/crops`,
      headers: { cookie: autre.cookie },
    });
    const voisine = await createPlanting(autre, autreCrop.json()[0].id, { length: 77_777 });

    const prisma = getPrisma();
    const datesVoisines = await prisma.plantingDate.findMany({ where: { plantingId: voisine.id } });
    expect(
      datesVoisines.length,
      'la voisine a bien des lignes filles à faire fuir',
    ).toBeGreaterThan(0);

    const response = await fetchArchive(account.cookie);
    const files = entries(response.rawPayload);

    expect(Object.values(files).join('\n')).not.toContain('Ferme Voisine');
    expect(Object.values(files).join('\n')).not.toContain('voisine@example.org');
    expect(fichier(files, 'series.csv'), 'la longueur de la série voisine').not.toContain('77777');

    // Toute table qui cite une série ne doit citer que les nôtres. C'est ce contrôle,
    // colonne par colonne, qui couvre les tables de liaison sans `farm_id`.
    let verifiees = 0;
    for (const [name, csv] of Object.entries(files)) {
      if (!name.endsWith('.csv')) continue;
      const rows = table(csv);
      const premiere = rows[0];
      if (premiere === undefined || !('plantingId' in premiere)) continue;
      verifiees += 1;
      for (const row of rows) {
        expect(row.plantingId, `${name} cite une série d’une autre ferme`).not.toBe(
          String(voisine.id),
        );
        expect(row.plantingId, `${name} cite une série inconnue`).toBe(String(mienne.id));
      }
    }
    expect(verifiees, 'des tables filles ont bien été inspectées').toBeGreaterThan(0);

    // Et nos propres lignes filles sont bien là : sans quoi l'essai passerait aussi
    // avec un export vide.
    expect(table(fichier(files, 'series_dates.csv')).length).toBeGreaterThan(0);
  });

  it('réserve l’export au propriétaire et au chef de culture', async () => {
    // Brinjel : `plug AuthorizeFarmAccess, [:owner, :manager]`.
    const invite = async (role: string, email: string) => {
      const guest = await registerAccount(app, { email });
      await getPrisma().farmMembership.create({
        data: { farmId: account.farmId, userId: guest.userId, role: role as never },
      });
      return guest;
    };

    const chef = await invite('manager', 'chef@example.org');
    expect((await fetchArchive(chef.cookie)).statusCode, 'chef de culture').toBe(200);

    for (const role of ['employee', 'seasonal', 'consultant']) {
      const membre = await invite(role, `${role}@example.org`);
      expect((await fetchArchive(membre.cookie)).statusCode, role).toBe(403);
    }
  });

  it('refuse l’export d’une ferme dont on n’est pas membre', async () => {
    const autre = await registerAccount(app, { email: 'etrangere@example.org' });
    const response = await fetchArchive(account.cookie, autre.farmId);
    expect(response.statusCode).toBe(404);
  });

  it('n’oublie aucune table rattachée à une ferme', async () => {
    // Garde-fou dans le temps : un modèle ajouté au schéma doit être exporté, ou inscrit
    // dans EXPORT_EXCLUSIONS avec sa raison. Sans cet essai, une table entière se
    // perdrait en silence le jour où quelqu'un l'ajoute.
    const exportes = new Set(EXPORT_TABLES.map((table) => table.model));
    const oublis: string[] = [];

    for (const model of Prisma.dmmf.datamodel.models) {
      const rattache = model.fields.some((field) => field.name === 'farmId');
      if (!rattache) continue;
      if (exportes.has(model.name)) continue;
      if (model.name in EXPORT_EXCLUSIONS) continue;
      oublis.push(model.name);
    }

    expect(oublis, `modèles ni exportés ni justifiés : ${oublis.join(', ')}`).toEqual([]);
  });

  it('compose un nom de fichier utilisable partout', async () => {
    const quand = new Date('2026-07-14T09:30:15.000Z');
    expect(archiveName('Jardin d’Été', quand)).toBe('sillon-jardin-d-ete-2026-07-14-09-30-15.zip');
    // Un nom qui ne laisserait aucun caractère ne doit pas produire « sillon--… ».
    expect(archiveName('🌱', quand)).toBe('sillon-ferme-2026-07-14-09-30-15.zip');
  });
});

describe('récupération par tranches', () => {
  it('préserve l’ordre malgré la concurrence', async () => {
    const recus: number[] = [];
    // Les premiers éléments mettent le plus de temps : sans garantie d'ordre, ils
    // arriveraient en dernier.
    await parTranches(
      [50, 40, 30, 20, 10, 0],
      3,
      async (attente) => {
        await new Promise((r) => setTimeout(r, attente));
        return attente;
      },
      (tranche) => recus.push(...tranche),
    );

    expect(recus).toEqual([50, 40, 30, 20, 10, 0]);
  });

  it('ne lance jamais plus que la taille de tranche à la fois', async () => {
    let enCours = 0;
    let pic = 0;

    await parTranches(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async (i) => {
        enCours += 1;
        pic = Math.max(pic, enCours);
        await new Promise((r) => setTimeout(r, 1));
        enCours -= 1;
        return i;
      },
      () => undefined,
    );

    // C'est tout l'objet du bornage : huit photos en mémoire, pas cinq cents.
    expect(pic).toBeLessThanOrEqual(4);
  });

  it('ne fait rien sur une liste vide', async () => {
    let appels = 0;

    await parTranches(
      [],
      4,
      async (x) => x,
      () => {
        appels += 1;
      },
    );

    expect(appels).toBe(0);
  });
});
