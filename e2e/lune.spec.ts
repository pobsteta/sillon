// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calendrier lunaire, dans un vrai navigateur.
//
// Le calcul est éprouvé dans le noyau, contre des calendriers publiés. Ce parcours vérifie
// les deux promesses que le code seul ne garantit pas : qu'on ne voit **rien** tant qu'on
// n'a pas allumé, et qu'une fois allumé, le bandeau dit des faits et pas des conseils.

import { expect, test, type Page } from '@playwright/test';

const password = 'graines-de-courgette-2026';

/**
 * Bascule l'interrupteur et **attend l'enregistrement**.
 *
 * L'interrupteur bascule avant la réponse du serveur — c'est voulu, sans quoi il
 * reviendrait en arrière sous le doigt. L'essai, lui, ne doit pas changer de page pendant
 * que la requête est en vol : il lirait l'état d'avant et échouerait par intermittence.
 */
async function basculer(page: Page, actif: boolean): Promise<void> {
  const interrupteur = page.getByLabel('Afficher le calendrier lunaire');
  await Promise.all([
    page.waitForResponse((reponse) => reponse.request().method() === 'PATCH' && reponse.ok()),
    actif ? interrupteur.check() : interrupteur.uncheck(),
  ]);
}

test('le calendrier lunaire ne se voit qu’une fois allumé', async ({ page }, info) => {
  const email = `e2e-lune-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme de la lune');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('la feuille de tâches n’en dit pas un mot', async () => {
    // « Éteint par défaut : qui ne pratique pas ne doit pas voir un mot de plus à
    // l'écran. » C'est une promesse d'interface, et rien dans le serveur ne la tient.
    await page.goto('/taches');
    await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible();
    await expect(page.getByLabel('Calendrier lunaire de la semaine')).toHaveCount(0);
  });

  await test.step('on l’allume dans les paramètres', async () => {
    await page.goto('/parametres');
    await basculer(page, true);
    // La convention apparaît une fois allumé : elle change les dates, donc elle se choisit.
    await expect(page.getByLabel('Convention')).toBeVisible();
  });

  await test.step('le bandeau paraît, et dit des faits', async () => {
    await page.goto('/taches');
    const bandeau = page.getByLabel('Calendrier lunaire de la semaine');
    await expect(bandeau).toBeVisible();

    // Sept jours, chacun qualifié.
    await expect(bandeau.getByRole('listitem')).toHaveCount(7);
    await expect(bandeau).toContainText(/Racine|Feuille|Fleur|Fruit/);
    await expect(bandeau).toContainText(/montante|descendante/);

    // Règle 5 du brief : « jour fruit » décrit le ciel, « favorable » affirme un effet.
    // Le second n'a pas sa place ici, et une reformulation malheureuse l'y ramènerait
    // sans que rien ne casse.
    await expect(bandeau).not.toContainText(/favorable|idéal|meilleur moment|propice/i);
  });

  await test.step('on l’éteint, et tout disparaît', async () => {
    await page.goto('/parametres');
    await basculer(page, false);
    await page.goto('/taches');
    await expect(page.getByLabel('Calendrier lunaire de la semaine')).toHaveCount(0);
  });
});

test('la vue mois, le calage et l’indice de date', async ({ page }, info) => {
  const email = `e2e-lune3-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte et allumer le calendrier', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme du lot trois');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    await page.goto('/parametres');
    await basculer(page, true);
  });

  await test.step('la vue mois montre le mois en grille', async () => {
    await page.goto('/calendrier-lunaire');
    const grille = page.getByRole('grid');
    await expect(grille).toBeVisible();

    // Sept en-têtes de colonne, et chaque journée du mois qualifiée.
    await expect(page.getByRole('columnheader')).toHaveCount(7);
    const remplies = grille.getByRole('gridcell').filter({ hasText: /Racine|Feuille|Fleur|Fruit/ });
    expect(await remplies.count(), 'tout le mois est qualifié').toBeGreaterThanOrEqual(28);

    // Règle 5 : on décrit le ciel, on ne recommande rien.
    await expect(grille).not.toContainText(/favorable|idéal|meilleur moment|propice/i);
  });

  await test.step('l’indice paraît sous la date de semis', async () => {
    await page.goto('/plan/nouvelle');
    await page.getByLabel('Espèce', { exact: true }).selectOption({ label: 'Carotte' });
    await page.getByLabel('Date de semis').fill('2027-03-10');

    // Le type du jour s'affiche au moment où la date se décide. La carotte est une
    // racine : ou bien le jour correspond, ou bien des dates proches sont proposées.
    const indice = page.locator('p', { hasText: /Racine|Feuille|Fleur|Fruit/ }).first();
    await expect(indice).toBeVisible();
    await expect(indice).toContainText(/montante|descendante/);
  });

  await test.step('le calage par lot déplace la série, et le dit', async () => {
    await page.getByLabel('Longueur de planche (m)').fill('30');
    await page.getByLabel('Rangs').fill('2');
    await page.getByLabel('Espacement sur le rang (cm)').fill('5');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Modifier la série' })).toBeVisible();

    await page.goto('/plan');
    // La série est semée en 2027 ; le plan s'ouvre sur l'année courante.
    await page.getByLabel('Année').selectOption('2027');
    // Le bouton de calage vit dans le tiroir du traitement par lot : il faut sélectionner
    // une série pour l'atteindre. Une assertion « il n'est pas visible » sur la page close
    // passerait sans rien prouver.
    await page.getByRole('checkbox', { name: 'Carotte' }).first().check();
    await page
      .getByRole('button', { name: /Traitement par lot|sélectionnée/ })
      .first()
      .click();

    const calage = page.getByRole('button', { name: 'Caler sur le jour de la culture' });
    await expect(calage).toBeVisible();
    await calage.click();

    // Le compte rendu dit combien de séries ont bougé — et donc combien n'ont pas bougé.
    // Sans lui, un calage sans effet ressemblerait à un bouton cassé.
    await expect(page.getByRole('status').filter({ hasText: /calée/ })).toBeVisible();
  });
});
