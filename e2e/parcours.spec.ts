// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Parcours complet : inscription, création d'une série, génération des tâches,
// validation d'une tâche. Joué à l'identique au smartphone et au bureau.

import { expect, test } from '@playwright/test';
import { grandePhotoPng } from './image-fixture.js';

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

    // L'adresse n'est pas confirmée d'emblée : le bandeau le dit et propose le renvoi.
    await expect(page.getByText('Votre adresse n’est pas encore confirmée.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renvoyer le courriel' })).toBeVisible();
  });

  await test.step('créer une série de tomates', async () => {
    await page.getByRole('link', { name: 'Plan de culture' }).first().click();
    await page.getByRole('link', { name: 'Nouvelle série' }).first().click();

    await page.getByLabel('Espèce', { exact: true }).selectOption({ label: 'Tomate' });
    await page.getByLabel('Longueur de planche (m)').fill('30');
    await page.getByLabel('Rangs').fill('2');
    await page.getByLabel('Espacement sur le rang (cm)').fill('50');
    // Saisie par numéro de semaine, comme au bureau en hiver. Comme dans Brinjel, tout
    // part de la date de semis : plantation et récolte s'en déduisent.
    await page.getByLabel('Date de semis').fill('S10');

    // L'aperçu des dates se met à jour sans aller-retour serveur.
    await expect(page.getByText('Période de récolte')).toBeVisible();
    // ...et le compte de plants se calcule dans le navigateur.
    await expect(page.getByText('Plants', { exact: true })).toBeVisible();

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
  await page.getByLabel('Mode d’implantation').selectOption('direct_seeded');
  await page.getByLabel('Longueur de planche (m)').fill('20');
  await page.getByLabel('Rangs').fill('5');
  await page.getByLabel('Espacement sur le rang (cm)').fill('4');
  await page.getByLabel('Graines par poquet').fill('3');
  await page.getByLabel('Marge de sécurité (%)').fill('20');

  // 20 m / 4 cm × 5 rangs = 2500 poquets, 3 graines chacun = 7500 graines. La marge de
  // sécurité n'entre pas ici : dans Brinjel elle ne s'applique qu'à la liste de commande.
  await expect(page.getByText('7 500').or(page.getByText('7500'))).toBeVisible();
});

test('le mot de passe oublié ne dit pas qui a un compte', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Sillon' })).toBeVisible();

  // Une adresse qui n'existe pas doit donner exactement la même réponse qu'une autre :
  // c'est ce que la route prend soin de taire, l'écran ne doit pas le trahir.
  await page.getByLabel('Adresse électronique').fill('personne-ici@example.org');
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();

  await expect(page.getByRole('status')).toContainText('Si un compte correspond à cette adresse');
  await expect(page.getByRole('status')).not.toContainText('inconnu');
});

test('écrit une note avec photo et la retrouve au journal', async ({ page }, testInfo) => {
  const email = uniqueEmail(`notes-${testInfo.project.name}`);

  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
  await page.getByLabel('Adresse électronique').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // Les entrées secondaires tiennent derrière « Plus » au smartphone, et à même la
  // barre latérale au bureau : le parcours passe par la navigation réelle des deux.
  const more = page.getByRole('button', { name: 'Plus' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('link', { name: 'Notes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByText('Aucune note pour l’instant')).toBeVisible();

  // Un PNG de 1×1 pixel : le plus petit fichier qui franchisse le contrôle de type.
  await page.getByLabel('Ajouter une photo').setInputFiles({
    name: 'limace.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  // La vignette n'apparaît qu'une fois le téléversement accepté par l'API.
  await expect(page.getByRole('img', { name: 'limace.png' })).toBeVisible();

  await page.getByLabel('Note', { exact: true }).fill('Limaces sur la planche du fond');
  await page.getByRole('button', { name: 'Enregistrer la note' }).click();

  const note = page.getByRole('article').filter({ hasText: 'Limaces sur la planche du fond' });
  await expect(note).toBeVisible();
  // La photo est bien rattachée à la note enregistrée, pas seulement au formulaire.
  const vignette = note.getByRole('img', { name: 'limace.png' });
  await expect(vignette).toBeVisible();
  // « Visible » ne dit rien du décodage : une image que le navigateur refuse d'afficher
  // occupe quand même sa place. C'est `naturalWidth` qui tranche — et c'est ce contrôle
  // qui manquait quand la route servait les photos en `application/octet-stream`, type
  // qu'interdit `X-Content-Type-Options: nosniff`.
  await expect
    .poll(() => vignette.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  // Archivée, elle quitte le journal courant et reparaît sous le filtre.
  await note.getByRole('button', { name: 'Archiver' }).click();
  await expect(page.getByText('Aucune note pour l’instant')).toBeVisible();
  await page.getByLabel('Voir les notes archivées').check();
  await expect(page.getByText('Limaces sur la planche du fond')).toBeVisible();
});

test('compresse une grande photo avant de l’envoyer', async ({ page }, testInfo) => {
  const email = uniqueEmail(`compression-${testInfo.project.name}`);

  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
  await page.getByLabel('Adresse électronique').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  const more = page.getByRole('button', { name: 'Plus' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('link', { name: 'Notes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  // 2600 × 1800 bruités, soit 14 Mo : au-delà de ce que l'API accepte. L'envoi ne peut
  // donc aboutir que si le navigateur a réduit la photo avant de la transmettre.
  await page.getByLabel('Ajouter une photo').setInputFiles({
    name: 'limace-hd.png',
    mimeType: 'image/png',
    buffer: grandePhotoPng(),
  });

  // Le nom le dit : `.png` à l'entrée, `.jpg` enregistré. C'est la trace visible de la
  // compression — sans elle, la vignette porterait encore le nom d'origine.
  const vignette = page.getByRole('img', { name: 'limace-hd.jpg' });
  await expect(vignette).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => vignette.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});
