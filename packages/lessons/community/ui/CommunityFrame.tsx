/**
 * The frame for Community pages, using the start page's head and toolbar classes (`library__head`,
 * `lessons-home__toolbar`, as on Learn) so they match the rest of the start page.
 */

import type { ReactNode } from 'react';
import { SlideSwitch } from '../../src/ui/SlideSwitch.js';
import { ChannelTag } from './ChannelTag.js';
import { type Message, MessageLine } from './MessageLine.js';
// Learn's stylesheets, whose classes this page reuses.
import '../../src/ui/lessons.css';
import '../../src/ui/chrome.css';
import '../../src/home/home.css';
import '../../src/home/cards.css';
import './community.css';
import './community-parts.css';
import './community-dialog.css';

export type CommunityKind = 'lessons' | 'plugins' | 'wiki' | 'leaderboard';

// Community lessons are shown on Learn, not here.
const KINDS: readonly { value: CommunityKind; label: string }[] = [
  { value: 'plugins', label: 'Plugins' },
  { value: 'wiki', label: 'Wiki' },
  { value: 'leaderboard', label: 'Leaderboard' },
];

export function CommunityFrame({
  kind,
  title = 'Community',
  onKind,
  note,
  tools,
  actions,
  message,
  onDismiss,
  children,
}: {
  kind: CommunityKind;
  /** Page title: "Wiki" where the wiki is the only section, otherwise "Community". */
  title?: string;
  /** Omitted when only one section is offered; the switch is then hidden. */
  onKind?: ((next: CommunityKind) => void) | undefined;
  /** Text beside the heading, such as the server being browsed. */
  note: string;
  /** Filter controls on the left of the toolbar, after the switch. */
  tools?: ReactNode;
  /** Page actions on the right of the toolbar. */
  actions?: ReactNode;
  message: Message | null;
  onDismiss: () => void;
  children: ReactNode;
}) {
  // With no switch or filters, put the actions in the head instead of an otherwise empty toolbar.
  const inHead = onKind === undefined && tools === undefined && actions !== undefined;
  return (
    <section className="library__section lessons-home cl-page">
      <header className="library__head">
        <h1>
          {title} {title === 'Community' && <ChannelTag gate="alpha" />}
        </h1>
        <span className="cl-head__end">
          <span className="library__count">{note}</span>
          {inHead && actions}
        </span>
      </header>
      {!inHead && (onKind !== undefined || tools !== undefined || actions !== undefined) && (
        <div className="lessons-home__toolbar">
          {onKind !== undefined && (
            <SlideSwitch choices={KINDS} label="What to browse" onChange={onKind} value={kind} />
          )}
          {tools}
          <span className="lessons-home__gap" />
          {actions}
        </div>
      )}
      <MessageLine message={message} onDismiss={onDismiss} />
      {children}
    </section>
  );
}

/** Empty state, like Learn's "No lessons yet". */
export function CommunityEmpty({
  mark,
  title,
  children,
}: {
  mark: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="lessons-empty cl-empty">
      <span className="lessons-empty__mark">{mark}</span>
      <p className="lessons-empty__title">{title}</p>
      {children}
    </section>
  );
}
