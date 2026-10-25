/**
 * Nib in the title bar: crashes, lessons, running work and firsts feed the island state machine
 * (`@bezier/nib` `island/machine.ts`), rendered by `NibIsland`. Lives in its own React root
 * (`mount.ts`) so it survives an app crash; crashes arrive via the window (`report/log-buffer.ts`),
 * and with the app gone it opens the report window itself.
 */

import {
  type IslandInput,
  type IslandState,
  initialIsland,
  islandView,
  NibIsland,
  nextChange,
  resolve,
  stepIsland,
} from '@bezier/nib';
import { formatPercent, useNotificationFeed } from '@bezier/ui';
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { letNibAsk, type Question } from '../ask-question.js';
import { replayFilm } from '../intro/film.js';
import { nib, startGuide, useNibSettings } from '../nib.js';
import { LESSONS, type Lesson } from '../nib-guides.js';
import { onCrash } from '../report/log-buffer.js';
import { openReport, type Prefill, REPORT_OPEN_EVENT } from '../report/ReportHost.js';
import { ReportWindow } from '../report/ReportWindow.js';
import { LIGHTER_DISPLAY, requestSettings } from '../settings-request.js';
import { VERSION } from '../version.js';
import { AimRing } from './AimRing.js';
import { barIsCovered } from './covered.js';
import { setFirstMeeting, useFirstMeeting } from './first-meeting.js';
import { useFirstOffers } from './first-offers.js';
import { cardFor, lineLabel, lineText } from './island-card.js';
import { listenToApp, OPEN_PROJECT_EVENT } from './island-feed.js';
import { firstOf } from './milestones.js';
import { watchStrain } from './strain.js';

/** Dispatched to open the island's menu from elsewhere (the Help menu, Settings). */
export const NIB_OPEN = 'bezier:nib-open';

const seconds = () => performance.now() / 1000;

/** The start page library is visible, so a new project is one click away. */
const onStartPage = () => document.querySelector('.library[data-loaded]') !== null;

interface Step {
  input: IslandInput;
  at: number;
}

const reduce = (state: IslandState, { input, at }: Step) => stepIsland(state, input, at);

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The app's root is empty: the app crashed and cannot open a window. */
const appIsGone = () => (document.getElementById('root')?.childElementCount ?? 0) === 0;

