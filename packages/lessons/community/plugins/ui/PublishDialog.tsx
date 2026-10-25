/** Submits a plugin for review and shows the status of earlier uploads. */

import { type FormEvent, useEffect, useState } from 'react';
import { rememberUploadToken, uploadToken } from '../../client/publish.js';
import type { Source } from '../../client/sources.js';
import { Dialog } from '../../ui/Dialog.js';
import { listMyPlugins, type MyPluginUpload, uploadPlugin } from '../client/publish.js';

const STATUS: Record<MyPluginUpload['status'], string> = {
  pending: 'Waiting for review',
  approved: 'Public',
  rejected: 'Not accepted',
  revoked: 'Taken back',
};

export function PublishDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const [token, setToken] = useState(() => uploadToken(source));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<MyPluginUpload[]>([]);

  useEffect(() => {
    if (token.trim().length < 20) return;
    listMyPlugins(source, token.trim()).then(setMine, () => setMine([]));
  }, [source, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (file === null) return setError('Choose a .bezierplugin file.');
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await uploadPlugin(source, token.trim(), new Uint8Array(await file.arrayBuffer()));
      rememberUploadToken(source, token.trim());
      setDone(true);
      setMine(await listMyPlugins(source, token.trim()).catch(() => []));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Publish on ${source.name}`} onClose={onClose}>
      <form className="cl-form" onSubmit={(event) => void submit(event)}>
        <label className="cl-label" htmlFor="pl-publish-file">
          Plugin package
        </label>
        <input
          id="pl-publish-file"
          className="cl-input"
          type="file"
          accept=".bezierplugin"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <label className="cl-label" htmlFor="pl-publish-token">
          Upload token
        </label>
        <input
          id="pl-publish-token"
          className="cl-input"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="cl-note">
          A person reads every version before it is public. Readable source only: minified code,
          eval and loading code from elsewhere are refused.
        </p>
        {error === null ? null : (
          <p className="cl-field-error" role="alert">
            {error}
          </p>
        )}
        {done ? (
          <p className="cl-field-ok" role="status">
            Sent. It is listed once it has been reviewed.
          </p>
        ) : null}
        <div className="cl-form__actions">
          <button
            type="submit"
            className="lessons-button lessons-button--primary"
            disabled={busy || token.trim() === ''}
          >
            {busy ? 'Sending…' : 'Send for review'}
          </button>
        </div>
      </form>
      {mine.length === 0 ? null : (
        <section className="cl-uploads" aria-label="Your plugins">
          <p className="cl-popover__title">Your plugins</p>
          <ul>
            {mine.map((upload) => (
              <li key={`${upload.id}@${upload.version}`} className="cl-upload">
                <span className="cl-upload__title">
                  {upload.id} {upload.version}
                </span>
                <span className={`cl-status cl-status--${upload.status}`}>
                  {STATUS[upload.status]}
                </span>
                {upload.note === '' ? null : <span className="cl-upload__note">{upload.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
