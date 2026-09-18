// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Centres de formation, dans un vrai navigateur.
//
// Les essais d'API prouvent que les routes font ce qu'elles disent. Ils ne disent rien de
// l'écran : une clé de traduction manquante, une entrée de navigation qui n'apparaît pas,
// un bouton câblé sur une route inexistante passent tous les essais du serveur. C'est
// précisément ce genre de panne — du code qui existe et ne marche pas, sans que rien ne le
// signale — que ce parcours attrape.

import { expect, test, type Page } from '@playwright/test';

const password = 'graines-de-courgette-2026';

/**
 * Au smartphone, les entrées secondaires vivent derrière « Plus » et ne sont même pas dans
 * le document tant qu'on ne l'a pas ouvert ; au bureau, la barre latérale les montre
 * toutes. Le parcours est le même, la navigation ne l'est pas.
 */
async function ouvrirLeMenuSecondaire(page: Page): Promise<void> {
  const plus = page.getByRole('button', { name: 'Plus' });
  if (await plus.isVisible()) await plus.click();
}

async function fermerLeMenuSecondaire(page: Page): Promise<void> {
  const plus = page.getByRole('button', { name: 'Plus' });
  if ((await plus.isVisible()) && (await plus.getAttribute('aria-expanded')) === 'true') {
    await plus.click();
  }
}

test('déclarer un centre, créer un apprenant, terminer la formation', async ({ page }, info) => {
  const marque = `${info.project.name}-${Date.now()}`;
  const formateur = `e2e-centre-${marque}@example.org`;

  await test.step('créer le compte du centre', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(formateur);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByLabel('Nom de la ferme').fill('CFPPA de bout en bout');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('l’entrée « Formation » est absente tant qu’on n’est pas un centre', async () => {
    // Une entrée permanente vers un écran vide serait du bruit pour l'immense majorité
    // des fermes : la navigation ne la montre qu'aux centres.
    await ouvrirLeMenuSecondaire(page);
    await expect(page.getByRole('link', { name: 'Formation' })).toHaveCount(0);
  });

  await test.step('déclarer la ferme centre de formation', async () => {
    await page.goto('/parametres');
    await page
      .getByRole('button', { name: 'Déclarer cette ferme comme centre de formation' })
      .click();

    await expect(page.getByRole('heading', { name: 'Centre de formation' })).toBeVisible();
    // La ferme elle-même devient le premier modèle : sans lui, on ne pourrait rien créer.
    await expect(page.getByText('Par défaut', { exact: true })).toBeVisible();
    // La navigation doit suivre sans rechargement : c'est ce que l'invalidation de la
    // session garantit, et ce qu'on oublierait en écrivant la mutation à la main.
    await ouvrirLeMenuSecondaire(page);
    await expect(page.getByRole('link', { name: 'Formation' }).first()).toBeVisible();
    await fermerLeMenuSecondaire(page);
  });

  const apprenant = `e2e-eleve-${marque}@example.org`;

  await test.step('créer une ferme d’apprenant par duplication', async () => {
    await page.getByLabel('Adresse de l’apprenant').fill(apprenant);
    await page.getByLabel('Nom de la ferme').fill('Ferme de Camille');
    await page.getByRole('button', { name: 'Créer la ferme d’apprenant' }).click();

    // Le compte des lignes copiées est la seule chose qui distingue à l'écran une copie
    // complète d'une copie vide.
    const bilan = page.getByRole('status').filter({ hasText: 'Ferme de Camille' });
    await expect(bilan).toBeVisible();
    await expect(bilan).toContainText('lignes copiées');

    await expect(page.getByText('Ferme de Camille').last()).toBeVisible();
    await expect(page.getByText('Invitation en attente')).toBeVisible();
  });

  await test.step('terminer la formation dit ce qu’elle retire avant de le faire', async () => {
    await page.getByRole('button', { name: 'Terminer la formation' }).click();
    await expect(
      page.getByText('Les formateurs perdront l’accès ; l’apprenant garde sa ferme'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    // La liste par défaut ne montre que les formations en cours : celle-ci en sort.
    await expect(page.getByText('Aucune ferme d’apprenant.')).toBeVisible();

    await page.getByLabel('Afficher').selectOption({ label: 'Formations terminées' });
    await expect(page.getByText('Ferme de Camille')).toBeVisible();
    await expect(page.getByText(/terminée le/)).toBeVisible();
  });
});
