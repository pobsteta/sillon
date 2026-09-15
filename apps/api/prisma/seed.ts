// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Jeu de démonstration : un compte, une ferme, son référentiel, un jardin de six planches
// et quelques séries réalistes de la saison en cours. `npm run db:seed -w @sillon/api`.

import { PrismaClient } from '@prisma/client';
import { addDays, deriveDates, PlantingType } from '@sillon/core';
import { hashPassword } from '../src/auth.js';
import { createFarm } from '../src/farm-setup.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'maraichere@example.org';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'sillon-demonstration';

interface DemoSeries {
  crop: string;
  variety: string;
  type: (typeof PlantingType)[keyof typeof PlantingType];
  anchor: string;
  greenhouseDays: number;
  toHarvestDays: number;
  harvestDays: number;
  lengthCm: number;
  rows: number;
  spacingCm: number;
  yieldPerBedMeter: number;
  priceCents: number;
  underCover: boolean;
  seedsPerGram: number;
}

function demoSeries(year: number): DemoSeries[] {
  return [
    {
      crop: 'Tomate',
      variety: 'Marmande',
      type: PlantingType.transplantRaised,
      anchor: `${year}-02-20`,
      greenhouseDays: 45,
      toHarvestDays: 75,
      harvestDays: 90,
      lengthCm: 3000,
      rows: 2,
      spacingCm: 50,
      yieldPerBedMeter: 6000,
      priceCents: 450,
      underCover: true,
      seedsPerGram: 300,
    },
    {
      crop: 'Carotte',
      variety: 'Nantaise',
      type: PlantingType.directSeed,
      anchor: `${year}-04-10`,
      greenhouseDays: 0,
      toHarvestDays: 100,
      harvestDays: 40,
      lengthCm: 4000,
      rows: 5,
      spacingCm: 4,
      yieldPerBedMeter: 4000,
      priceCents: 250,
      underCover: false,
      seedsPerGram: 800,
    },
    {
      crop: 'Laitue',
      variety: 'Batavia',
      type: PlantingType.transplantRaised,
      anchor: `${year}-03-05`,
      greenhouseDays: 30,
      toHarvestDays: 45,
      harvestDays: 14,
      lengthCm: 2000,
      rows: 4,
      spacingCm: 30,
      yieldPerBedMeter: 900,
      priceCents: 150,
      underCover: false,
      seedsPerGram: 900,
    },
    {
      crop: 'Courgette',
      variety: 'Verte des maraîchers',
      type: PlantingType.transplantRaised,
      anchor: `${year}-04-01`,
      greenhouseDays: 25,
      toHarvestDays: 55,
      harvestDays: 70,
      lengthCm: 2500,
      rows: 1,
      spacingCm: 80,
      yieldPerBedMeter: 5000,
      priceCents: 300,
      underCover: false,
      seedsPerGram: 7,
    },
    {
      crop: 'Poireau',
      variety: 'Bleu de Solaise',
      type: PlantingType.transplantRaised,
      anchor: `${year}-03-15`,
      greenhouseDays: 60,
      toHarvestDays: 120,
      harvestDays: 90,
      lengthCm: 3000,
      rows: 3,
      spacingCm: 15,
      yieldPerBedMeter: 3000,
      priceCents: 280,
      underCover: false,
      seedsPerGram: 400,
    },
  ];
}

