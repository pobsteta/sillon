// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Journal de bord : toutes les notes de la ferme, épinglées d'abord. Les notes attachées
// à une série s'écrivent depuis sa fiche, mais se relisent aussi ici — c'est l'endroit
// où l'on cherche « ce qu'on avait noté » sans se souvenir de la série concernée.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFarmId } from '../lib/session.js';
import { NoteList } from '../components/Notes.js';
import { PageHeader, Toggle } from '../components/ui.js';

export function NotesPage() {
  const { t } = useTranslation();
  const farmId = useFarmId();
  const [archived, setArchived] = useState(false);

  return (
    <>
      <PageHeader title={t('notes.title')}>
        <Toggle label={t('notes.showArchived')} checked={archived} onChange={setArchived} />
      </PageHeader>
      <NoteList farmId={farmId} archived={archived} />
    </>
  );
}
