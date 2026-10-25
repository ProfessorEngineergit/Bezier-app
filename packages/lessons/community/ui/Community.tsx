/**
 * The Community page on the start page: wiki, plugins and leaderboard from one store behind one
 * switch. When off, a card explains what enabling it does; the store address is set in Settings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { reaches } from '../client/channel.js';
import { fetchServerInfo } from '../client/server-info.js';
import { type CommunityStore, lessonsOf, pluginsOf, setStoreOn } from '../client/store.js';
import { WikiPage } from '../docs/ui/WikiPage.js';
import { useWiki } from '../docs/ui/wiki-state.js';
import type { PluginRuntime } from '../plugins/runtime/bridge.js';
import { PluginsHome } from '../plugins/ui/PluginsHome.js';
import { CommunityEmpty, CommunityFrame, type CommunityKind } from './CommunityFrame.js';
import { CommunityIcon } from './icons.js';
import { Leaderboard } from './Leaderboard.js';
import { useChannel } from './useChannel.js';
import { useCommunityStore } from './useStore.js';

export function Community({
  query = '',
  onSettings,
  runtime,
  stopped,
  kind: shownKind,
  onKind,
}: {
  /** The start page's search text. */
  query?: string;
  /** Opens Settings on its Community page. */
  onSettings: () => void;
  /** The editor's plugin runtime, so install and disable take effect immediately. */
  runtime?: PluginRuntime | undefined;
  /** Reasons the runtime stopped plugins, by id. */
  stopped?: Record<string, string>;
  /** The open section, when controlled by the surrounding page (which shows it in a breadcrumb). */
  kind?: CommunityKind | undefined;
  onKind?: ((kind: CommunityKind) => void) | undefined;
}) {
  const store = useCommunityStore();
  const channel = useChannel();
  const [ownKind, setOwnKind] = useState<CommunityKind>('wiki');
  // Lessons live on Learn; a stored 'lessons' tab falls back to Plugins.
  const asked = shownKind ?? ownKind;
  const kind = asked === 'lessons' ? 'plugins' : asked;
  const report = useRef(onKind);
  report.current = onKind;
  const setKind = useCallback((next: CommunityKind) => {
    setOwnKind(next);
    report.current?.(next);
  }, []);
  const wiki = useWiki();
  // Switch to the Wiki tab when the wiki page is requested (search result, Expand).
  useEffect(() => {
    if (wiki.pageRequest > 0) setKind('wiki');
  }, [wiki.pageRequest, setKind]);
  // Below alpha only the built-in wiki is available; store content and wiki editing are alpha.
  if (!reaches(channel, 'alpha'))
    return (
      <div className="lessons lessons-root cl-root">
        <WikiPage title="Wiki" />
      </div>
    );
  // The wiki works with the store off; the other sections need it.
  if (kind === 'wiki')
    return (
      <div className="lessons lessons-root cl-root">
        <WikiPage onKind={setKind} />
      </div>
    );
  return (
    <div className="lessons lessons-root cl-root">
      {!store.on ? (
        <Off kind={kind} onKind={setKind} onSettings={onSettings} store={store} />
      ) : kind === 'plugins' ? (
        <PluginsHome
          onKind={setKind}
          query={query}
          runtime={runtime}
          source={pluginsOf(store)}
          {...(stopped === undefined ? {} : { stopped })}
        />
      ) : (
        <Leaderboard name={store.name} onKind={setKind} url={store.url} />
      )}
    </div>
  );
}

function Off({
  store,
  kind,
  onKind,
  onSettings,
}: {
  store: CommunityStore;
  kind: CommunityKind;
  onKind: (next: CommunityKind) => void;
  onSettings: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setProblem(null);
    try {
      // Check the store responds before enabling, so failure is reported here rather than as an
      // empty page.
      await fetchServerInfo(lessonsOf(store).url);
      setStoreOn(true);
    } catch (caught) {
      console.warn('The community store did not answer.', caught);
      setProblem(`${store.name} did not answer. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommunityFrame kind={kind} message={null} note="" onDismiss={() => {}} onKind={onKind}>
      {store.url === '' ? (
        <CommunityEmpty mark={<CommunityIcon />} title="Bezier Community opens with the launch">
          <p className="lessons-dim">
            Lessons and plugins other people share will be here. Running a store of your own? Give
            Bezier its address in Settings.
          </p>
          <div className="lessons-empty__actions">
            <button className="lessons-button" onClick={onSettings} type="button">
              Community settings
            </button>
          </div>
        </CommunityEmpty>
      ) : (
        <CommunityEmpty mark={<CommunityIcon />} title={store.name}>
          <p className="lessons-dim">
            Lessons to follow and plugins to add, shared by other people and looked at by a person
            before they are listed. Turning this on asks the store what it has; nothing of yours is
            sent, and there is no account to make.
          </p>
          <div className="lessons-empty__actions">
            <button
              className="lessons-button lessons-button--primary"
              disabled={busy}
              onClick={() => void turnOn()}
              type="button"
            >
              {busy ? 'Asking…' : 'Turn on Community'}
            </button>
          </div>
          {problem !== null && (
            <p className="cl-field-error" role="alert">
              {problem}
            </p>
          )}
        </CommunityEmpty>
      )}
    </CommunityFrame>
  );
}
