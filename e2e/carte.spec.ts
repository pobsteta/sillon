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

  await test.step('on choisit son fond de carte', async () => {
    // OpenStreetMap est toujours là : c'est le seul fond que Sillon livre, et le seul dont
    // il garantisse la licence. Un fond configuré s'y **ajoute**.
    const carte = page.getByRole('application', { name: 'Carte du jardin' });
    const selecteur = carte.locator('.leaflet-control-layers');
    await expect(selecteur).toBeAttached();

    await selecteur.hover();
    await expect(selecteur).toContainText('Plan');
    await expect(selecteur).toContainText('Vue aérienne');

    // Le choix se retient d'une visite à l'autre.
    await selecteur.getByText('Vue aérienne').click();
    await page.reload();
    const apres = page
      .getByRole('application', { name: 'Carte du jardin' })
      .locator('.leaflet-control-layers');
    await apres.hover();
    await expect(
      apres.locator('input[type="radio"]:checked + span'),
      'le fond choisi revient tout seul',
    ).toContainText('Vue aérienne');
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

  await test.step('les outils de tracé n’arrivent qu’au moment de dessiner', async () => {
    // La bibliothèque de dessin pèse près de deux fois la carte : elle n'est chargée que
    // si l'on dessine. Le piège est que l'emplacement se choisit **après** l'ouverture de
    // l'écran — un chargement fait une fois pour toutes au montage n'arriverait jamais, et
    // l'outil polygone ne paraîtrait pas. Rien ne l'aurait signalé.
    const carte = page.getByRole('application', { name: 'Carte du jardin' });

    // Une planche, posée par l'API : cet essai porte sur la carte, pas sur la création
    // d'un parcellaire. `page.request` réutilise le cookie de session du navigateur.
    const session = await page.request.get('/api/auth/me').then((r) => r.json());
    const reponse = await page.request.post(`/api/farms/${session.farms[0].id}/locations`, {
      data: { name: 'Planche du haut', parentId: null, bedLength: 30000, greenhouse: false },
    });
    expect(reponse.status(), await reponse.text()).toBe(201);

    await page.goto('/carte');
    // Geoman pose deux barres, dessin et édition : on vise celle du tracé.
    const outilTrace = carte.locator('.leaflet-pm-toolbar.leaflet-pm-draw');
    await expect(outilTrace, 'rangés tant qu’aucun emplacement n’est choisi').toHaveCount(0);

    await page.getByLabel('Emplacement à dessiner').selectOption({ label: 'Planche du haut' });

    await expect(outilTrace, 'et sortis dès qu’il y en a un').toBeAttached({ timeout: 15_000 });

    // Puis rangés de nouveau : on ne dessine que pour quelqu'un.
    await page.getByLabel('Emplacement à dessiner').selectOption('');
    await expect(outilTrace).toHaveCount(0);
  });

  await test.step('la mesure se propose, et ne s’applique que si on le demande', async () => {
    // `bedLength` sert aux calculs de semences, de rendement et de commande. Le bouton
    // existe, il est nommé, et rien ne se règle sans lui : c'est la règle du brief, et
    // elle ne tient qu'à cette séparation.
    const session = await page.request.get('/api/auth/me').then((r) => r.json());
    const ferme = session.farms[0].id;
    const lieux = await page.request.get(`/api/farms/${ferme}/locations`).then((r) => r.json());
    const planche = lieux.find((lieu: { name: string }) => lieu.name === 'Planche du haut');

    // Un rectangle d'environ 30 m sur 80 cm, posé par l'API : ce qui se vérifie ici est
    // l'écran, pas le maniement de l'outil de tracé.
    const pose = await page.request.put(`/api/farms/${ferme}/locations/${planche.id}/geometry`, {
      data: {
        points: [
          { lat: 47.5985, lng: -0.4408 },
          { lat: 47.5985, lng: -0.44079 },
          { lat: 47.59877, lng: -0.44079 },
          { lat: 47.59877, lng: -0.4408 },
        ],
      },
    });
    expect(pose.status(), await pose.text()).toBe(200);

    await page.goto('/carte');
    // Le contour tracé revient sur la carte.
    const carte = page.getByRole('application', { name: 'Carte du jardin' });
    await expect(carte.locator('path.leaflet-interactive').first()).toBeAttached();

    // Choisir la planche suffit à lire sa mesure : nul besoin de retracer.
    await page.getByLabel('Emplacement à dessiner').selectOption(String(planche.id));
    await expect(page.getByRole('status').filter({ hasText: /m²/ })).toBeVisible();

    // La longueur saisie n'a pas bougé, et le bouton dit exactement ce qu'il ferait.
    expect(planche.bedLength).toBe(30000);
    const reglerLaPlanche = page.getByRole('button', { name: /Régler la planche sur/ });
    await expect(reglerLaPlanche).toBeVisible();

    await reglerLaPlanche.click();
    await expect(page.getByText(/Longueur de planche mise à jour/)).toBeVisible();

    const apres = await page.request
      .get(`/api/farms/${ferme}/locations`)
      .then((r) => r.json())
      .then((lieux: { name: string; bedLength: number }[]) =>
        lieux.find((lieu) => lieu.name === 'Planche du haut'),
      );
    expect(apres!.bedLength, 'et seulement après qu’on l’a demandé').not.toBe(30000);
  });

  await test.step('le parcellaire pivote d’un bloc, sans se déformer', async () => {
    // Deux planches parallèles : ce qui compte est qu'elles tournent **ensemble**, autour
    // d'un centre commun. Chacune sur elle-même les ferait pivoter en croix, et le
    // parcellaire n'aurait plus de sens.
    const session = await page.request.get('/api/auth/me').then((r) => r.json());
    const ferme = session.farms[0].id;
    const seconde = await page.request
      .post(`/api/farms/${ferme}/locations`, {
        data: { name: 'Planche du bas', parentId: null, bedLength: 30000, greenhouse: false },
      })
      .then((r) => r.json());
    await page.request.put(`/api/farms/${ferme}/locations/${seconde.id}/geometry`, {
      data: {
        points: [
          { lat: 47.5985, lng: -0.44077 },
          { lat: 47.5985, lng: -0.44076 },
          { lat: 47.59877, lng: -0.44076 },
          { lat: 47.59877, lng: -0.44077 },
        ],
      },
    });

    /** Étendue de chaque contour, en degrés : de quoi dire s'il est debout ou couché. */
    const etendues = async () => {
      // Lecture **dans la page** plutôt que par `page.request`. Les réponses de ce dernier
      // ont leur propre durée de vie, et cet essai échouait par intermittence sur
      // « Response has been disposed » — une panne de l'outillage, sans rapport avec ce
      // qu'il vérifie. `fetch` depuis la page emprunte le cookie de session et ne garde
      // aucun objet vivant.
      const lieux = await page.evaluate(
        (id: number) => fetch(`/api/farms/${id}/locations`).then((r) => r.json()),
        ferme,
      );
      return lieux
        .filter((lieu: { geometry: unknown }) => lieu.geometry)
        .map((lieu: { geometry: { coordinates: number[][][] } }) => {
          const anneau = lieu.geometry.coordinates[0]!;
          const lngs = anneau.map((position) => position[0]!);
          const lats = anneau.map((position) => position[1]!);
          return {
            lng: Math.max(...lngs) - Math.min(...lngs),
            lat: Math.max(...lats) - Math.min(...lats),
          };
        });
    };

    await page.goto('/carte');
    const avant = await etendues();
    expect(avant.length, 'deux contours à faire pivoter').toBe(2);
    // Des planches orientées nord-sud : longues en latitude, étroites en longitude.
    for (const etendue of avant) expect(etendue.lat).toBeGreaterThan(etendue.lng);

    await page.getByLabel('Angle (degrés)').fill('90');
    await page.getByRole('button', { name: /Tous les contours/ }).click();
    await expect(page.getByText(/contour\(s\) pivoté\(s\) de 90°/)).toBeVisible();

    // Un quart de tour les couche : elles deviennent longues en longitude. C'est la seule
    // chose qui se voit à l'écran, et donc la seule qu'un essai de bout en bout puisse
    // prouver — la conservation des surfaces est vérifiée dans le noyau, en mètres.
    const apres = await etendues();
    expect(apres.length).toBe(2);
    for (const etendue of apres) expect(etendue.lng).toBeGreaterThan(etendue.lat);
  });

  await test.step('le plan s’imprime', async () => {
    // Un bouton qui appelle `window.print()` : on vérifie qu'il est là et qu'il ne
    // disparaît pas au profit d'autre chose. Le rendu papier lui-même se juge à l'œil.
    await expect(page.getByRole('button', { name: 'Imprimer' })).toBeVisible();
  });

  await test.step('et se retirent aussi simplement', async () => {
    await page.getByRole('button', { name: 'Retirer la position' }).click();
    await expect(page.getByText('47.59855, -0.44078')).toHaveCount(0);
  });
});

