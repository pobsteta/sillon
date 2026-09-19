// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Situer la ferme, dans un vrai navigateur.
//
// Ce parcours ne lance **aucune recherche d'adresse** : elle joindrait un service tiers, et
// une suite d'essais qui en dépend échoue le jour où il est en maintenance, sur du code qui
// n'a pas bougé. Le comportement de la route est éprouvé ailleurs, avec un `fetch` simulé.
//
// Ce qui se vérifie ici, et que le serveur ne garantit pas : que la carte s'affiche
// vraiment — une bibliothèque cartographique qui ne monte pas laisse un rectangle vide,
// sans erreur — et que l'écran annonce où part la requête avant qu'on ne la lance.

import { expect, test } from '@playwright/test';

const password = 'graines-de-courgette-2026';

test('poser la position de la ferme', async ({ page }, info) => {
  const email = `e2e-carte-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme cartographiée');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('la carte s’affiche pour de bon', async () => {
    await page.goto('/carte');
    await expect(page.getByRole('heading', { name: 'Carte du jardin' })).toBeVisible();

    const carte = page.getByRole('application', { name: 'Carte du jardin' });
    await expect(carte).toBeVisible();

    // Leaflet pose ses tuiles dans le conteneur. Sans cette vérification, une carte qui
    // n'aurait pas monté ressemblerait à une carte vide — et l'essai passerait.
    await expect(carte.locator('.leaflet-tile-pane')).toBeAttached();
    await expect(carte.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  });

  await test.step('l’écran dit où part la recherche, avant qu’elle ne parte', async () => {
    // Chercher une adresse fait sortir une donnée de Sillon. Le dire est la moitié du
    // travail ; une reformulation qui l'effacerait passerait inaperçue sans cet essai.
    await expect(page.getByText(/envoie l’adresse saisie au service de géocodage/)).toBeVisible();
  });

  await test.step('les coordonnées se saisissent à la main et se gardent', async () => {
    await page.getByLabel('Latitude').fill('47.59855');
    await page.getByLabel('Longitude').fill('-0.44078');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // La position s'affiche en tête, dans l'ordre que lit un humain.
    await expect(page.getByText('47.59855, -0.44078')).toBeVisible();

    // Et elle survit au rechargement : c'est la base qui la porte, pas l'écran.
    await page.reload();
    await expect(page.getByText('47.59855, -0.44078')).toBeVisible();
  });

  await test.step('et se retirent aussi simplement', async () => {
    await page.getByRole('button', { name: 'Retirer la position' }).click();
    await expect(page.getByText('47.59855, -0.44078')).toHaveCount(0);
  });
});
