// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tests d'intégration de l'API, sur une vraie base PostgreSQL.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  mailbox,
  registerAccount,
  resetDatabase,
  tokenFromUrl,
  urlFromMail,
  type TestAccount,
} from './test-support.js';
import { disconnectPrisma, getPrisma } from './db.js';

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
  account = await registerAccount(app);
});

const headers = () => ({ cookie: account.cookie });
const farmUrl = (suffix: string) => `/api/farms/${account.farmId}${suffix}`;

async function firstCrop(name = 'Tomate') {
  const response = await app.inject({ method: 'GET', url: farmUrl('/crops'), headers: headers() });
  return response.json().find((crop: { name: string }) => crop.name === name);
}

async function createPlanting(overrides: Record<string, unknown> = {}) {
  const crop = await firstCrop();
  const response = await app.inject({
    method: 'POST',
    url: farmUrl('/plantings'),
    headers: headers(),
    payload: {
      cropId: crop.id,
      plantingType: 'transplant_raised',
      // 30 m de planche, 50 cm sur le rang, 2,5 kg au mètre, 300 graines par gramme —
      // exprimés dans les unités de stockage de Brinjel.
      length: 30_000,
      rows: 2,
      spacingPlants: 5_000,
      yieldPerBedMeter: 2_500,
      pricePerUnit: 320,
      seedsPerGram: 300_000,
      seedsPerHoleSeedling: 1,
      seedsExtraPercentage: 10,
      estimatedGreenhouseLoss: 10,
      sowingDate: '2026-03-01',
      durations: { days_to_transplant: 35, days_to_maturity: 60, harvest_window: 45 },
      ...overrides,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe('comptes et fermes', () => {
  it('crée un compte, sa ferme et son référentiel de départ', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: headers() });
    expect(me.statusCode).toBe(200);
    expect(me.json().farms).toHaveLength(1);
    expect(me.json().farms[0].role).toBe('owner');

    const families = await app.inject({
      method: 'GET',
      url: farmUrl('/families'),
      headers: headers(),
    });
    expect(families.json().length).toBeGreaterThan(5);

    const taskTypes = await app.inject({
      method: 'GET',
      url: farmUrl('/task-types'),
      headers: headers(),
    });
    expect(taskTypes.json().map((type: { name: string }) => type.name)).toContain('Semis');
  });

  it('refuse un accès sans session', async () => {
    const response = await app.inject({ method: 'GET', url: farmUrl('/plantings') });
    expect(response.statusCode).toBe(401);
  });

  it('refuse une inscription en double', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: account.email, password: 'un-autre-mot-de-passe' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('connecte puis déconnecte', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: account.email, password: 'graines-de-courgette-2026' },
    });
    expect(login.statusCode).toBe(200);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: account.email, password: 'mauvais' },
    });
    expect(wrong.statusCode).toBe(401);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: headers(),
    });
    expect(logout.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: headers() });
    expect(after.statusCode).toBe(401);
  });
});