test('dessiner une planche, la mesurer et la dimensionner', async ({ page }, info) => {
  const email = `e2e-dim-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un compte avec un emplacement', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme des dimensions');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    await page.goto('/assolement');
    await page.getByRole('button', { name: 'Nouvel emplacement' }).click();
    await page.getByLabel('Nom').fill('Planche A1');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Planche A1').first()).toBeVisible();
  });

  await test.step('les dimensions se saisissent depuis le tiroir de la carte', async () => {
    // Ce que la saisie apporte par rapport à la mesure du tracé : `bedLength` alimente
    // les calculs de semences et de commande. Une longueur relevée au décamètre doit
    // pouvoir primer sur un contour tracé au doigt — et sans dessiner du tout.
    await page.goto('/carte');
    await page.getByLabel('Emplacement à dessiner').selectOption({ label: 'Planche A1' });

    await expect(page.getByRole('heading', { name: 'Dimensions de l’emplacement' })).toBeVisible();
    await page.getByLabel('Longueur (m)').fill('42');
    await page.getByLabel('Largeur (cm)').fill('75');
    // Un libellé propre : l'écran porte déjà un « Enregistrer » pour les coordonnées, et
    // deux boutons du même nom s'annoncent à l'identique au lecteur d'écran.
    await page.getByRole('button', { name: 'Enregistrer les dimensions' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Dimensions enregistrées' }),
    ).toBeVisible();
  });

  await test.step('et se relisent sur l’assolement', async () => {
    // L'aller-retour complet : ce qui est saisi ici doit être ce que le reste de
    // l'application emploie, et non une valeur d'affichage restée dans l'écran.
    await page.goto('/assolement');
    await expect(page.getByText(/42/).first()).toBeVisible();
  });
});

test('faire pivoter un jardin entraîne ses planches', async ({ page }, info) => {
  const email = `e2e-pivot-${info.project.name}-${Date.now()}@example.org`;

  await test.step('créer un jardin avec deux planches, situé et dessiné', async () => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Pas encore de compte ?' }).click();
    await page.getByLabel('Adresse électronique').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Nom de la ferme').fill('Ferme qui pivote');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

    // Le parcellaire se pose par l'API : dessiner trois contours à la souris rendrait
    // l'essai long et fragile, alors que ce qu'il vérifie est la **rotation**.
    const farmId: number = await page.evaluate(async () => {
      const session = await fetch('/api/auth/me').then((r) => r.json());
      const id = session.farms[0].id;
      const jardin = await fetch(`/api/farms/${id}/locations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Jardin nord',
          parentId: null,
          bedLength: 0,
          greenhouse: false,
        }),
      }).then((r) => r.json());
      const carre = (est: number) => [
        { lat: 47.322, lng: 5.041 + est },
        { lat: 47.322, lng: 5.0411 + est },
        { lat: 47.3221, lng: 5.0411 + est },
        { lat: 47.3221, lng: 5.041 + est },
      ];
      await fetch(`/api/farms/${id}/locations/${jardin.id}/geometry`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ points: carre(0) }),
      });
      for (const [rang, nom] of [
        [1, 'Planche A1'],
        [2, 'Planche A2'],
      ] as const) {
        const planche = await fetch(`/api/farms/${id}/locations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: nom,
            parentId: jardin.id,
            bedLength: 30000,
            bedWidth: 800,
            greenhouse: false,
          }),
        }).then((r) => r.json());
        await fetch(`/api/farms/${id}/locations/${planche.id}/geometry`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ points: carre(rang * 0.0002) }),
        });
      }
      await fetch(`/api/farms/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latitude: 47.322, longitude: 5.041 }),
      });
      return id;
    });
    expect(farmId).toBeGreaterThan(0);
  });

  await test.step('la poignée fait pivoter le jardin et ses deux planches', async () => {
    await page.goto('/carte');
    // Par la valeur, non par le libellé : une fois le contour tracé, l'option porte un
    // suffixe « déjà dessiné », et une correspondance exacte sur le nom ne trouve plus rien.
    const valeur = await page
      .locator('option', { hasText: 'Jardin nord' })
      .first()
      .getAttribute('value');
    await page.getByLabel('Emplacement à dessiner').selectOption(valeur!);

    // Le libellé dit ce qui va tourner : le jardin **et** ce qu'il contient.
    await expect(page.getByText(/Tirez la poignée/)).toContainText(/2/);

    const poignee = page.locator('.carte-poignee');
    await expect(poignee).toBeVisible();
    const depart = await poignee.boundingBox();
    expect(depart).not.toBeNull();

    // Un vrai glisser, en plusieurs pas : d'un seul bond, Leaflet ne voit pas de
    // déplacement et n'émet jamais l'événement de glissement.
    await page.mouse.move(depart!.x + depart!.width / 2, depart!.y + depart!.height / 2);
    await page.mouse.down();
    await page.mouse.move(depart!.x + 90, depart!.y + 70, { steps: 12 });
    await page.mouse.up();

    // C'est ici que le défaut se voyait : l'aperçu tournait, puis tout revenait en place.
    // Le compte rendu ne paraît que si la rotation a été **enregistrée**.
    await expect(page.getByRole('status').filter({ hasText: /pivoté/ })).toBeVisible({
      timeout: 15_000,
    });
  });
});
