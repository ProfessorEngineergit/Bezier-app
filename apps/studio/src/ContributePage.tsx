/**
 * The Contribute page on the start page. Reuses the Settings rows from `PreferencesContribute.tsx`
 * with a heading; reporting a problem comes first.
 */

import { Contribute } from './PreferencesContribute.js';
import { openReport } from './report/ReportHost.js';

export function ContributePage({ version }: { version: string }) {
  return (
    <section className="library__section contribute-page">
      <header className="library__head">
        <h1>Contribute</h1>
      </header>
      <p className="contribute-page__lede">
        Bezier is still being made, and some things will not work the way you expect. You can help
        by telling us. It takes a minute, and the app puts in the screen you were on, a picture you
        can circle things on, and what it logged.
      </p>
      <p>
        <button
          className="library__action library__action--primary"
          onClick={() => openReport()}
          type="button"
        >
          Report a problem
        </button>
      </p>
      <Contribute intro={false} version={version} />
    </section>
  );
}
