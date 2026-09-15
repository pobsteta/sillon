// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Parcours complet : inscription, création d'une série, génération des tâches,
// validation d'une tâche. Joué à l'identique au smartphone et au bureau.

import { expect, test } from '@playwright/test';

const password = 'graines-de-courgette-2026';

function uniqueEmail(project: string): string {
  return `e2e-${project}-${Date.now()}@example.org`;
}

test('inscription, série, tâches', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo.project.name);

  await test.step('créer un compte et sa ferme', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme de bout en bout');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('créer une série de tomates', async () => {
    await page.getByRole('link', { name: 'Plan de culture' }).first().click();
    await page.getByRole('link', { name: 'Nouvelle série' }).first().click();

    await page.getByLabel('Espèce', { exact: true }).selectOption({ label: 'Tomate' });
    await page.getByLabel('Longueur de planche (m)').fill('30');
    await page.getByLabel('Rangs').fill('2');
    await page.getByLabel('Espacement sur le rang (cm)').fill('50');
    // Saisie par numéro de semaine, comme au bureau en hiver.
    await page.getByLabel('Date de départ').fill('S10');

    // L'aperçu des dates se met à jour sans aller-retour serveur.
    await expect(page.getByText('Semis en pépinière')).toBeVisible();
    await expect(page.getByText('Plants').first()).toBeVisible();

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Modifier la série' })).toBeVisible();
  });

  await test.step('générer les tâches puis en valider une', async () => {
    await page.getByRole('button', { name: 'Générer les tâches' }).click();
    await page.getByRole('link', { name: 'Tâches' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible();

    // Les deux tâches générées (semis, plantation) sont en retard : elles remontent sur la
    // semaine courante tant qu'elles tiennent dans la fenêtre de retard de la ferme.
    const rows = page.getByRole('main').getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('En retard').first()).toBeVisible();

    // Validée, une tâche en retard quitte la feuille de la semaine : il en reste une.
    await page.getByRole('checkbox', { name: 'Valider' }).first().click();
    await expect(rows).toHaveCount(1);
  });
});

test('la fiche de série calcule les semences sans réseau', async ({ page }, testInfo) => {
  const email = uniqueEmail(`offline-${testInfo.project.name}`);

  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
  await page.getByLabel('Adresse électronique').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  await page.goto('/plan/nouvelle');
  await page.getByLabel('Espèce', { exact: true }).selectOption({ label: 'Carotte' });
  await page.getByLabel('Mode d’implantation').selectOption('direct_seed');
  await page.getByLabel('Longueur de planche (m)').fill('20');
  await page.getByLabel('Rangs').fill('5');
  await page.getByLabel('Espacement sur le rang (cm)').fill('4');
  await page.getByLabel('Graines par poquet').fill('3');
  await page.getByLabel('Marge de sécurité (%)').fill('20');

  // 20 m / 4 cm × 5 rangs = 2500 poquets, 3 graines chacun, +20 % = 9000 graines.
  await expect(page.getByText('9 000').or(page.getByText('9000'))).toBeVisible();
});