describe('isolation entre fermes', () => {
  it('cache la ferme d’autrui derrière un 404 plutôt qu’un 403', async () => {
    const other = await registerAccount(app, { email: 'voisin@example.org' });
    const response = await app.inject({
      method: 'GET',
      url: `/api/farms/${other.farmId}/plantings`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(404);
  });

  it('exige un rôle de connexion ordinaire, sinon la RLS ne s’applique pas', async () => {
    // Un superutilisateur — ou un rôle BYPASSRLS — ignore toutes les politiques.
    // La base tournerait alors sans isolation, et le test suivant échouerait sans dire
    // pourquoi. C'est aussi la condition d'exploitation rappelée dans le README.
    const [role] = await getPrisma().$queryRaw<{ superuser: boolean; bypassrls: boolean }[]>`
      SELECT rolsuper AS superuser, rolbypassrls AS bypassrls
        FROM pg_roles WHERE rolname = current_user`;
    expect(role?.superuser, 'le rôle de DATABASE_URL ne doit pas être superutilisateur').toBe(
      false,
    );
    expect(role?.bypassrls, 'le rôle de DATABASE_URL ne doit pas avoir BYPASSRLS').toBe(false);
  });

  it('refuse une référence empruntée à une autre ferme', async () => {
    // Les clés étrangères sont globales : sans contrôle applicatif, PostgreSQL accepterait
    // une méthode de cette ferme rattachée à un type de tâche de la ferme voisine.
    const other = await registerAccount(app, { email: 'voisine2@example.org' });
    const foreignType = (
      await app.inject({
        method: 'GET',
        url: `/api/farms/${other.farmId}/task-types`,
        headers: { cookie: other.cookie },
      })
    ).json()[0];

    const refused = await app.inject({
      method: 'POST',
      url: farmUrl('/task-methods'),
      headers: headers(),
      payload: { name: 'Méthode empruntée', typeId: foreignType.id },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().details.kind).toBe('taskType');

    // Rien n'a été écrit : la ferme garde ses seules méthodes.
    const methods = await app.inject({
      method: 'GET',
      url: farmUrl('/task-methods'),
      headers: headers(),
    });
    expect(
      methods.json().some((method: { name: string }) => method.name === 'Méthode empruntée'),
    ).toBe(false);
  });

  it('refuse une série qui cite l’espèce d’une autre ferme', async () => {
    const other = await registerAccount(app, { email: 'voisine3@example.org' });
    const foreignCrop = (
      await app.inject({
        method: 'GET',
        url: `/api/farms/${other.farmId}/crops`,
        headers: { cookie: other.cookie },
      })
    ).json()[0];

    const refused = await app.inject({
      method: 'POST',
      url: farmUrl('/plantings'),
      headers: headers(),
      payload: {
        cropId: foreignCrop.id,
        plantingType: 'direct_seeded',
        length: 1000,
        rows: 1,
        spacingPlants: 25,
        sowingDate: '2026-04-01',
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().details.kind).toBe('crop');
  });

  it('la politique RLS filtre même une requête sans clause farm_id', async () => {
    await createPlanting();
    const other = await registerAccount(app, { email: 'voisine@example.org' });

    const prisma = getPrisma();
    const visible = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.farm_id', ${String(other.farmId)}, true)`;
      // Volontairement sans `where` : c'est PostgreSQL qui doit filtrer.
      return tx.planting.findMany({});
    });
    expect(visible).toHaveLength(0);

    const mine = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.farm_id', ${String(account.farmId)}, true)`;
      return tx.planting.findMany({});
    });
    expect(mine).toHaveLength(1);
  });
});

describe('plan de culture', () => {
  it('déroule les dates depuis le semis et les durées, récolte comprise', async () => {
    const planting = await createPlanting();
    // Trois dates seulement : la récolte n'en est pas une, elle devient une fenêtre.
    expect(planting.dates).toEqual({
      sowing: { planned: '2026-03-01', effective: null },
      planting: { planned: '2026-04-05', effective: null },
    });
    expect(planting.harvestPeriods).toEqual([{ begin: '2026-06-04', end: '2026-07-19' }]);
    expect(planting.fieldDate).toBe('2026-04-05');

    // 30000 mm × 10 / 5000 × 2 rangs = 120 alvéoles, 10 % de perte en pépinière.
    expect(planting.computed.holes).toBe(120);
    expect(planting.computed.seedlings).toBe(133);
    expect(planting.computed.seedsNumber).toBe(133);
    // 2,5 kg/m × 30 m = 75 kg, en millièmes d'unité ; 75 × 3,20 € = 240 €.
    expect(planting.computed.expectedYield).toBe(75_000);
    expect(planting.computed.expectedRevenue).toBe(24_000);
  });

  it('filtre, trie et cherche les séries', async () => {
    const carotte = await firstCrop('Carotte');
    await createPlanting();
    await createPlanting({
      cropId: carotte.id,
      plantingType: 'direct_seeded',
      sowingDate: '2026-05-01',
    });

    const all = await app.inject({ method: 'GET', url: farmUrl('/plantings'), headers: headers() });
    expect(all.json()).toHaveLength(2);

    const direct = await app.inject({
      method: 'GET',
      url: farmUrl('/plantings?plantingType=direct_seeded'),
      headers: headers(),
    });
    expect(direct.json()).toHaveLength(1);

    const search = await app.inject({
      method: 'GET',
      url: farmUrl('/plantings?search=carot'),
      headers: headers(),
    });
    expect(search.json()).toHaveLength(1);

    const sorted = await app.inject({
      method: 'GET',
      url: farmUrl('/plantings?sort=date&order=desc'),
      headers: headers(),
    });
    expect(sorted.json()[0].fieldDate).toBe('2026-05-01');
  });

  it('duplique une série en décalant les dates', async () => {
    const planting = await createPlanting();
    const response = await app.inject({
      method: 'POST',
      url: farmUrl(`/plantings/${planting.id}/duplicate`),
      headers: headers(),
      payload: { count: 3, intervalDays: 7 },
    });
    expect(response.statusCode).toBe(201);
    // Les copies décalent semis, plantation et fenêtre de récolte du même pas.
    expect(response.json().map((copy: { fieldDate: string }) => copy.fieldDate)).toEqual([
      '2026-04-12',
      '2026-04-19',
      '2026-04-26',
    ]);
    expect(response.json()[0].harvestPeriods).toEqual([{ begin: '2026-06-11', end: '2026-07-26' }]);
  });

  it('applique un traitement par lot (décalage et champs communs)', async () => {
    const first = await createPlanting();
    const second = await createPlanting();
    const response = await app.inject({
      method: 'PATCH',
      url: farmUrl('/plantings'),
      headers: headers(),
      payload: { ids: [first.id, second.id], shiftDays: 14, data: { pricePerUnit: 500 } },
    });
    expect(response.json()).toEqual({ updated: 2 });

    const list = await app.inject({
      method: 'GET',
      url: farmUrl('/plantings'),
      headers: headers(),
    });
    for (const planting of list.json()) {
      // Semis, plantation et fenêtre de récolte se décalent ensemble.
      expect(planting.dates.sowing.planned).toBe('2026-03-15');
      expect(planting.fieldDate).toBe('2026-04-19');
      expect(planting.harvestPeriods[0]).toEqual({ begin: '2026-06-18', end: '2026-08-02' });
      expect(Number(planting.pricePerUnit)).toBe(500);
    }
  });

  it('fournit les barres du diagramme de Gantt', async () => {
    await createPlanting();
    const response = await app.inject({
      method: 'GET',
      url: farmUrl('/gantt'),
      headers: headers(),
    });
    const [bar] = response.json();
    expect(bar.nursery).toEqual({ begin: '2026-03-01', end: '2026-04-05' });
    expect(bar.growing).toEqual({ begin: '2026-04-05', end: '2026-06-04' });
    expect(bar.harvest).toEqual([{ begin: '2026-06-04', end: '2026-07-19' }]);
  });

  it('interdit la modification à un membre en lecture', async () => {
    // Un membre simple peut saisir des récoltes mais pas toucher au plan de culture.
    const prisma = getPrisma();
    const guest = await registerAccount(app, { email: 'saisonnier@example.org' });
    await prisma.farmMembership.create({
      data: { farmId: account.farmId, userId: guest.userId, role: 'employee' },
    });
    const crop = await firstCrop();
    const response = await app.inject({
      method: 'POST',
      url: farmUrl('/plantings'),
      headers: { cookie: guest.cookie },
      payload: {
        cropId: crop.id,
        plantingType: 'direct_seeded',
        length: 100,
        rows: 1,
        spacingPlants: 10,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  /** Rattache un compte neuf à la ferme de l'essai avec le rôle demandé. */
  async function memberWithRole(role: string, email: string) {
    const guest = await registerAccount(app, { email });
    await getPrisma().farmMembership.create({
      data: { farmId: account.farmId, userId: guest.userId, role: role as never },
    });
    return guest;
  }

  it('laisse le saisonnier tenir le terrain : tâches et récoltes', async () => {
    // Le rôle `seasonal` existe pour ça ; une hiérarchie linéaire le mettait en dessous
    // de `employee` et lui renvoyait 403 sur tout (`Brinjel.Admin.Role`).
    const guest = await memberWithRole('seasonal', 'terrain@example.org');
    const cookie = { cookie: guest.cookie };

    for (const url of ['/tasks', '/harvests', '/notes', '/plantings', '/locations']) {
      const lecture = await app.inject({ method: 'GET', url: farmUrl(url), headers: cookie });
      expect(lecture.statusCode, `lecture ${url}`).toBe(200);
    }

    const planting = await createPlanting();
    const recolte = await app.inject({
      method: 'POST',
      url: farmUrl('/harvests'),
      headers: cookie,
      payload: { plantingId: planting.id, quantity: 12_000, date: '2026-07-01' },
    });
    expect(recolte.statusCode, 'saisie d’une récolte').toBe(201);

    // Il lit sa ferme, comme tout membre.
    const ferme = await app.inject({ method: 'GET', url: farmUrl(''), headers: cookie });
    expect(ferme.statusCode).toBe(200);
  });

  it('refuse les commandes au saisonnier et les accorde au consultant', async () => {
    // L'inversion exacte qu'une échelle de rôles ne sait pas exprimer.
    const saisonnier = await memberWithRole('seasonal', 'saisonnier-cmd@example.org');
    const consultant = await memberWithRole('consultant', 'consultant@example.org');

    const refus = await app.inject({
      method: 'GET',
      url: farmUrl('/orders'),
      headers: { cookie: saisonnier.cookie },
    });
    expect(refus.statusCode, 'le saisonnier ne voit pas les commandes').toBe(403);

    const accord = await app.inject({
      method: 'GET',
      url: farmUrl('/orders'),
      headers: { cookie: consultant.cookie },
    });
    expect(accord.statusCode, 'le consultant voit les commandes').toBe(200);
  });

  it('le consultant lit tout et ne saisit rien', async () => {
    const guest = await memberWithRole('consultant', 'consultant-lecture@example.org');
    const cookie = { cookie: guest.cookie };

    const lecture = await app.inject({ method: 'GET', url: farmUrl('/tasks'), headers: cookie });
    expect(lecture.statusCode).toBe(200);

    const planting = await createPlanting();
    const saisie = await app.inject({
      method: 'POST',
      url: farmUrl('/harvests'),
      headers: cookie,
      payload: { plantingId: planting.id, quantity: 1000, date: '2026-07-01' },
    });
    expect(saisie.statusCode, 'le consultant ne saisit pas de récolte').toBe(403);
  });

  /** Corps multipart minimal : un PNG de 1×1 pixel, suffisant pour franchir le contrôle de type. */
  function photoPayload(boundary: string) {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    return Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          'content-disposition: form-data; name="file"; filename="planche.png"\r\n' +
          'content-type: image/png\r\n\r\n',
      ),
      pixel,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  }

  it('laisse le saisonnier joindre une photo à sa note', async () => {
    // Une photo n'existe que rattachée à une note, et la matrice donne au saisonnier
    // `notes: [create, read, update, delete]`. Le garde-fou hiérarchique `employee` le
    // laissait écrire la note et lui refusait la photo qui la motive.
    const guest = await memberWithRole('seasonal', 'photo-saisonnier@example.org');
    const cookie = { cookie: guest.cookie };
    const boundary = 'sillon-essai-multipart';

    const televersement = await app.inject({
      method: 'POST',
      url: farmUrl('/photos'),
      headers: { ...cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: photoPayload(boundary),
    });
    expect(televersement.statusCode, 'le saisonnier téléverse').toBe(201);
    const photo = televersement.json();

    const note = await app.inject({
      method: 'POST',
      url: farmUrl('/notes'),
      headers: cookie,
      payload: { content: 'Limaces sur la planche 3', photoIds: [photo.id] },
    });
    expect(note.statusCode, 'et la joint à sa note').toBe(201);
    expect(note.json().photos).toHaveLength(1);

    // Et il relit l'image qu'il vient de déposer.
    const contenu = await app.inject({
      method: 'GET',
      url: farmUrl(`/photos/${photo.id}/content`),
      headers: cookie,
    });
    expect(contenu.statusCode, 'relecture de la photo').toBe(200);
    expect(contenu.rawPayload.length).toBeGreaterThan(0);
  });

  it('sert la photo sous son type, et pas en flux d’octets', async () => {
    // `helmet` pose `X-Content-Type-Options: nosniff` sur toutes les réponses. Sous cette
    // en-tête, un navigateur refuse d'afficher une image annoncée
    // `application/octet-stream` — ce que la route répondait, faute de connaître le type.
    // La vignette existait dans le code et restait blanche à l'écran.
    const guest = await memberWithRole('seasonal', 'photo-type@example.org');
    const cookie = { cookie: guest.cookie };
    const boundary = 'sillon-essai-multipart';

    const televersement = await app.inject({
      method: 'POST',
      url: farmUrl('/photos'),
      headers: { ...cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: photoPayload(boundary),
    });
    expect(televersement.statusCode).toBe(201);
    // Le PNG envoyé est réencodé : le stockage est homogène, le type n'est plus une devinette.
    expect(televersement.json().contentType).toBe('image/jpeg');

    const contenu = await app.inject({
      method: 'GET',
      url: farmUrl(`/photos/${televersement.json().id}/content`),
      headers: cookie,
    });
    expect(contenu.headers['content-type']).toBe('image/jpeg');
    expect(contenu.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuse un fichier qui n’est pas une image, quel que soit le type annoncé', async () => {
    const guest = await memberWithRole('seasonal', 'photo-fausse@example.org');
    const boundary = 'sillon-essai-multipart';
    const corps = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          'content-disposition: form-data; name="file"; filename="planche.png"\r\n' +
          'content-type: image/png\r\n\r\n',
      ),
      Buffer.from('%PDF-1.7 ceci n’est pas une photo'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const televersement = await app.inject({
      method: 'POST',
      url: farmUrl('/photos'),
      headers: {
        cookie: guest.cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: corps,
    });
    expect(televersement.statusCode, 'un PDF déguisé en PNG').toBe(400);
  });

  it('refuse la photo au consultant, qui ne tient pas de notes', async () => {
    // L'autre bord de la même règle : le consultant lit tout mais n'écrit aucune note.
    const guest = await memberWithRole('consultant', 'photo-consultant@example.org');
    const boundary = 'sillon-essai-multipart';

    const refus = await app.inject({
      method: 'POST',
      url: farmUrl('/photos'),
      headers: {
        cookie: guest.cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: photoPayload(boundary),
    });
    expect(refus.statusCode).toBe(403);
  });
});

describe('assolement', () => {
  /** Crée une planche ; `bedLength` est en millimètres, comme en base. */
  async function createBed(name: string, bedLength = 50_000) {
    const response = await app.inject({
      method: 'POST',
      url: farmUrl('/locations'),
      headers: headers(),
      payload: { name, bedLength, greenhouse: false },
    });
    return response.json();
  }

  it('maintient le chemin ltree de l’arbre', async () => {
    const garden = await createBed('Jardin', 0);
    const bed = await app.inject({
      method: 'POST',
      url: farmUrl('/locations'),
      headers: headers(),
      payload: { name: 'Planche A1', bedLength: 5000, parentId: garden.id, position: 3 },
    });
    expect(bed.statusCode).toBe(201);

    const paths = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.farm_id', ${String(account.farmId)}, true)`;
      return tx.$queryRaw<{ id: number; path: string }[]>`
        SELECT id, path::text AS path FROM locations ORDER BY id`;
    });
    expect(paths[0]!.path).toMatch(/^\d{5}$/);
    expect(paths[1]!.path).toBe(`${paths[0]!.path}.00003`);
  });

  it('refuse de déplacer un emplacement sous l’un de ses descendants', async () => {
    const garden = await createBed('Jardin nord', 0);
    const bed = await app.inject({
      method: 'POST',
      url: farmUrl('/locations'),
      headers: headers(),
      payload: { name: 'Planche A1', bedLength: 50_000, parentId: garden.id },
    });
    const child = bed.json();

    const cycle = await app.inject({
      method: 'PATCH',
      url: farmUrl(`/locations/${garden.id}`),
      headers: headers(),
      payload: { parentId: child.id },
    });
    expect(cycle.statusCode).toBe(400);

    const itself = await app.inject({
      method: 'PATCH',
      url: farmUrl(`/locations/${garden.id}`),
      headers: headers(),
      payload: { parentId: garden.id },
    });
    expect(itself.statusCode).toBe(400);

    // L'arbre est resté intact.
    const locations = await app.inject({
      method: 'GET',
      url: farmUrl('/locations'),
      headers: headers(),
    });
    expect(
      locations.json().find((location: { id: number }) => location.id === child.id).parentId,
    ).toBe(garden.id);
  });

  it('propose les emplacements disponibles et place la série', async () => {
    const planting = await createPlanting({ inGreenhouse: false });
    // 40 m et 20 m : la série de 30 m tient sur la première, pas sur la seconde.
    const bed = await createBed('Planche A1', 40_000);
    await createBed('Planche A2', 20_000);

    const available = await app.inject({
      method: 'GET',
      url: farmUrl(`/plantings/${planting.id}/available-locations`),
      headers: headers(),
    });
    const body = available.json();
    expect(body.requiredLength).toBe(30_000);
    expect(body.locations[0].bed.name).toBe('Planche A1');
    expect(body.locations[0].fits).toBe(true);
    expect(body.locations[1].fits).toBe(false);

    const placed = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${planting.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 30_000 }] },
    });
    expect(placed.statusCode).toBe(200);
    expect(placed.json().assignments).toHaveLength(1);
  });

  it('refuse un retour trop rapide de la même famille, sauf en forçant', async () => {
    const bed = await createBed('Planche A1');
    const first = await createPlanting();
    await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${first.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 10_000 }] },
    });

    // Même famille (solanacées, délai 4 ans) l'année suivante sur la même planche.
    const second = await createPlanting({ sowingDate: '2027-03-01' });
    const refused = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${second.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 10_000 }] },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().details.warnings[0].type).toBe('rotation');

    const forced = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${second.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 10_000 }], force: true },
    });
    expect(forced.statusCode).toBe(200);

    const history = await app.inject({
      method: 'GET',
      url: farmUrl(`/locations/${bed.id}/history`),
      headers: headers(),
    });
    expect(history.json()).toHaveLength(2);
  });
});

