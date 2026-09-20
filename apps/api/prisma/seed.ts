// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Jeu de démonstration : un compte, une ferme **située**, son référentiel, un jardin de six
// planches dessinées sur la carte, et quelques séries réalistes de la saison en cours.
// `npm run db:seed -w @sillon/api`.
//
// Situer la ferme et dessiner ses planches n'est pas de l'ornement : sans coordonnées, la
// carte s'ouvre sur la France entière et n'a rien à montrer, et la fiche du jour du
// calendrier lunaire n'a ni lever ni coucher à donner. Une démonstration doit montrer
// l'outil en marche, pas ses écrans vides.

import { PrismaClient } from '@prisma/client';
import {
  addDays,
  bedOutline,
  centimetersToTenthsOfMillimeter,
  deriveDates,
  metersToMillimeters,
  minutesToSeconds,
  PlantingType,
  offsetMeters,
  seedsPerGramToStorage,
  toGeoJsonPolygon,
  unitsToThousandths,
} from '@sillon/core';
import { hashPassword } from '../src/auth.js';
import { createFarm } from '../src/farm-setup.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'maraichere@example.org';
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'sillon-demonstration';

/**
 * Où se trouve la ferme de démonstration : en plaine dijonnaise.
 *
 * **Une position, et pas seulement un point.** Sans coordonnées, la carte s'ouvrait sur la
 * France entière et le parcellaire n'existait pas — un écran vide dont rien ne disait s'il
 * était cassé ou simplement inutilisé. Et une saisie manuelle laissée à blanc envoyait la
 * ferme par 0°, 0° : au large du golfe de Guinée, ce qui se voit tout de suite et
 * n'apprend rien.
 *
 * Le lieu est arbitraire, mais il est **réel** : un jeu de démonstration sert à montrer
 * l'outil qui marche, et des planches posées en plein océan ne montrent rien. Le calendrier
 * lunaire s'en sert aussi, pour les levers et couchers de sa fiche du jour.
 */
const DEMO_POSITION = { lat: 47.322, lng: 5.041 };

/** Cap du parcellaire, en degrés depuis le nord. De biais, comme un vrai champ. */
const DEMO_ORIENTATION = 18;

/**
 * Une série de démonstration, décrite dans les unités de saisie ; la conversion vers
 * les unités de stockage de Brinjel a lieu au moment de l'insertion.
 */
interface DemoSeries {
  crop: string;
  variety: string;
  type: (typeof PlantingType)[keyof typeof PlantingType];
  /** Date de semis : plantation et récolte s'en déduisent. */
  sowing: string;
  daysToTransplant: number;
  daysToMaturity: number;
  harvestWindow: number;
  lengthMeters: number;
  rows: number;
  spacingCm: number;
  /** Rendement escompté par mètre de planche, dans l'unité de la série. */
  yieldPerBedMeter: number;
  priceCents: number;
  underCover: boolean;
  /** Graines par gramme, tel que l'imprime un catalogue de semences. */
  seedsPerGram: number;
}

