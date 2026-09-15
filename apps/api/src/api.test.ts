// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tests d'intégration de l'API, sur une vraie base PostgreSQL.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerAccount, resetDatabase, type TestAccount } from './test-support.js';
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
      length: 3000,
      rows: 2,
      spacingPlants: 50,
      yieldPerBedMeter: 250,
      pricePerUnit: 320,
      seedsPerGram: 300,
      seedsPerHoleSeedling: 1,
      seedsExtraPercentage: 10,
      estimatedGreenhouseLoss: 10,
      anchorDate: '2026-03-01',
      durations: { greenhouse: 35, to_harvest: 60, harvest: 45 },
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
  it('déroule les dates depuis l’ancre et les durées, et calcule les semences', async () => {
    const planting = await createPlanting();
    expect(planting.dates).toEqual({
      greenhouse_sowing: { planned: '2026-03-01', effective: null },
      sowing_planting: { planned: '2026-04-05', effective: null },
      harvest_begin: { planned: '2026-06-04', effective: null },
      harvest_end: { planned: '2026-07-19', effective: null },
    });
    expect(planting.computed.plantCount).toBe(120);
    expect(planting.computed.seedCount).toBe(148);
    expect(planting.computed.expectedYield).toBe(7500);
    expect(planting.computed.expectedRevenue).toBe(2_400_000);
  });

  it('filtre, trie et cherche les séries', async () => {
    const carotte = await firstCrop('Carotte');
    await createPlanting();
    await createPlanting({
      cropId: carotte.id,
      plantingType: 'direct_seed',
      anchorDate: '2026-05-01',
    });

    const all = await app.inject({ method: 'GET', url: farmUrl('/plantings'), headers: headers() });
    expect(all.json()).toHaveLength(2);

    const direct = await app.inject({
      method: 'GET',
      url: farmUrl('/plantings?plantingType=direct_seed'),
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
    expect(sorted.json()[0].anchorDate).toBe('2026-05-01');
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
    expect(response.json().map((copy: { anchorDate: string }) => copy.anchorDate)).toEqual([
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
    ]);
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
      expect(planting.anchorDate).toBe('2026-03-15');
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
    expect(bar.harvest).toEqual({ begin: '2026-06-04', end: '2026-07-19' });
  });

  it('interdit la modification à un membre en lecture', async () => {
    // Un membre simple peut saisir des récoltes mais pas toucher au plan de culture.
    const prisma = getPrisma();
    const guest = await registerAccount(app, { email: 'saisonnier@example.org' });
    await prisma.farmMembership.create({
      data: { farmId: account.farmId, userId: guest.userId, role: 'member' },
    });
    const crop = await firstCrop();
    const response = await app.inject({
      method: 'POST',
      url: farmUrl('/plantings'),
      headers: { cookie: guest.cookie },
      payload: {
        cropId: crop.id,
        plantingType: 'direct_seed',
        length: 100,
        rows: 1,
        spacingPlants: 10,
      },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('assolement', () => {
  async function createBed(name: string, bedLength = 5000) {
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

  it('propose les emplacements disponibles et place la série', async () => {
    const planting = await createPlanting({ inGreenhouse: false });
    const bed = await createBed('Planche A1', 4000);
    await createBed('Planche A2', 2000);

    const available = await app.inject({
      method: 'GET',
      url: farmUrl(`/plantings/${planting.id}/available-locations`),
      headers: headers(),
    });
    const body = available.json();
    expect(body.requiredLength).toBe(3000);
    expect(body.locations[0].bed.name).toBe('Planche A1');
    expect(body.locations[0].fits).toBe(true);
    expect(body.locations[1].fits).toBe(false);

    const placed = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${planting.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 3000 }] },
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
      payload: { assignments: [{ locationId: bed.id, length: 1000 }] },
    });

    // Même famille (solanacées, délai 4 ans) l'année suivante sur la même planche.
    const second = await createPlanting({ anchorDate: '2027-03-01' });
    const refused = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${second.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 1000 }] },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().details.warnings[0].type).toBe('rotation');

    const forced = await app.inject({
      method: 'PUT',
      url: farmUrl(`/plantings/${second.id}/assignments`),
      headers: headers(),
      payload: { assignments: [{ locationId: bed.id, length: 1000 }], force: true },
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
            templateDateType: 'sowing_planting',
            plannedLaborTime: 90,
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
    expect(orders.json().lines[0].seedCount).toBe(148);

    const csv = await app.inject({
      method: 'GET',
      url: farmUrl('/orders.csv'),
      headers: headers(),
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Marmande');
  });

  it('saisit des récoltes et les compare au prévisionnel', async () => {
    const planting = await createPlanting();
    for (const quantity of [2000, 2500]) {
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
    expect(body.yields.expected).toBe(7500);
    expect(body.yields.actual).toBe(4500);
    expect(body.crops[0].comparison.differencePercentage).toBe(-40);
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