describe('tâches', () => {
  it('génère les tâches de semis et de plantation depuis le plan', async () => {
    const planting = await createPlanting();
    const response = await app.inject({
      method: 'POST',
      url: farmUrl(`/plantings/${planting.id}/generate-tasks`),
      headers: headers(),
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const dates = response
      .json()
      .map((task: { plannedDate: string }) => task.plannedDate.slice(0, 10));
    expect(dates).toEqual(['2026-03-01', '2026-04-05']);
  });

  it('applique un itinéraire technique puis recale les tâches quand la série bouge', async () => {
    const planting = await createPlanting();
    const types = await app.inject({
      method: 'GET',
      url: farmUrl('/task-types'),
      headers: headers(),
    });
    const weeding = types.json().find((type: { name: string }) => type.name === 'Désherbage');

    const template = await app.inject({
      method: 'POST',
      url: farmUrl('/task-templates'),
      headers: headers(),
      payload: {
        name: 'Itinéraire tomate',
        steps: [
          {
            typeId: weeding.id,
            linkDays: 20,
            // La mise en place au champ : plantation ici, semis pour un semis direct.
            templateDateType: 'field_sowing_planting',
            plannedLaborTime: 5400, // 1 h 30, en secondes
          },
        ],
      },
    });
    expect(template.statusCode).toBe(201);

    const applied = await app.inject({
      method: 'POST',
      url: farmUrl(`/plantings/${planting.id}/apply-template`),
      headers: headers(),
      payload: { taskTemplateId: template.json().id },
    });
    expect(applied.json()[0].plannedDate.slice(0, 10)).toBe('2026-04-25');

    // La série est décalée d'une semaine : la tâche liée suit.
    await app.inject({
      method: 'PATCH',
      url: farmUrl('/plantings'),
      headers: headers(),
      payload: { ids: [planting.id], shiftDays: 7 },
    });
    const rescheduled = await app.inject({
      method: 'POST',
      url: farmUrl(`/plantings/${planting.id}/reschedule-tasks`),
      headers: headers(),
      payload: {},
    });
    expect(rescheduled.json().rescheduled).toBe(1);

    const tasks = await app.inject({ method: 'GET', url: farmUrl('/tasks'), headers: headers() });
    expect(tasks.json()[0].plannedDate).toBe('2026-05-02');
  });

  it('valide des tâches en une requête et les remonte par semaine', async () => {
    const planting = await createPlanting();
    const generated = await app.inject({
      method: 'POST',
      url: farmUrl(`/plantings/${planting.id}/generate-tasks`),
      headers: headers(),
      payload: {},
    });
    const ids = generated.json().map((task: { id: number }) => task.id);

    // Le semis tombe le dimanche 1er mars : il appartient à la semaine du 23 février.
    const week = await app.inject({
      method: 'GET',
      url: farmUrl('/tasks?week=2026-02-25'),
      headers: headers(),
    });
    expect(week.json().map((task: { plannedDate: string }) => task.plannedDate)).toEqual([
      '2026-03-01',
    ]);

    const done = await app.inject({
      method: 'POST',
      url: farmUrl('/tasks/complete'),
      headers: headers(),
      payload: { ids, effectiveDate: '2026-03-02', effectiveLaborTime: 75 },
    });
    expect(done.json()).toEqual({ updated: 2 });

    const after = await app.inject({
      method: 'GET',
      url: farmUrl('/tasks?done=true'),
      headers: headers(),
    });
    expect(after.json()).toHaveLength(2);
    expect(after.json()[0].status).toBe('done');
  });
});

describe('commandes, récoltes et statistiques', () => {
  it('agrège la commande de semences et l’exporte en CSV', async () => {
    const planting = await createPlanting();
    const varieties = await app.inject({
      method: 'POST',
      url: farmUrl('/varieties'),
      headers: headers(),
      payload: {
        name: 'Marmande',
        cropId: planting.cropId,
        providerId: (
          await app.inject({ method: 'GET', url: farmUrl('/providers'), headers: headers() })
        ).json()[0].id,
      },
    });
    await app.inject({
      method: 'PATCH',
      url: farmUrl(`/plantings/${planting.id}`),
      headers: headers(),
      payload: { varietyId: varieties.json().id },
    });

    const orders = await app.inject({ method: 'GET', url: farmUrl('/orders'), headers: headers() });
    expect(orders.json().lines).toHaveLength(1);
    // 120 alvéoles, 1 graine chacune, 10 % de perte : 120 / 0,9 ≈ 133,3 graines.
    expect(orders.json().lines[0].seedsNumber).toBeCloseTo(133.33, 1);

    const csv = await app.inject({
      method: 'GET',
      url: farmUrl('/orders.csv'),
      headers: headers(),
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Marmande');
  });

  it('restreint la commande aux séries posées sur l’assolement', async () => {
    // La page Commandes envoyait `placedOnly`, que zod ignorait au profit de sa valeur
    // par défaut : la bascule « Séries placées uniquement » ne filtrait rien.
    await createPlanting();

    const complete = await app.inject({
      method: 'GET',
      url: farmUrl('/orders'),
      headers: headers(),
    });
    expect(complete.json().lines).toHaveLength(1);

    const posees = await app.inject({
      method: 'GET',
      url: farmUrl('/orders?assignedPlantingsOnly=true'),
      headers: headers(),
    });
    // Rien n'est posé sur une planche : la liste restreinte est vide.
    expect(posees.json().lines).toHaveLength(0);

    // Le nom d'origine ne doit surtout pas passer pour un filtre valide.
    const ancienNom = await app.inject({
      method: 'GET',
      url: farmUrl('/orders?placedOnly=true'),
      headers: headers(),
    });
    expect(ancienNom.json().lines).toHaveLength(1);
  });

  it('saisit des récoltes et les compare au prévisionnel', async () => {
    const planting = await createPlanting();
    // Quantités en millièmes d'unité : 20 kg puis 25 kg.
    for (const quantity of [20_000, 25_000]) {
      const response = await app.inject({
        method: 'POST',
        url: farmUrl('/harvests'),
        headers: headers(),
        payload: { plantingId: planting.id, date: '2026-06-20', quantity },
      });
      expect(response.statusCode).toBe(201);
    }

    const stats = await app.inject({
      method: 'GET',
      url: farmUrl('/stats?year=2026'),
      headers: headers(),
    });
    const body = stats.json();
    expect(body.plantings.total).toBe(1);
    expect(body.yields.expected).toBe(75_000);
    expect(body.yields.actual).toBe(45_000);
    expect(body.crops[0].comparison.differencePercentage).toBe(-40);
  });

  it('ne mélange pas deux unités de récolte pour une même espèce', async () => {
    const units = (
      await app.inject({ method: 'GET', url: farmUrl('/units'), headers: headers() })
    ).json();
    const kilos = units.find((unit: { name: string }) => unit.name === 'kg');
    const bottes = units.find((unit: { name: string }) => unit.name === 'botte');

    const enKilos = await createPlanting({ unitId: kilos.id, yieldPerBedMeter: 250 });
    const enBottes = await createPlanting({ unitId: bottes.id, yieldPerBedMeter: 40 });
    for (const [planting, quantity] of [
      [enKilos, 6000],
      [enBottes, 900],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: farmUrl('/harvests'),
        headers: headers(),
        payload: { plantingId: planting.id, date: '2026-06-20', quantity },
      });
    }

    const stats = await app.inject({
      method: 'GET',
      url: farmUrl('/stats?year=2026'),
      headers: headers(),
    });
    const lines = stats.json().crops;
    expect(lines).toHaveLength(2);
    expect(lines.map((line: { unitName: string }) => line.unitName).sort()).toEqual([
      'botte',
      'kg',
    ]);
    expect(lines.find((line: { unitName: string }) => line.unitName === 'kg').actualYield).toBe(
      6000,
    );
    expect(lines.find((line: { unitName: string }) => line.unitName === 'botte').actualYield).toBe(
      900,
    );
  });

  it('exporte toutes les données de la ferme', async () => {
    await createPlanting();
    const response = await app.inject({
      method: 'GET',
      url: farmUrl('/export'),
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('sillon-ferme-');
    expect(response.json().plantings).toHaveLength(1);
    expect(response.json().families.length).toBeGreaterThan(0);
  });
});

describe('courriels transactionnels', () => {
  const adresse = () => `courriel-${Math.random().toString(36).slice(2, 10)}@example.org`;

  async function demanderReinitialisation(email: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/password-reset',
      payload: { email },
    });
  }

  it("envoie un lien de confirmation à l'inscription", async () => {
    const email = adresse();
    await registerAccount(app, { email });

    const message = mailbox.lastTo(email);
    expect(message, 'un courriel doit partir').toBeDefined();
    expect(message!.subject).toContain('Confirmez');
    // Le lien figure en clair dans le texte brut, pour être copié à la main au besoin.
    const url = urlFromMail(message!.text);
    expect(url).toMatch(/^https:\/\/sillon\.example\/confirmation\//);

    const avant = await getPrisma().user.findUniqueOrThrow({ where: { email } });
    expect(avant.confirmedAt, "l'adresse n'est pas confirmée d'emblée").toBeNull();

    const confirme = await app.inject({
      method: 'POST',
      url: '/api/auth/confirm',
      payload: { token: tokenFromUrl(url) },
    });
    expect(confirme.statusCode).toBe(204);

    const apres = await getPrisma().user.findUniqueOrThrow({ where: { email } });
    expect(apres.confirmedAt).not.toBeNull();
  });

  it('un lien de confirmation ne sert qu’une fois', async () => {
    const email = adresse();
    await registerAccount(app, { email });
    const token = tokenFromUrl(urlFromMail(mailbox.lastTo(email)!.text));

    const premier = await app.inject({
      method: 'POST',
      url: '/api/auth/confirm',
      payload: { token },
    });
    expect(premier.statusCode).toBe(204);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/confirm',
      payload: { token },
    });
    expect(second.statusCode, 'le jeton est détruit après usage').toBe(400);
  });

  it('réinitialise un mot de passe et ferme les sessions ouvertes', async () => {
    const email = adresse();
    const compte = await registerAccount(app, { email });
    mailbox.clear();

    expect((await demanderReinitialisation(email)).statusCode).toBe(204);
    const message = mailbox.lastTo(email);
    expect(message!.subject).toContain('Réinitialiser');
    const token = tokenFromUrl(urlFromMail(message!.text));

    const nouveau = 'nouveau-mot-de-passe-2026';
    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { token, password: nouveau },
    });
    expect(change.statusCode).toBe(204);

    // La session d'avant ne vaut plus rien : reprendre la main déloge l'occupant.
    const ancienne = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: compte.cookie },
    });
    expect(ancienne.statusCode, 'les sessions tombent').toBe(401);

    const connexion = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: nouveau },
    });
    expect(connexion.statusCode, 'le nouveau mot de passe fonctionne').toBe(200);
  });

  it('ne dit pas si une adresse est inscrite', async () => {
    const inconnue = adresse();
    const reponse = await demanderReinitialisation(inconnue);
    expect(reponse.statusCode, 'même réponse que pour un compte connu').toBe(204);
    expect(mailbox.lastTo(inconnue), 'et aucun courriel ne part').toBeUndefined();
  });

  it('une nouvelle demande annule le lien précédent', async () => {
    const email = adresse();
    await registerAccount(app, { email });
    mailbox.clear();

    await demanderReinitialisation(email);
    const premier = tokenFromUrl(urlFromMail(mailbox.lastTo(email)!.text));
    await demanderReinitialisation(email);
    const second = tokenFromUrl(urlFromMail(mailbox.lastTo(email)!.text));
    expect(second).not.toBe(premier);

    const perime = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { token: premier, password: 'un-autre-mot-de-passe-2026' },
    });
    expect(perime.statusCode, 'le premier lien est mort').toBe(400);
  });

  it('un lien périmé est refusé', async () => {
    const email = adresse();
    await registerAccount(app, { email });
    mailbox.clear();
    await demanderReinitialisation(email);
    const token = tokenFromUrl(urlFromMail(mailbox.lastTo(email)!.text));

    // On vieillit le jeton au-delà de TOKEN_HOURS plutôt que d'attendre.
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email } });
    await getPrisma().userToken.updateMany({
      where: { userId: user.id, context: 'reset_password' },
      data: { insertedAt: new Date(Date.now() - 25 * 3_600_000) },
    });

    const reponse = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { token, password: 'encore-un-mot-de-passe-2026' },
    });
    expect(reponse.statusCode).toBe(400);
  });

  it("envoie l'invitation à la personne conviée", async () => {
    const invitee = adresse();
    mailbox.clear();
    const reponse = await app.inject({
      method: 'POST',
      url: farmUrl('/invitations'),
      headers: headers(),
      payload: { email: invitee, role: 'employee' },
    });
    expect(reponse.statusCode).toBe(201);

    const message = mailbox.lastTo(invitee);
    expect(message, 'le courriel part vraiment').toBeDefined();
    expect(message!.subject).toContain('Rejoindre la ferme');
    // Le lien porte le jeton de l'invitation, pas celui d'un compte.
    expect(urlFromMail(message!.text)).toBe(
      `https://sillon.example/invitation/${reponse.json().invitationId}`,
    );
    expect(message!.text, "l'invitant est nommé").toContain(account.email);
  });
});
