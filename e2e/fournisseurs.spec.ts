// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Semenciers proposés, dans un vrai navigateur.
//
// Ce qui se vérifie ici n'est pas que la liste existe — les essais d'API le disent — mais
// ce que l'écran en dit. Livrer des noms commerciaux dans un logiciel libre n'est pas
// neutre : le texte doit l'assumer plutôt que de le laisser supposer, et rien ne doit
// ressembler à une recommandation.

import { expect, test } from '@playwright/test';

const password = 'graines-de-courgette-2026';

test('les semenciers proposés se disent pour ce qu’ils sont', async ({ page }, info) => {
  const email = `e2e-semenciers-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme des semences');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('la section les nomme, et dit ce qu’elle n’est pas', async () => {
    await page.goto('/parametres');
    const section = page.locator('section').filter({ hasText: 'Semenciers proposés' }).first();
    await expect(section).toBeVisible();

    await expect(section.getByRole('link', { name: 'Kokopelli' })).toBeVisible();
    await expect(section.getByRole('link', { name: 'Le Potager de Santé' })).toBeVisible();

    // Le texte assume le choix éditorial au lieu de le taire.
    await expect(section).toContainText(/ni un partenariat ni une recommandation/i);
    await expect(section).toContainText(/rien ne leur est envoyé/i);

    // Et surtout, rien qui ressemble à un avis sur leurs produits.
    await expect(section).not.toContainText(/meilleur|recommandé|partenaire|qualité supérieure/i);
  });

  await test.step('une ferme neuve les a déjà, donc le bouton ne fait rien', async () => {
    const section = page.locator('section').filter({ hasText: 'Semenciers proposés' }).first();
    // Deux fois « déjà présent » : la ferme vient d'être créée avec eux.
    await expect(section.getByText('déjà présent')).toHaveCount(2);
    await expect(
      section.getByRole('button', { name: 'Ajouter les semenciers proposés' }),
    ).toBeDisabled();
  });

  await test.step('le référentiel montre le site et les notes', async () => {
    await page.goto('/parametres');
    await page.getByRole('button', { name: 'Fournisseurs', exact: true }).click();

    const liste = page.getByRole('listitem').filter({ hasText: 'Kokopelli' }).first();
    await expect(liste.getByRole('link', { name: 'Kokopelli' })).toHaveAttribute(
      'href',
      'https://kokopelli-semences.fr/',
    );
    // Un lien vers l'extérieur ne doit rien pouvoir faire de l'onglet qui l'ouvre.
    await expect(liste.getByRole('link', { name: 'Kokopelli' })).toHaveAttribute('rel', /noopener/);
  });
});
