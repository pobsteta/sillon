// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Les migrations qui **touchent des données** doivent déroger à la Row-Level Security.
//
// Ce fichier vient d'une panne réelle, trouvée le 20 septembre 2026. La migration
// `20260918120000_partie_recoltee` posait la colonne `harvested_part` puis remplissait les
// espèces du référentiel de départ par un `UPDATE … FROM (VALUES …)`. Les tables de ferme
// sont en `FORCE ROW LEVEL SECURITY` — la politique s'applique **aussi** au propriétaire
// des tables, donc au rôle qui joue les migrations. Sans `app.farm_id` ni `app.bypass_rls`,
// cet `UPDATE` ne voyait aucune ligne.
//
// Il n'a pas échoué. Il a porté sur zéro enregistrement, sans message, et Prisma a marqué
// la migration comme appliquée. Trois fermes sont restées deux jours avec un calendrier
// lunaire inerte — le pivot du brief §4 sans aucune espèce qualifiée — et rien, nulle part,
// ne le signalait.
//
// **Aucun essai d'intégration ne pouvait l'attraper** : les fermes des essais naissent de
// `farm-setup.ts`, qui pose la valeur lui-même ; elles sont donc correctes quoi que fasse
// la migration. Le défaut ne vit que sur les bases existantes. D'où ce contrôle-ci, qui
// lit le SQL plutôt que la base — la seule forme qui voie la chose.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOSSIER = new URL('../prisma/migrations/', import.meta.url).pathname;

/**
 * Migrations dispensées du contrôle, avec la raison.
 *
 * Une seule, et elle est la raison d'être de ce fichier. On ne modifie pas une migration
 * déjà appliquée — son empreinte est enregistrée — donc elle reste telle quelle, fautive,
 * et `20260920150000_rattrapage_partie_recoltee` rejoue son travail correctement.
 */
const DISPENSES: Record<string, string> = {
  '20260918120000_partie_recoltee':
    'défectueuse et figée : son remplissage n’a rien écrit, rejoué par 20260920150000_rattrapage_partie_recoltee',
};

/** Les tables soumises à la politique d'isolation, lues là où elles sont déclarées. */
function tablesDeFerme(): string[] {
  const rls = readFileSync(join(DOSSIER, '20260915120100_rls_ltree_search/migration.sql'), 'utf8');
  const bloc = /farm_tables text\[\] := ARRAY\[([\s\S]*?)\]/.exec(rls);
  expect(bloc, 'le tableau des tables de ferme doit rester lisible ici').not.toBeNull();
  return [...bloc![1]!.matchAll(/'([a-z_]+)'/g)].map((trouve) => trouve[1]!);
}

/**
 * Le SQL tel que la migration l'exécute **elle-même**.
 *
 * Deux retraits, et le second est le moins évident. D'abord les commentaires : « -- UPDATE
 * … » n'est pas un UPDATE. Ensuite le **corps des fonctions** : un `CREATE FUNCTION … $$ …
 * UPDATE "locations" … $$` ne s'exécute pas pendant la migration, mais plus tard, dans la
 * transaction de l'application — où `app.farm_id` est posé et où la politique est donc
 * satisfaite. Les compter ici donnerait un faux positif sur chaque trigger du dépôt.
 *
 * Les blocs `DO $$ … $$`, eux, **sont gardés** : ceux-là s'exécutent bien pendant la
 * migration, et un `UPDATE` qu'on y cacherait serait exactement le défaut recherché.
 */
const sqlExecuteParLaMigration = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$/gi, '');

describe('les migrations qui écrivent des données', () => {
  const tables = tablesDeFerme();
  const migrations = readdirSync(DOSSIER, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort();

  it('sont bien toutes présentes', () => {
    expect(tables.length, 'les tables de ferme').toBeGreaterThan(10);
    expect(migrations.length, 'les migrations').toBeGreaterThan(5);
  });

  for (const migration of migrations) {
    it(`${migration} : dérogation à la RLS si elle touche une table de ferme`, () => {
      const brut = readFileSync(join(DOSSIER, migration, 'migration.sql'), 'utf8');
      const sql = sqlExecuteParLaMigration(brut);

      // On ne cherche que le **langage de manipulation** : `ALTER TABLE` et `CREATE INDEX`
      // ne sont pas soumis à la politique, seules les lignes le sont.
      const touchees = tables.filter((table) =>
        new RegExp(`\\b(UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+"?${table}"?\\b`, 'i').test(sql),
      );
      if (touchees.length === 0) return;

      if (DISPENSES[migration]) {
        // Dispensée, mais on vérifie qu'elle l'est pour la raison écrite : si quelqu'un la
        // corrigeait un jour, la dispense deviendrait un mensonge silencieux.
        expect(/set_config\(\s*'app\.bypass_rls'/.test(sql), DISPENSES[migration]).toBe(false);
        return;
      }

      expect(
        /set_config\(\s*'app\.bypass_rls'\s*,\s*'on'/.test(sql),
        `${migration} écrit dans ${touchees.join(', ')} sans déroger à la RLS : ` +
          "l'instruction portera sur zéro ligne, en silence. " +
          "Ajouter en tête : SELECT set_config('app.bypass_rls', 'on', true);",
      ).toBe(true);
    });
  }
});

describe('le rattrapage de la partie récoltée', () => {
  const rattrapage = readFileSync(
    join(DOSSIER, '20260920150000_rattrapage_partie_recoltee/migration.sql'),
    'utf8',
  );

  it('ne remplit que les valeurs vides', () => {
    // Une ferme qui a qualifié ses espèces à la main garde son choix. Sans cette clause,
    // le rattrapage écraserait un travail de saisie par une valeur par défaut.
    expect(rattrapage).toContain('"harvested_part" IS NULL');
  });

  it('couvre les quatre parties, les fleurs comprises', () => {
    // Le référentiel n'avait aucune espèce de type fleur jusqu'au 20 septembre 2026 : une
    // journée lunaire sur quatre ne proposait donc jamais rien, ce qui ressemblait à une
    // panne d'affichage plutôt qu'à un trou dans les données.
    for (const partie of ['root', 'leaf', 'flower', 'fruit']) {
      expect(rattrapage, partie).toContain(`'${partie}'`);
    }
  });
});
