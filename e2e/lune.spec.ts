// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Calendrier lunaire, dans un vrai navigateur.
//
// Le calcul est éprouvé dans le noyau, contre des calendriers publiés. Ce parcours vérifie
// les promesses que le code seul ne garantit pas : qu'on ne voit **rien** tant qu'on n'a
// pas allumé ; qu'une fois allumé, le bandeau et la grille disent des faits et pas des
// conseils ; et que la fiche du jour, qui porte un indice chiffré, l'**explique** —
// garde-fou n° 1 du §11 du brief, sans lequel ce chiffre ne serait qu'un argument
// d'autorité.

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

  await test.step('le tableau de bord n’en dit pas un mot', async () => {
    // C'est la première page qu'on ouvre : c'est donc là que « éteint par défaut » compte
    // le plus. Qui ne pratique pas ne doit pas voir un mot de plus à l'écran.
    await expect(page.getByLabel('Calendrier lunaire')).toHaveCount(0);
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

  await test.step('le ciel du jour paraît sur le tableau de bord', async () => {
    await page.goto('/');
    const ciel = page.getByLabel('Calendrier lunaire');
    await expect(ciel).toBeVisible();
    await expect(ciel).toContainText(/montante|descendante/);

    // L'indice chiffré et les conseils restent dans la fiche du jour, derrière le bouton
    // qui les explique. Les remonter ici les afficherait à quelqu'un qui n'a rien
    // demandé, et sans le garde-fou qui les accompagne.
    await expect(ciel.getByRole('img', { name: /Indice du jour/ })).toHaveCount(0);
    await expect(ciel).not.toContainText(/Conseils du jour|Exceptionnel/);

    // Le chemin vers la fiche doit être court depuis la page qu'on ouvre en premier.
    await page.getByRole('link', { name: 'Voir la fiche du jour →' }).click();
    await expect(page).toHaveURL(/\/calendrier-lunaire\/\d{4}-\d{2}-\d{2}$/);
  });

  await test.step('on l’éteint, et tout disparaît', async () => {
    await page.goto('/parametres');
    await basculer(page, false);
    await page.goto('/taches');
    await expect(page.getByLabel('Calendrier lunaire de la semaine')).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByLabel('Calendrier lunaire')).toHaveCount(0);
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

test('la fiche du jour porte un indice, et l’explique', async ({ page }, info) => {
  const email = `e2e-lune-jour-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte et allumer le calendrier', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme de la fiche');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    await page.goto('/parametres');
    await basculer(page, true);
  });

  await test.step('cliquer un jour de la grille ouvre sa fiche', async () => {
    await page.goto('/calendrier-lunaire');
    // Les cases sont des **liens** : elles s'ouvrent au clavier et dans un onglet. Un
    // `div` muni d'un `onClick` passerait ce clic et échouerait à tout le reste.
    //
    // Repérée par son contenu, qui est aussi son nom accessible : « 15 Fruit montante ».
    // Un `aria-label` posé sur la case remplacerait tout cela par un libellé plus pauvre,
    // et cet essai le verrait.
    const quinze = page.getByRole('grid').getByRole('link').filter({ hasText: /^15/ });
    await expect(quinze).toBeVisible();
    await expect(quinze).toContainText(/Racine|Feuille|Fleur|Fruit/);
    await quinze.click();

    await expect(page).toHaveURL(/\/calendrier-lunaire\/\d{4}-\d{2}-15$/);
    // La phase à huit noms, que la grille du mois ne donne pas.
    await expect(
      page.getByRole('heading', {
        name: /Nouvelle lune|croissant|quartier|Gibbeuse|Pleine lune/,
      }),
    ).toBeVisible();
  });

  await test.step('l’indice s’ouvre et rend ses comptes', async () => {
    // Le garde-fou n° 1 du §11. Un indice qu'on ne peut pas ouvrir change la nature de
    // l'écran, et rien ne casserait si le bouton disparaissait d'une retouche.
    const jauge = page.getByRole('img', { name: /Indice du jour : \d+ sur 100/ });
    await expect(jauge).toBeVisible();

    const explication = page.getByRole('button', { name: 'Comment cet indice est calculé' });
    await expect(explication).toHaveAttribute('aria-expanded', 'false');
    await explication.click();

    await expect(page.getByRole('heading', { name: 'D’où vient cet indice' })).toBeVisible();
    // La phrase qui empêche le chiffre de passer pour une mesure. Elle est le garde-fou
    // lui-même, pas son emballage : une reformulation qui la perdrait doit échouer ici.
    await expect(page.getByText(/ne mettent pas en évidence d’effet reproductible/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ce qui a joué' })).toBeVisible();
  });

  await test.step('les tâches suggérées disent qu’elles ne touchent à rien', async () => {
    // Règles 1 à 3 du §7, qui tiennent toujours : la lune ne commande rien. Sans cette
    // phrase, ces lignes ressembleraient à des tâches ajoutées au plan de la ferme.
    await expect(page.getByRole('heading', { name: /Tâches suggérées/ })).toBeVisible();
    await expect(page.getByText(/Rien n’est ajouté à votre plan/)).toBeVisible();
    await expect(page.getByText(/ne recopient aucun calendrier publié/)).toBeVisible();
  });

  await test.step('et l’on revient au mois', async () => {
    await page.getByRole('link', { name: 'Retour au mois' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
  });
});

test('le plan se filtre par ce qu’on récolte', async ({ page }, info) => {
  const email = `e2e-parties-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme des parties');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  });

  await test.step('semer une carotte et une tomate', async () => {
    for (const [espece, date] of [
      ['Carotte', '2027-03-10'],
      ['Tomate', '2027-03-12'],
    ] as const) {
      await page.goto('/plan/nouvelle');
      await page.getByLabel('Espèce', { exact: true }).selectOption({ label: espece });
      await page.getByLabel('Date de semis').fill(date);
      await page.getByLabel('Longueur de planche (m)').fill('30');
      await page.getByLabel('Rangs').fill('2');
      await page.getByLabel('Espacement sur le rang (cm)').fill('5');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByRole('heading', { name: 'Modifier la série' })).toBeVisible();
    }
  });

  await test.step('la puce « Racine » ne laisse que la carotte', async () => {
    // **Ne regarder que ce qui se voit.** Le plan rend des cartes sur téléphone et un
    // tableau sur PC, et garde les deux dans le document : celui qui ne sert pas est
    // masqué par CSS (`lg:hidden`). Un sélecteur qui prendrait la première occurrence
    // attraperait la carte masquée sur un écran de bureau, et l'essai échouerait sur une
    // ligne pourtant correctement affichée juste à côté.
    const affiche = (texte: string) => page.getByText(texte).filter({ visible: true });

    await page.goto('/plan');
    await page.getByLabel('Année').selectOption('2027');
    await expect(affiche('Carotte').first()).toBeVisible();
    await expect(affiche('Tomate').first()).toBeVisible();

    await page.getByRole('button', { name: 'Racine' }).click();
    await expect(affiche('Carotte').first()).toBeVisible();
    await expect(affiche('Tomate')).toHaveCount(0);
  });

  await test.step('le Gantt suit le même filtre', async () => {
    // Le filtre porte sur la requête, pas sur l'affichage : sans cela, la liste et le
    // diagramme montreraient deux choses différentes, et la sélection du traitement par
    // lot contiendrait des séries invisibles.
    await page.getByRole('button', { name: 'Diagramme de Gantt' }).click();
    const gantt = page.getByRole('img', { name: 'Diagramme de Gantt' });
    await expect(gantt).toBeVisible();
    await expect(gantt).toContainText('Carotte');
    await expect(gantt).not.toContainText('Tomate');
  });

  await test.step('« Tous » les ramène', async () => {
    await page.getByRole('button', { name: 'Tous' }).click();
    const gantt = page.getByRole('img', { name: 'Diagramme de Gantt' });
    await expect(gantt).toContainText('Tomate');
  });
});