function demoSeries(year: number): DemoSeries[] {
  return [
    {
      crop: 'Tomate',
      variety: 'Marmande',
      type: PlantingType.transplantRaised,
      sowing: `${year}-02-20`,
      daysToTransplant: 45,
      daysToMaturity: 75,
      harvestWindow: 90,
      lengthMeters: 30,
      rows: 2,
      spacingCm: 50,
      yieldPerBedMeter: 6,
      priceCents: 450,
      underCover: true,
      seedsPerGram: 300,
    },
    {
      crop: 'Carotte',
      variety: 'Nantaise',
      type: PlantingType.directSeeded,
      sowing: `${year}-04-10`,
      daysToTransplant: 0,
      daysToMaturity: 100,
      harvestWindow: 40,
      lengthMeters: 40,
      rows: 5,
      spacingCm: 4,
      yieldPerBedMeter: 4,
      priceCents: 250,
      underCover: false,
      seedsPerGram: 800,
    },
    {
      crop: 'Laitue',
      variety: 'Batavia',
      type: PlantingType.transplantRaised,
      sowing: `${year}-03-05`,
      daysToTransplant: 30,
      daysToMaturity: 45,
      harvestWindow: 14,
      lengthMeters: 20,
      rows: 4,
      spacingCm: 30,
      yieldPerBedMeter: 0.9,
      priceCents: 150,
      underCover: false,
      seedsPerGram: 900,
    },
    {
      crop: 'Courgette',
      variety: 'Verte des maraîchers',
      type: PlantingType.transplantRaised,
      sowing: `${year}-04-01`,
      daysToTransplant: 25,
      daysToMaturity: 55,
      harvestWindow: 70,
      lengthMeters: 25,
      rows: 1,
      spacingCm: 80,
      yieldPerBedMeter: 5,
      priceCents: 300,
      underCover: false,
      seedsPerGram: 7,
    },
    {
      crop: 'Poireau',
      variety: 'Bleu de Solaise',
      type: PlantingType.transplantRaised,
      sowing: `${year}-03-15`,
      daysToTransplant: 60,
      daysToMaturity: 120,
      harvestWindow: 90,
      lengthMeters: 30,
      rows: 3,
      spacingCm: 15,
      yieldPerBedMeter: 3,
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
      await tx.farm.update({
        where: { id: farm.id },
        data: {
          latitude: DEMO_POSITION.lat,
          longitude: DEMO_POSITION.lng,
          // Le calendrier lunaire reste éteint par défaut partout ailleurs (brief
          // lunaire §1) ; sur la ferme de démonstration il est allumé, parce qu'une
          // démonstration doit montrer ce que l'outil sait faire.
          moonCalendar: true,
        },
      });

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
      // Les planches sont **dessinées** autant que décrites : le parcellaire posé sur la
      // carte est ce qui fait la différence entre une démonstration qu'on regarde et une
      // démonstration qu'on essaie. Les contours sont calculés depuis les mêmes mesures
      // que `bedLength`, donc les deux ne peuvent pas se contredire.
      //
      // 80 cm de planche et 60 cm de passe-pied : la maille courante en maraîchage sur
      // sol vivant, et celle que `BedSettings` propose par défaut.
      const beds = [];
      for (let index = 1; index <= 4; index += 1) {
        const coin = offsetMeters(DEMO_POSITION, (index - 1) * 1.4, 0);
        beds.push(
          await tx.location.create({
            data: {
              farmId: farm.id,
              parentId: garden.id,
              name: `Planche A${index}`,
              // 50 m sur 80 cm, en millimètres comme le reste du schéma.
              bedLength: metersToMillimeters(50),
              bedWidth: 800,
              greenhouse: false,
              position: index,
              geometry: toGeoJsonPolygon(bedOutline(coin, 50, 0.8, DEMO_ORIENTATION)),
            },
          }),
        );
      }
      // La serre est posée à dix mètres à l'est du jardin : assez pour qu'on distingue les
      // deux blocs sur la carte, assez près pour qu'ils tiennent dans le même cadrage.
      const coveredBeds = [];
      for (let index = 1; index <= 2; index += 1) {
        const coin = offsetMeters(DEMO_POSITION, 10 + (index - 1) * 1.4, 0);
        coveredBeds.push(
          await tx.location.create({
            data: {
              farmId: farm.id,
              parentId: greenhouse.id,
              name: `Planche S${index}`,
              // 30 m sur 80 cm.
              bedLength: metersToMillimeters(30),
              bedWidth: 800,
              greenhouse: true,
              position: index,
              geometry: toGeoJsonPolygon(bedOutline(coin, 30, 0.8, DEMO_ORIENTATION)),
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
          days_to_transplant: series.daysToTransplant,
          days_to_maturity: series.daysToMaturity,
          harvest_window: series.harvestWindow,
        };
        const derived = deriveDates(series.sowing, series.type, durations);
        const lengthMm = metersToMillimeters(series.lengthMeters);

        const planting = await tx.planting.create({
          data: {
            farmId: farm.id,
            cropId: crop.id,
            varietyId: variety.id,
            unitId: unit.id,
            containerId: series.type === PlantingType.transplantRaised ? container.id : null,
            plantingType: series.type,
            inGreenhouse: series.underCover,
            // Unités de stockage : millimètres, dixièmes de millimètre, millièmes d'unité,
            // graines par kilogramme.
            length: lengthMm,
            rows: series.rows,
            spacingPlants: centimetersToTenthsOfMillimeter(series.spacingCm),
            yieldPerBedMeter: unitsToThousandths(series.yieldPerBedMeter),
            pricePerUnit: series.priceCents,
            seedsPerGram: seedsPerGramToStorage(series.seedsPerGram),
            seedsPerHoleSeedling: 1,
            seedsPerHoleDirect: 3,
            seedsExtraPercentage: 10,
            estimatedGreenhouseLoss: 10,
            dates: {
              create: Object.entries(derived.dates).map(([type, planned]) => ({
                type: type as never,
                planned: new Date(`${planned}T00:00:00Z`),
              })),
            },
            durations: {
              create: Object.entries(durations)
                .filter(([, duration]) => duration > 0)
                .map(([type, duration]) => ({ type: type as never, duration })),
            },
            harvestPeriods: derived.harvestPeriod
              ? {
                  create: [
                    {
                      begin: new Date(`${derived.harvestPeriod.begin}T00:00:00Z`),
                      end: new Date(`${derived.harvestPeriod.end}T00:00:00Z`),
                    },
                  ],
                }
              : undefined,
          },
        });

        const target = series.underCover ? coveredBeds : beds;
        const bed = target[index % target.length]!;
        await tx.locationAssignment.create({
          data: { plantingId: planting.id, locationId: bed.id, length: lengthMm },
        });

        // Une tâche de semis et, pour les séries repiquées, une tâche de plantation.
        const sowingType = await tx.taskType.findFirstOrThrow({
          where: { farmId: farm.id, name: 'Semis' },
        });
        const plantingType = await tx.taskType.findFirstOrThrow({
          where: { farmId: farm.id, name: 'Plantation' },
        });
        await tx.task.create({
          data: {
            farmId: farm.id,
            typeId: sowingType.id,
            defaultType:
              series.type === PlantingType.directSeeded ? 'direct_sow' : 'greenhouse_sow',
            plannedDate: new Date(`${series.sowing}T00:00:00Z`),
            effectiveDate: new Date(`${series.sowing}T00:00:00Z`),
            done: false,
            daysInField: 0,
            plannedLaborTime: minutesToSeconds(60),
            plantings: { create: { plantingId: planting.id } },
          },
        });
        if (series.type === PlantingType.transplantRaised) {
          const plantingDate = addDays(series.sowing, series.daysToTransplant);
          await tx.task.create({
            data: {
              farmId: farm.id,
              typeId: plantingType.id,
              defaultType: 'transplant',
              plannedDate: new Date(`${plantingDate}T00:00:00Z`),
              effectiveDate: new Date(`${plantingDate}T00:00:00Z`),
              done: false,
              daysInField: 0,
              plannedLaborTime: minutesToSeconds(120),
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
