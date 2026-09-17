// SPDX-FileCopyrightText: © 2023-2026 André Hoarau <andre@hoarau.dev> (modèle d'origine, Brinjel)
// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Notes et photos (§3.5 du brief). Le même composant sert au journal de bord et au
// panneau d'une série : seule change la note à laquelle les nouvelles écritures se
// rattachent. Les photos ne sont pas décoratives — c'est souvent la photo du ravageur
// qui fait la note.

import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { today } from '@sillon/core';
import { ApiError, api, upload } from '../lib/api.js';
import { useFarmMutation, useNotes } from '../lib/queries.js';
import { useCurrentSession } from '../lib/session.js';
import { useLocale } from '../lib/locale.js';
import { formatDate } from '../lib/format.js';
import { EmptyState, ErrorNotice, Loading } from './ui.js';
import type { Note, Photo } from '../lib/types.js';

/** Vignette d'une photo ; la route de contenu exige la session, d'où l'URL directe. */
function Thumbnail({
  farmId,
  photo,
  onRemove,
}: {
  farmId: number;
  photo: Photo;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const href = `/api/farms/${farmId}/photos/${photo.id}/content`;
  return (
    <figure className="relative">
      <a href={href} target="_blank" rel="noreferrer">
        <img
          src={href}
          alt={photo.name}
          loading="lazy"
          className="h-20 w-20 rounded-lg object-cover ring-1 ring-earth-200 dark:ring-earth-700"
        />
      </a>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('notes.removePhoto', { name: photo.name })}
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-earth-900 text-xs text-white dark:bg-earth-50 dark:text-earth-900"
        >
          ×
        </button>
      ) : null}
    </figure>
  );
}

/**
 * Formulaire d'écriture. `plantingId` et `locationId` rattachent la note à la série ou à
 * la planche depuis laquelle on écrit ; au journal, ils sont absents et la note est libre.
 */
function NoteForm({
  farmId,
  plantingId,
  locationId,
}: {
  farmId: number;
  plantingId?: number;
  locationId?: number;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [date, setDate] = useState(today());
  const [pinned, setPinned] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = useFarmMutation(
    farmId,
    (body: object) => api(`/api/farms/${farmId}/notes`, { method: 'POST', body }),
    {
      onSuccess: () => {
        setContent('');
        setPhotos([]);
        setPinned(false);
      },
    },
  );

  const addPhotos = async (files: FileList) => {
    setError(null);
    setUploading(true);
    try {
      // En série plutôt qu'en parallèle : sur un partage de connexion au champ, trois
      // téléversements concurrents se gênent plus qu'ils ne s'aident.
      for (const file of Array.from(files)) {
        const photo = await upload<Photo>(`/api/farms/${farmId}/photos`, file);
        setPhotos((current) => [...current, photo]);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('notes.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        content,
        date,
        pinned,
        photoIds: photos.map((photo) => photo.id),
        ...(plantingId ? { plantingIds: [plantingId] } : {}),
        ...(locationId ? { locationIds: [locationId] } : {}),
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    }
  };

  return (
    <form className="card space-y-3" onSubmit={(event) => void submit(event)}>
      <div>
        <label className="label" htmlFor="note-content">
          {t('notes.content')}
        </label>
        <textarea
          id="note-content"
          className="field min-h-24 py-2"
          required
          maxLength={10_000}
          placeholder={t('notes.placeholder')}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>

      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {photos.map((photo) => (
            <Thumbnail
              key={photo.id}
              farmId={farmId}
              photo={photo}
              onRemove={() => setPhotos((current) => current.filter((it) => it.id !== photo.id))}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="note-date">
            {t('common.date')}
          </label>
          <input
            id="note-date"
            type="date"
            className="field"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          {t('notes.pin')}
        </label>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* `capture="environment"` ouvre l'appareil photo arrière sur mobile (§7.3). */}
          <input
            ref={fileInput}
            id="note-photos"
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/avif"
            capture="environment"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) void addPhotos(event.target.files);
            }}
          />
          <label htmlFor="note-photos" className="btn-ghost cursor-pointer">
            {uploading ? t('common.loading') : t('notes.addPhoto')}
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={create.isPending || uploading || content.trim().length === 0}
          >
            {create.isPending ? t('common.loading') : t('notes.save')}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function NoteCard({ farmId, note }: { farmId: number; note: Note }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { can } = useCurrentSession();
  const patch = useFarmMutation(farmId, (body: object) =>
    api(`/api/farms/${farmId}/notes/${note.id}`, { method: 'PATCH', body }),
  );
  const remove = useFarmMutation(farmId, () =>
    api(`/api/farms/${farmId}/notes/${note.id}`, { method: 'DELETE' }),
  );

  const archived = note.archivedAt !== null;
  const series = note.plantings ?? [];

  return (
    <article className={`card space-y-3 ${archived ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        {note.pinned ? <span aria-label={t('notes.pinned')}>★</span> : null}
        <time className="text-sm tabular-nums text-earth-700 dark:text-earth-200">
          {formatDate(note.date, locale)}
        </time>
        {series.map(({ planting }) => (
          <span
            key={planting.id}
            className="chip bg-earth-100 text-earth-800 dark:bg-earth-700 dark:text-earth-100"
          >
            {planting.crop.name}
          </span>
        ))}
        {(note.locations ?? []).map(({ location }) => (
          <span
            key={location.id}
            className="chip bg-earth-100 text-earth-800 dark:bg-earth-700 dark:text-earth-100"
          >
            {location.name}
          </span>
        ))}
      </div>

      <p className="whitespace-pre-wrap">{note.content}</p>

      {note.photos.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {note.photos.map(({ photo }) => (
            <Thumbnail key={photo.id} farmId={farmId} photo={photo} />
          ))}
        </div>
      ) : null}

      {can('notes', 'update') ? (
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => patch.mutate({ pinned: !note.pinned })}
          >
            {note.pinned ? t('notes.unpin') : t('notes.pin')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => patch.mutate({ archived: !archived })}
          >
            {archived ? t('notes.unarchive') : t('notes.archive')}
          </button>
          {can('notes', 'delete') ? (
            <button
              type="button"
              className="btn-ghost text-red-700 dark:text-red-300"
              onClick={() => {
                if (window.confirm(t('notes.confirmDelete'))) remove.mutate(undefined);
              }}
            >
              {t('common.delete')}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Liste de notes, avec son formulaire quand le rôle l'autorise. Le journal l'affiche
 * seule ; la fiche de série la passe dans un panneau en lui donnant `plantingId`.
 */
export function NoteList({
  farmId,
  plantingId,
  locationId,
  archived = false,
}: {
  farmId: number;
  plantingId?: number;
  locationId?: number;
  archived?: boolean;
}) {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  const notes = useNotes(farmId, {
    ...(plantingId ? { plantingId } : {}),
    ...(locationId ? { locationId } : {}),
    archived,
  });

  return (
    <div className="space-y-4">
      {can('notes', 'create') && !archived ? (
        <NoteForm farmId={farmId} plantingId={plantingId} locationId={locationId} />
      ) : null}

      {notes.isLoading ? <Loading /> : null}
      {notes.error ? (
        <ErrorNotice error={notes.error} onRetry={() => void notes.refetch()} />
      ) : null}

      {notes.data?.length === 0 ? <EmptyState message={t('notes.empty')} /> : null}
      {notes.data?.map((note) => (
        <NoteCard key={note.id} farmId={farmId} note={note} />
      ))}
    </div>
  );
}
