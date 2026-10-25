/**
 * The wiki as a Community page. Shares state with the floating window; Collapse moves it there so
 * it can stay open over a model.
 */

import { useEffect } from 'react';
import { CommunityEmpty, CommunityFrame, type CommunityKind } from '../../ui/CommunityFrame.js';
import { WikiView } from './WikiView.js';
import { useWiki } from './wiki-state.js';
import './wiki.css';

export function WikiPage({
  onKind,
  title,
}: {
  /** Omitted when the wiki is the whole page and there is nothing to switch to. */
  onKind?: (next: CommunityKind) => void;
  title?: string;
}) {
  const wiki = useWiki();
  const { setOnPage } = wiki;
  // While this page is shown, the app's breadcrumb provides the location.
  useEffect(() => {
    setOnPage(true);
    return () => setOnPage(false);
  }, [setOnPage]);
  return (
    <CommunityFrame
      actions={
        wiki.floating ? undefined : (
          <button
            className="wiki-button"
            onClick={wiki.collapse}
            title="Float the wiki over the app"
            type="button"
          >
            Collapse
          </button>
        )
      }
      kind="wiki"
      message={null}
      {...(title === undefined ? {} : { title })}
      note={`${wiki.articles.length} articles`}
      onDismiss={() => {}}
      onKind={onKind}
    >
      {wiki.floating ? (
        <CommunityEmpty mark={null} title="The wiki is in its own window">
          <p className="lessons-dim">It floats over the app, so it can stay open beside a model.</p>
          <div className="lessons-empty__actions">
            <button className="lessons-button" onClick={wiki.close} type="button">
              Bring it back here
            </button>
          </div>
        </CommunityEmpty>
      ) : (
        <WikiView place="page" />
      )}
    </CommunityFrame>
  );
}