async function main(): Promise<void> {
  const year = new Date().getUTCFullYear();

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Le compte de démonstration ${DEMO_EMAIL} existe déjà — rien à faire.`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;

      const user = await tx.user.create({
        data: {
          email: DEMO_EMAIL,
          hashedPassword: await hashPassword(DEMO_PASSWORD),
          locale: 'fr',
        },
      });
      const farm = await createFarm(tx, { name: 'Ferme de démonstration', ownerId: user.id });

      // Parcellaire : un jardin de quatre planches et une serre de deux planches.
      const garden = await tx.location.create({
        data: {
          farmId: farm.id,
          name: 'Jardin nord',
          bedLength: 0,
          greenhouse: false,
          position: 1,
        },
      });
      const greenhouse = await tx.location.create({
        data: { farmId: farm.id, name: 'Serre 1', bedLength: 0, greenhouse: true, position: 2 },
      });
      const beds = [];
      for (let index = 1; index <= 4; index += 1) {
        beds.push(
          await tx.location.create({
            data: {
              farmId: farm.id,
              parentId: garden.id,
              name: `Planche A${index}`,
              bedLength: 5000,
              bedWidth: 80,
              greenhouse: false,
              position: index,
            },
          }),
        );
      }
      const coveredBeds = [];
      for (let index = 1; index <= 2; index += 1) {
        coveredBeds.push(
          await tx.location.create({
            data: {
              farmId: farm.id,
              parentId: greenhouse.id,
              name: `Planche S${index}`,
              bedLength: 3000,
              bedWidth: 80,
              greenhouse: true,
              position: index,
            },
          }),
        );
      }

      const provider = await tx.provider.findFirstOrThrow({ where: { farmId: farm.id } });
      const unit = await tx.unit.findFirstOrThrow({ where: { farmId: farm.id, name: 'kg' } });
      const container = await tx.container.findFirstOrThrow({
        where: { farmId: farm.id, name: 'Plaque 60' },
      });

      for (const [index, series] of demoSeries(year).entries()) {
        const crop = await tx.crop.findFirstOrThrow({
          where: { farmId: farm.id, name: series.crop },
        });
        const variety = await tx.variety.create({
          data: { farmId: farm.id, cropId: crop.id, providerId: provider.id, name: series.variety },
        });

        const durations = {
          greenhouse: series.greenhouseDays,
          to_harvest: series.toHarvestDays,
          harvest: series.harvestDays,
        };
        const dates = deriveDates(series.anchor, series.type, durations);

        const planting = await tx.planting.create({
          data: {
            farmId: farm.id,
            cropId: crop.id,
            varietyId: variety.id,
            unitId: unit.id,
            containerId: series.type === PlantingType.transplantRaised ? container.id : null,
            plantingType: series.type,
            inGreenhouse: series.underCover,
            length: series.lengthCm,
            rows: series.rows,
            spacingPlants: series.spacingCm,
            yieldPerBedMeter: series.yieldPerBedMeter,
            pricePerUnit: series.priceCents,
            seedsPerGram: series.seedsPerGram,
            seedsPerHoleSeedling: 1,
            seedsPerHoleDirect: 3,
            seedsExtraPercentage: 10,
            estimatedGreenhouseLoss: 10,
            dates: {
              create: Object.entries(dates).map(([type, planned]) => ({
                type: type as never,
                planned: new Date(`${planned}T00:00:00Z`),
              })),
            },
            durations: {
              create: Object.entries(durations)
                .filter(([, duration]) => duration > 0)
                .map(([type, duration]) => ({ type: type as never, duration })),
            },
          },
        });

        const target = series.underCover ? coveredBeds : beds;
        const bed = target[index % target.length]!;
        await tx.locationAssignment.create({
          data: { plantingId: planting.id, locationId: bed.id, length: series.lengthCm },
        });

        // Une tâche de semis et, pour les séries repiquées, une tâche de plantation.
        const sowingType = await tx.taskType.findFirstOrThrow({
          where: { farmId: farm.id, name: 'Semis' },
        });
        const plantingType = await tx.taskType.findFirstOrThrow({
          where: { farmId: farm.id, name: 'Plantation' },
        });
        const sowingDate = series.anchor;
        await tx.task.create({
          data: {
            farmId: farm.id,
            typeId: sowingType.id,
            defaultType: 'sowing',
            plannedDate: new Date(`${sowingDate}T00:00:00Z`),
            effectiveDate: new Date(`${sowingDate}T00:00:00Z`),
            done: false,
            daysInField: 0,
            plannedLaborTime: 60,
            plantings: { create: { plantingId: planting.id } },
          },
        });
        if (series.type === PlantingType.transplantRaised) {
          const plantingDate = addDays(series.anchor, series.greenhouseDays);
          await tx.task.create({
            data: {
              farmId: farm.id,
              typeId: plantingType.id,
              defaultType: 'planting',
              plannedDate: new Date(`${plantingDate}T00:00:00Z`),
              effectiveDate: new Date(`${plantingDate}T00:00:00Z`),
              done: false,
              daysInField: 0,
              plannedLaborTime: 120,
              plantings: { create: { plantingId: planting.id } },
              locations: { create: { locationId: bed.id } },
            },
          });
        }
      }

      console.log(`Ferme « ${farm.name} » créée (id ${farm.id}).`);
      console.log(`Compte : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    },
    { timeout: 60_000 },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
