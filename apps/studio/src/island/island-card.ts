/**
 * The island's copy: what it says for each state it shows (crash, lesson step, running work, slow
 * machine) and what its buttons do.
 */

import type { Bubble, IslandCard, IslandLine, IslandView } from '@bezier/nib';
import { type Lesson, lessonFor } from '../nib-guides.js';

export interface CardDeeds {
  /** Start a report about the crash on show. */
  report: () => void;
  /** Start a report with nothing filled in. */
  reportProblem: () => void;
  /** Start a lesson from the menu; from the start page it opens in a new project. */
  startLesson: (lesson: Lesson) => void;
  /** The intro film again. */
  watchIntro: () => void;
  stopLesson: () => void;
  /** Switch to a lighter render mode, which helps a slow machine most. */
  lighten: () => void;
  /** Dismiss the card ("Not now"). */
  dismiss: () => void;
  /** Open Settings at the Nib section. */
  settings: () => void;
  /** Answer the open question, by answer index. */
  answer: (index: number) => void;
  /** A message's own button, by its action ("open:<project>"). */
  act: (deed: string) => void;
  /** The lesson under way, if any. */
  lesson: { id: string; title: string } | null;
  /** All lessons, completed ones marked. */
  lessons: readonly (Lesson & { done: boolean })[];
  name: string;
}

export function cardFor(
  view: IslandView,
  bubble: Bubble | null,
  deeds: CardDeeds,
): IslandCard | null {
  const content = view.content;
  if (content === null) return null;
  switch (content.kind) {
    case 'crash':
      return {
        kicker: 'Something went wrong',
        title: 'That did not go as it should.',
        text: 'Bezier is still in development. Send what happened, with the details of this machine, so it can be fixed?',
        detail: content.crash.title,
        actions: [
          { label: 'Not now', run: deeds.dismiss },
          { label: 'Send a report', run: deeds.report, primary: true },
        ],
        close: 'Close',
      };
    case 'menu': {
      const next = deeds.lessons.find((lesson) => !lesson.done) ?? deeds.lessons[0];
      return {
        kicker: deeds.name,
        text:
          deeds.lesson !== null
            ? `The lesson "${deeds.lesson.title}" is under way.`
            : 'Lessons, the intro film, or a problem to report.',
        actions:
          deeds.lesson !== null
            ? [
                { label: 'Report a problem', run: deeds.reportProblem },
                { label: 'End the lesson', run: deeds.stopLesson, primary: true },
              ]
            : [
                { label: 'All lessons…', run: deeds.settings },
                { label: 'Report a problem', run: deeds.reportProblem },
                { label: 'Watch the intro', run: deeds.watchIntro },
                ...(next === undefined
                  ? []
                  : [{ label: next.title, run: () => deeds.startLesson(next), primary: true }]),
              ],
        close: 'Close',
      };
    }
    case 'speech': {
      const options = bubble?.options ?? [];
      const guide = content.guide;
      if (guide !== null && deeds.lesson !== null)
        // A lesson step: labelled as one, with progress, and only ended explicitly.
        return {
          kicker: `Lesson · ${deeds.lesson.title} · ${String(Math.min(guide.step + 1, guide.steps))} of ${String(guide.steps)}`,
          steps: { step: guide.step, steps: guide.steps },
          text: content.speech.text,
          // With two buttons, the one that advances is primary; a lone Skip is not.
          actions: options.map((option, index, all) => ({
            label: option.label,
            run: option.run,
            primary: all.length > 1 && index === all.length - 1,
          })),
          close: 'End the lesson',
        };
      // A lesson offer: labelled as one, with its length, and dismissible.
      const offered = lessonFor(content.speech.text);
      return {
        kicker:
          offered === null
            ? deeds.name
            : `Lesson · ${String(offered.guide.steps.length)} steps · about ${String(offered.minutes)} min`,
        ...(offered === null ? {} : { title: offered.title }),
        text: content.speech.text,
        actions: options.map((option, index, all) => ({
          label: option.label,
          run: option.run,
          primary: index === 0 && all.length > 1,
        })),
        close: 'Close',
      };
    }
    case 'tasks':
      return {
        kicker: 'Working',
        text:
          content.tasks.length === 1
            ? 'One thing under way.'
            : `${String(content.tasks.length)} things under way.`,
        rows: content.tasks.map((task) => ({
          label: task.label,
          progress: task.progress ?? null,
          ...(task.detail === undefined ? {} : { detail: task.detail }),
        })),
        actions: [],
      };
    case 'question':
      return {
        kicker: deeds.name,
        title: content.question.title,
        text: content.question.text,
        actions: content.question.answers.map((answer, index) => ({
          label: answer.label,
          run: () => deeds.answer(index),
          ...(answer.primary === true ? { primary: true } : {}),
        })),
        modal: true,
      };
    case 'message': {
      const { message } = content;
      const action = message.action;
      return {
        kicker: message.tone === 'fail' ? 'Problem' : message.tone === 'ok' ? 'Done' : deeds.name,
        title: message.title,
        text:
          content.more === 0
            ? (message.detail ?? '')
            : `${message.detail === undefined ? '' : `${message.detail} `}${content.more === 1 ? 'One more' : `${String(content.more)} more`} after this.`,
        actions:
          action === undefined
            ? []
            : [{ label: action.label, run: () => deeds.act(action.deed), primary: true }],
        close: 'Close',
      };
    }
    case 'strain':
      return {
        kicker: 'Heavy going',
        title: content.strain === 2 ? 'This machine is struggling.' : 'This is getting slow.',
        text: 'A lighter display draws curves with fewer facets and the panels without blur. The view stays smooth; the model itself is not changed.',
        actions: [
          { label: 'Not now', run: deeds.dismiss },
          { label: 'Lighter display', run: deeds.lighten, primary: true },
        ],
        close: 'Close',
      };
  }
}

/** Text of the collapsed line. */
export function lineText(line: IslandLine | null): string | null {
  if (line === null) return null;
  switch (line.kind) {
    case 'crash':
      return 'Something went wrong';
    case 'lesson': {
      // The step itself, short: folded over its target, the line is all there is to read.
      const first = line.text.split(/(?<=[.!?])\s/)[0] ?? line.text;
      return `Lesson · ${String(Math.min(line.step + 1, line.steps))} of ${String(line.steps)} · ${first}`;
    }
    case 'offer':
      return 'A lesson is waiting';
    case 'task':
      return line.count > 1 ? `${line.label} and ${String(line.count - 1)} more` : line.label;
    case 'effort':
      return 'Working on it';
    case 'message':
      return line.text;
    case 'strain':
      return line.strain === 2 ? 'Struggling' : 'Getting slow';
    case 'note':
      return line.text;
  }
}

/** Screen-reader label for the line: what a press does now. */
export function lineLabel(view: IslandView): string {
  switch (view.line?.kind) {
    case 'crash':
      return 'Nib: something went wrong. Press to see what.';
    case 'lesson':
      return 'Nib: a lesson is under way. Press to open it.';
    case 'offer':
      return 'Nib: a lesson is waiting. Press to see it.';
    case 'task':
      return 'Nib: work under way. Press for the details.';
    case 'strain':
      return 'Nib: this machine is struggling. Press for what helps.';
    default:
      return 'Nib. Press for help.';
  }
}