export function IslandHost() {
  const { level, still, style } = useNibSettings();
  const shows = style.shows;
  const showsRef = useRef(shows);
  showsRef.current = shows;
  const [state, dispatch] = useReducer(reduce, undefined, () => initialIsland(level, seconds()));
  const tell = useCallback((input: IslandInput) => dispatch({ input, at: seconds() }), []);
  const snapshot = useSyncExternalStore(nib.subscribe, nib.getSnapshot);
  // Whether messages are shown here: when no page has a spot for the figure.
  const [owns, setOwns] = useState(() => nib.placement() === null);
  const [fallback, setFallback] = useState<Prefill | null>(null);
  // An expired timer may leave the state unchanged (falling asleep is only elapsed time) yet
  // change what is drawn, so it redraws itself.
  const [, redraw] = useReducer((count: number) => count + 1, 0);

  useEffect(() => tell({ kind: 'level', level }), [level, tell]);

  // App questions go to Nib while he is on, as a card the app waits behind. If he is switched off
  // with one open, it gets the no-cost answer, as closing a dialog would.
  const asked = useRef<{ key: number; answer: (yes: boolean) => void } | null>(null);
  const answerRef = useRef<(index: number) => void>(() => {});
  const asks = useRef(0);
  useEffect(() => {
    if (level === 'off') return;
    const give = (yes: boolean) => {
      const open = asked.current;
      asked.current = null;
      tell({ kind: 'ask', question: null });
      open?.answer(yes);
    };
    const stop = letNibAsk(
      (question: Question) =>
        new Promise<boolean>((answer) => {
          // One at a time: a second question answers the first with the no-cost answer.
          asked.current?.answer(false);
          asks.current += 1;
          const key = asks.current;
          asked.current = { key, answer };
          const suggest = question.suggest ?? 'no';
          tell({
            kind: 'ask',
            question: {
              key,
              title: question.title,
              text: question.message,
              answers: [
                { label: question.no, primary: suggest === 'no' },
                { label: question.yes, primary: suggest === 'yes' },
              ],
            },
          });
        }),
    );
    answerRef.current = (index: number) => give(index === 1);
    return () => {
      stop();
      give(false);
    };
  }, [level, tell]);
  useFirstOffers(shows.firsts ? level : 'off');
  const meeting = useFirstMeeting();

  // Slow machine: measured only while it may be shown.
  useEffect(() => {
    if (level === 'off' || !shows.strain) {
      tell({ kind: 'strain', strain: 0 });
      return;
    }
    return watchStrain((strain) => tell({ kind: 'strain', strain }));
  }, [level, shows.strain, tell]);

  useEffect(() => {
    const open = () => tell({ kind: 'open' });
    window.addEventListener(NIB_OPEN, open);
    return () => window.removeEventListener(NIB_OPEN, open);
  }, [tell]);

  // Crash, from the window: the one signal that must arrive with the app gone.
  useEffect(() => onCrash((crash) => tell({ kind: 'crash', crash })), [tell]);

  useEffect(() => {
    const report = (event: Event) =>
      tell({ kind: 'reporting', open: (event as CustomEvent<boolean>).detail === true });
    window.addEventListener(REPORT_OPEN_EVENT, report);
    return () => window.removeEventListener(REPORT_OPEN_EVENT, report);
  }, [tell]);

  // App events: running work, failures, firsts.
  useEffect(
    () =>
      listenToApp((event) => {
        if (event.kind === 'tasks')
          return tell({ kind: 'tasks', tasks: showsRef.current.work ? event.tasks : [] });
        if (event.kind === 'notice' && event.tone === 'fail') tell({ kind: 'wince' });
        // Shown regardless of settings: the user asked to be told when choosing to keep loading.
        if (event.kind === 'arrived')
          return tell({
            kind: 'message',
            message: {
              title: `“${event.name}” is in`,
              detail: 'The model finished loading into it.',
              tone: 'ok',
              sticky: true,
              action: { label: 'Open the project', deed: `open:${event.project}` },
            },
          });
        if (!showsRef.current.notes) return;
        const first = firstOf(event, storage(), nib.guiding);
        if (first !== null) tell({ kind: 'milestone', text: first });
      }),
    [tell],
  );

  // While he is on, app notices are his (`toasts` off in the bar, App.tsx), taken off the shared
  // feed as they arrive. Ones that arrive while the window is in the background, and failures, wait
  // until they have been seen.
  const feed = useNotificationFeed();
  useEffect(() => {
    if (level === 'off') return;
    for (const notice of feed.notices) {
      const away = document.hidden || !document.hasFocus();
      tell({
        kind: 'message',
        message: {
          title: notice.title,
          ...(notice.detail === undefined ? {} : { detail: notice.detail }),
          tone: notice.tone === 'fail' || notice.tone === 'ok' ? notice.tone : 'info',
          sticky: notice.sticky === true || notice.tone === 'fail' || away,
        },
      });
      feed.onDismiss(notice.id);
    }
  }, [feed, level, tell]);

  // User activity wakes him. Throttled in the state, so this can be called freely.
  useEffect(() => {
    const awake = () => tell({ kind: 'activity' });
    window.addEventListener('pointerdown', awake, { passive: true });
    window.addEventListener('keydown', awake);
    return () => {
      window.removeEventListener('pointerdown', awake);
      window.removeEventListener('keydown', awake);
    };
  }, [tell]);

  // Free bar space and page spots depend on layout, which has no change event, so both are polled
  // a few times a second.
  useEffect(() => {
    const look = () => {
      tell({ kind: 'covered', covered: barIsCovered() });
      setOwns(nib.placement() === null);
    };
    look();
    const timer = window.setInterval(look, 600);
    window.addEventListener('resize', look);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', look);
    };
  }, [tell]);

  // Lessons and messages from the controller, when shown here.
  const bubble = owns ? snapshot.bubble : null;
  useEffect(
    () =>
      tell({
        kind: 'speech',
        speech: bubble === null ? null : { key: bubble.key, text: bubble.text },
      }),
    [bubble, tell],
  );
  const guide = snapshot.guide;
  useEffect(
    () =>
      tell({
        kind: 'guide',
        guide:
          guide === null ? null : { step: guide.step, steps: guide.steps, hinted: guide.hinted },
      }),
    [guide, tell],
  );
  const finished = useRef(snapshot.finished);
  useEffect(() => {
    if (snapshot.finished === finished.current) return;
    finished.current = snapshot.finished;
    tell({ kind: 'guideDone' });
  }, [snapshot.finished, tell]);

  // A step whose target is under the open card (Solve at the top in Simulation): the card folds
  // into the line, which shows the step, and the ring marks the target. Once per step; reopened by
  // hand, it stays open.
  const stepKey = snapshot.guide === null ? null : (snapshot.bubble?.key ?? null);
  const stepOpen = islandView(state, seconds()).content?.kind === 'speech';
  const foldedFor = useRef<number | null>(null);
  useEffect(() => {
    if (stepKey === null || !stepOpen || foldedFor.current === stepKey) return;
    const timer = window.setInterval(() => {
      const aim = nib.getSnapshot().aim;
      const target = aim === null ? null : resolve(aim);
      const shell = document.querySelector('.nib-island__shell');
      if (target === null || shell === null) return;
      const a = target.getBoundingClientRect();
      const b = shell.getBoundingClientRect();
      const covered = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      if (!covered || a.width === 0) return;
      foldedFor.current = stepKey;
      tell({ kind: 'collapse' });
    }, 300);
    return () => window.clearInterval(timer);
  }, [stepKey, stepOpen, tell]);

  // Without the figure, nothing else lets the controller check the page for a completed step.
  const lessonHere = owns && (snapshot.guide !== null || snapshot.bubble !== null);
  useEffect(() => {
    if (!lessonHere) return;
    const timer = window.setInterval(() => nib.tick(seconds()), 250);
    return () => window.clearInterval(timer);
  }, [lessonHere]);

  // The state's own timers: wake when the next one expires.
  useEffect(() => {
    const at = nextChange(state, seconds());
    if (!Number.isFinite(at)) return;
    const timer = window.setTimeout(
      () => {
        tell({ kind: 'tick' });
        redraw();
      },
      Math.max(0, (at - seconds()) * 1000) + 30,
    );
    return () => window.clearTimeout(timer);
  }, [state, tell]);

  const view = islandView(state, seconds());
  const asking = view.content?.kind === 'question';

  // While he asks, he owns the keyboard: Tab cycles his answers and nothing reaches the app, as
  // with a system dialog (the backdrop takes the pointer).
  useEffect(() => {
    if (!asking) return;
    const key = (event: KeyboardEvent) => {
      const answers = [
        ...document.querySelectorAll<HTMLButtonElement>('.nib-island .nib-island__action'),
      ];
      if (event.key === 'Tab' && answers.length > 0) {
        event.preventDefault();
        const at = answers.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.shiftKey ? -1 : 1;
        answers[(at + step + answers.length) % answers.length]?.focus();
        return;
      }
      const inside = (event.target as Element | null)?.closest?.('.nib-island') != null;
      if (!inside || event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [asking]);

  const crash = view.content?.kind === 'crash' ? view.content.crash : null;

  const report = (prefill?: Prefill) => {
    tell({ kind: 'dismiss' });
    if (appIsGone()) setFallback(prefill ?? { title: '', what: '' });
    else openReport(prefill);
  };

  const lesson =
    snapshot.guide === null ? null : { id: snapshot.guide.id, title: snapshot.guide.title };
  const startLesson = (chosen: Lesson) => {
    tell({ kind: 'dismiss' });
    // On the start page the first lesson begins in a new project, opened as its first step.
    if (chosen.id === 'first-part' && onStartPage())
      window.dispatchEvent(new CustomEvent('bezier:new-project'));
    startGuide(chosen.guide);
  };
  const card = cardFor(view, bubble, {
    report: () =>
      report(
        crash === null
          ? undefined
          : { title: crash.title, what: `${crash.detail}\n\nWhat I was doing: ` },
      ),
    reportProblem: () => report(),
    startLesson,
    watchIntro: () => {
      tell({ kind: 'dismiss' });
      replayFilm();
    },
    stopLesson: () => {
      tell({ kind: 'dismiss' });
      nib.stopGuide();
    },
    lighten: () => {
      tell({ kind: 'dismiss' });
      window.dispatchEvent(new Event(LIGHTER_DISPLAY));
    },
    dismiss: () => {
      // "Later" on an offer: not offered again; the lesson stays in Settings › Nib.
      if (view.content?.kind === 'speech' && snapshot.guide === null) nib.hush();
      tell({ kind: 'dismiss' });
    },
    settings: () => {
      tell({ kind: 'dismiss' });
      requestSettings('nib');
    },
    answer: (index) => answerRef.current(index),
    act: (deed) => {
      tell({ kind: 'dismiss' });
      if (deed.startsWith('open:'))
        window.dispatchEvent(new CustomEvent(OPEN_PROJECT_EVENT, { detail: deed.slice(5) }));
    },
    lesson,
    lessons: LESSONS.map((each) => ({ ...each, done: nib.memory.guides.includes(each.id) })),
    name: style.name,
  });

  if (level === 'off') return null;
  return (
    <>
      {meeting && view.content?.kind === 'speech' && (
        <div aria-hidden="true" className="nib-meeting" />
      )}
      {asking && <div aria-hidden="true" className="nib-meeting nib-meeting--ask" />}
      <NibIsland
        card={card}
        keepOpen={asking || meeting || (view.content?.kind === 'speech' && snapshot.guide !== null)}
        label={lineLabel(view)}
        line={lineText(view.line)}
        {...(view.progress === undefined || view.progress === null
          ? {}
          : { percent: formatPercent(view.progress) })}
        look={{ body: style.body, eyes: style.eyes }}
        lively={level === 'friendly'}
        model="/nib/nib.glb"
        onClose={() => {
          setFirstMeeting(false);
          // The × on a lesson message ends the lesson, like the bubble beside the figure.
          if (view.content?.kind === 'speech') {
            if (nib.guiding) nib.stopGuide();
            else nib.hush();
          }
          tell({ kind: 'dismiss' });
        }}
        // Escape does not dismiss the first greeting; it needs an answer.
        onCollapse={() => {
          if (!meeting) tell({ kind: 'collapse' });
        }}
        onPress={() => tell({ kind: 'press' })}
        onSummon={() => tell({ kind: 'open' })}
        lookAt={() => (snapshot.aim === null ? null : resolve(snapshot.aim))}
        still={still}
        view={view}
      />
      {owns && <AimRing aim={snapshot.aim} />}
      {fallback !== null && (
        <ReportWindow
          capture={null}
          facts={() => ({})}
          onClose={() => setFallback(null)}
          prefill={fallback}
          version={VERSION}
          where="the app, after it stopped"
        />
      )}
    </>
  );
}
