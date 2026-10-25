/** Shares a lesson (local or from a package file) for review and shows earlier uploads. */

import { type FormEvent, useEffect, useState } from 'react';
import type { LessonManifest } from '../../src/format/manifest.js';
import { writePackage } from '../../src/format/package.js';
import { listLessons, loadLesson } from '../client/library.js';
import {
  listMyUploads,
  type MyUpload,
  rememberUploadToken,
  uploadLesson,
  uploadToken,
} from '../client/publish.js';
import type { Source } from '../client/sources.js';
import { Dialog } from './Dialog.js';

const STATUS_TEXT: Record<MyUpload['status'], string> = {
  pending: 'Waiting for review',
  approved: 'Public',
  rejected: 'Not accepted',
  removed: 'Taken down',
};

const FILE = '__file__';

export function UploadDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const [token, setToken] = useState(() => uploadToken(source));
  const [mine, setMine] = useState<LessonManifest[]>([]);
  const [choice, setChoice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uploads, setUploads] = useState<MyUpload[] | null>(null);

  useEffect(() => {
    listLessons()
      .then((lessons) => {
        setMine(lessons);
        setChoice((current) => current || (lessons[0]?.id ?? FILE));
      })
      .catch((caught: unknown) => {
        console.warn('Listing local lessons failed.', caught);
        setChoice(FILE);
      });
  }, []);

  useEffect(() => {
    if (token === '') return;
    listMyUploads(source, token)
      .then(setUploads)
      .catch(() => setUploads(null));
  }, [source, token]);

  async function bytesToSend(): Promise<Uint8Array> {
    if (choice === FILE) {
      if (file === null) throw new Error('Choose a .bezierlesson file.');
      return new Uint8Array(await file.arrayBuffer());
    }
    const lesson = await loadLesson(choice);
    if (lesson === null) throw new Error('That lesson is no longer on this device.');
    return writePackage(lesson);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    setProgress(0);
    try {
      const bytes = await bytesToSend();
      await uploadLesson(source, token.trim(), bytes, setProgress);
      rememberUploadToken(source, token.trim());
      setDone(true);
      setUploads(await listMyUploads(source, token.trim()).catch(() => null));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The upload failed.');
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <Dialog title={`Share on ${source.name}`} onClose={onClose}>
      <form className="cl-form" onSubmit={(event) => void submit(event)}>
        <label className="cl-label" htmlFor="cl-upload-lesson">
          Lesson
        </label>
        <select
          id="cl-upload-lesson"
          className="cl-input"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {mine.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title || 'Untitled lesson'}
            </option>
          ))}
          <option value={FILE}>A .bezierlesson file…</option>
        </select>
        {choice === FILE ? (
          <input
            className="cl-input"
            type="file"
            accept=".bezierlesson"
            aria-label="Lesson file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        ) : null}

        <label className="cl-label" htmlFor="cl-upload-token">
          Upload token
        </label>
        <input
          id="cl-upload-token"
          className="cl-input"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="cl-note">
          The server’s owner gives you a token. Your lesson is public once they approve it.
        </p>

        {error === null ? null : (
          <p className="cl-field-error" role="alert">
            {error}
          </p>
        )}
        {done ? (
          <p className="cl-field-ok" role="status">
            Sent. It is listed once the owner approves it.
          </p>
        ) : null}

        <div className="cl-form__actions">
          {busy ? (
            <span
              className="cl-progress cl-progress--wide"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
            >
              <span className="cl-progress__bar" style={{ width: `${progress * 100}%` }} />
            </span>
          ) : null}
          <button
            type="submit"
            className="lessons-button lessons-button--primary"
            disabled={busy || token.trim() === ''}
          >
            {busy ? 'Uploading…' : 'Send for review'}
          </button>
        </div>
      </form>

      {uploads === null || uploads.length === 0 ? null : (
        <section className="cl-uploads" aria-label="Your uploads">
          <p className="cl-popover__title">Your uploads</p>
          <ul>
            {uploads.map((upload) => (
              <li key={upload.id} className="cl-upload">
                <span className="cl-upload__title">{upload.title}</span>
                <span className={`cl-status cl-status--${upload.status}`}>
                  {STATUS_TEXT[upload.status]}
                </span>
                {upload.note === '' || upload.status === 'approved' ? null : (
                  <span className="cl-upload__note">{upload.note}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
