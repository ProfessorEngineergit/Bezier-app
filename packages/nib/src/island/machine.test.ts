import { describe, expect, it } from 'vitest';
import {
  CRASH_SHOWN,
  type IslandInput,
  type IslandState,
  initialIsland,
  MESSAGE_KEPT,
  MESSAGE_SHOWN,
  MILESTONE_GAP,
  NOTE_SHOWN,
  nextChange,
  QUIET_FOR,
  SLEEP_AFTER,
  STRAIN_QUIET_FOR,
  STRAIN_SHOWN_AFTER,
  step,
  TASK_SHOWN_AFTER,
  UNSEEN_FOR,
  viewOf,
  WINCE_FOR,
} from './machine.js';

const crash = { title: 'Visualize stopped working', detail: 'TypeError: x is undefined' };
const offer = { key: 1, text: 'First time in Visualize. Shall I show you?' };
const guide = { step: 1, steps: 6, hinted: false };

/** Runs inputs at the given times, from a fresh Nib at the given level. */
function run(
  level: 'quiet' | 'friendly',
  ...inputs: readonly [number, IslandInput][]
): IslandState {
  let state = initialIsland(level, 0);
  for (const [at, input] of inputs) state = step(state, input, at);
  return state;
}

describe('the island at rest', () => {
  it('is not there: nothing at rest takes a place on the screen', () => {
    expect(viewOf(initialIsland('friendly', 0), 1)).toEqual({
      shape: 'hidden',
      content: null,
      line: null,
      mood: 'rest',
    });
  });

  it('is not there at all when switched off, whatever happens', () => {
    let state = initialIsland('off', 0);
    state = step(state, { kind: 'crash', crash }, 1);
    state = step(state, { kind: 'speech', speech: offer }, 2);
    state = step(state, { kind: 'tasks', tasks: [{ label: 'Export', progress: 0.5 }] }, 3);
    expect(viewOf(state, 10).shape).toBe('hidden');
  });

  it('dozes off after a long while, and only when chatty', () => {
    expect(viewOf(run('friendly'), SLEEP_AFTER + 1).mood).toBe('sleepy');
    expect(viewOf(run('quiet'), SLEEP_AFTER + 1).mood).toBe('rest');
  });
});

describe('a lesson, and the offer of one', () => {
  it('an offer opens as a card and says it is one', () => {
    const view = viewOf(run('quiet', [1, { kind: 'speech', speech: offer }]), 1);
    expect(view.shape).toBe('card');
    expect(view.content).toEqual({ kind: 'speech', speech: offer, guide: null });
  });

  it('a press elsewhere or Escape folds it into the line, and nothing is answered', () => {
    const folded = run('quiet', [1, { kind: 'speech', speech: offer }], [2, { kind: 'collapse' }]);
    expect(viewOf(folded, 2)).toMatchObject({ shape: 'compact', line: { kind: 'offer' } });
    // A press on the line opens it again, as it was.
    const again = step(folded, { kind: 'press' }, 3);
    expect(viewOf(again, 3).content).toEqual({ kind: 'speech', speech: offer, guide: null });
  });

  it('a lesson folded away keeps its place: the line says which step, with how far along', () => {
    const state = run(
      'quiet',
      [1, { kind: 'guide', guide }],
      [1, { kind: 'speech', speech: { key: 2, text: 'Open Tools.' } }],
      [2, { kind: 'collapse' }],
    );
    const view = viewOf(state, 2);
    expect(view.shape).toBe('compact');
    expect(view.line).toEqual({ kind: 'lesson', step: 1, steps: 6, text: 'Open Tools.' });
    expect(view.progress).toBeCloseTo(1 / 6);
  });

  it('the next step of a folded lesson opens the card again', () => {
    const state = run(
      'quiet',
      [1, { kind: 'guide', guide }],
      [1, { kind: 'speech', speech: { key: 2, text: 'Open Tools.' } }],
      [2, { kind: 'collapse' }],
      [3, { kind: 'speech', speech: { key: 3, text: 'Press Extrude.' } }],
    );
    expect(viewOf(state, 3).shape).toBe('card');
  });

  it('only the × ends it', () => {
    const state = run('quiet', [1, { kind: 'speech', speech: offer }], [2, { kind: 'dismiss' }]);
    expect(viewOf(state, 2).shape).toBe('hidden');
    expect(state.speech).toBeNull();
  });
});

describe('work under way', () => {
  const tasks = [{ label: 'Opening project', progress: 0.4 }];

  it('a short task never shows', () => {
    const state = run('quiet', [1, { kind: 'tasks', tasks }], [2, { kind: 'tasks', tasks: [] }]);
    expect(viewOf(state, 1 + TASK_SHOWN_AFTER / 2).shape).toBe('hidden');
    expect(viewOf(state, 5).shape).toBe('hidden');
  });

  it('a long one is on the line with how far along, and opens into the list', () => {
    const state = run('quiet', [1, { kind: 'tasks', tasks }]);
    const view = viewOf(state, 1 + TASK_SHOWN_AFTER);
    expect(view).toMatchObject({
      shape: 'compact',
      line: { kind: 'task', label: 'Opening project', count: 1 },
      progress: 0.4,
      mood: 'focused',
    });
    const opened = step(state, { kind: 'press' }, 1 + TASK_SHOWN_AFTER);
    expect(viewOf(opened, 3).content).toEqual({ kind: 'tasks', tasks });
  });

  it('one task that cannot say how far it is makes the line say nothing', () => {
    const state = run('quiet', [
      1,
      { kind: 'tasks', tasks: [{ label: 'Export', progress: 0.9 }, { label: 'Import' }] },
    ]);
    expect(viewOf(state, 1 + TASK_SHOWN_AFTER).progress).toBeNull();
  });

  it('says when it will show, so the host wakes then', () => {
    const state = run('quiet', [1, { kind: 'tasks', tasks }]);
    expect(nextChange(state, 1)).toBe(1 + TASK_SHOWN_AFTER);
  });
});

describe('the machine struggling', () => {
  it('a heavy moment is not a slow machine', () => {
    const state = run(
      'quiet',
      [1, { kind: 'strain', strain: 2 }],
      [3, { kind: 'strain', strain: 0 }],
    );
    expect(viewOf(state, 4).shape).toBe('hidden');
  });

  it('a while of it and he sweats, and offers what helps', () => {
    const state = run('quiet', [1, { kind: 'strain', strain: 2 }]);
    const view = viewOf(state, 1 + STRAIN_SHOWN_AFTER);
    expect(view).toMatchObject({ shape: 'compact', line: { kind: 'strain', strain: 2 } });
    expect(view.mood).toBe('strained');
    const opened = step(state, { kind: 'press' }, 1 + STRAIN_SHOWN_AFTER);
    expect(viewOf(opened, 8).content).toEqual({ kind: 'strain', strain: 2 });
  });

  it('"Not now" keeps him quiet about it for a good while', () => {
    let state = run('quiet', [1, { kind: 'strain', strain: 1 }]);
    state = step(state, { kind: 'press' }, 1 + STRAIN_SHOWN_AFTER);
    state = step(state, { kind: 'dismiss' }, 1 + STRAIN_SHOWN_AFTER);
    expect(viewOf(state, 60).shape).toBe('hidden');
    expect(viewOf(state, 1 + STRAIN_SHOWN_AFTER + STRAIN_QUIET_FOR).shape).toBe('compact');
  });
});

describe('a crash', () => {
  it('opens the card with his oops face, even in quiet', () => {
    const view = viewOf(run('quiet', [10, { kind: 'crash', crash }]), 10);
    expect(view.shape).toBe('card');
    expect(view.content).toEqual({ kind: 'crash', crash });
    expect(view.mood).toBe('oops');
  });

  it('folded or left alone, it waits on the line, then goes', () => {
    const left = run('quiet', [10, { kind: 'crash', crash }]);
    expect(viewOf(step(left, { kind: 'tick' }, 10 + CRASH_SHOWN), 10 + CRASH_SHOWN)).toMatchObject({
      shape: 'compact',
      line: { kind: 'crash' },
      mood: 'worried',
    });
    const gone = step(left, { kind: 'tick' }, 10 + CRASH_SHOWN + UNSEEN_FOR + 1);
    expect(viewOf(gone, 10 + CRASH_SHOWN + UNSEEN_FOR + 1).shape).toBe('hidden');
  });

  it('comes over a lesson, which waits under it', () => {
    const state = run(
      'quiet',
      [1, { kind: 'speech', speech: offer }],
      [2, { kind: 'crash', crash }],
    );
    expect(viewOf(state, 2).content?.kind).toBe('crash');
    expect(viewOf(step(state, { kind: 'dismiss' }, 3), 3).line).toEqual({ kind: 'offer' });
  });

  it('a second one so soon after is let go', () => {
    const state = run(
      'quiet',
      [1, { kind: 'crash', crash }],
      [2, { kind: 'dismiss' }],
      [3, { kind: 'crash', crash: { title: 'Again', detail: '' } }],
    );
    expect(viewOf(state, 3).shape).toBe('hidden');
    const later = step(state, { kind: 'crash', crash }, 1 + QUIET_FOR);
    expect(viewOf(later, 1 + QUIET_FOR).shape).toBe('card');
  });
});

describe('the menu', () => {
  it('opens on a press when nothing waits, and when asked for from elsewhere', () => {
    expect(viewOf(step(run('quiet'), { kind: 'press' }, 1), 1).content).toEqual({ kind: 'menu' });
    expect(viewOf(step(run('quiet'), { kind: 'open' }, 1), 1).content).toEqual({ kind: 'menu' });
  });
});

describe('small notes', () => {
  it('a first is a word on the line for a moment, chatty only, and not twice in a while', () => {
    const state = run('friendly', [1, { kind: 'milestone', text: 'Your first part.' }]);
    expect(viewOf(state, 2)).toMatchObject({ shape: 'compact', line: { kind: 'note' } });
    expect(viewOf(step(state, { kind: 'tick' }, 1 + NOTE_SHOWN), 1 + NOTE_SHOWN).shape).toBe(
      'hidden',
    );
    const second = step(state, { kind: 'milestone', text: 'Again' }, 1 + MILESTONE_GAP / 2);
    expect(second.note).toBeNull();
    expect(viewOf(run('quiet', [1, { kind: 'milestone', text: 'x' }]), 2).shape).toBe('hidden');
  });

  it('a failure gets a worried look, no words, chatty only', () => {
    const state = run('friendly', [1, { kind: 'wince' }]);
    expect(state.reaction?.mood).toBe('worried');
    expect(step(state, { kind: 'tick' }, 1 + WINCE_FOR).reaction).toBeNull();
    expect(run('quiet', [1, { kind: 'wince' }]).reaction).toBeNull();
  });
});

describe('room on the bar', () => {
  it('the line steps aside for something on the bar, but a crash waiting stays', () => {
    const tasks = [{ label: 'Export', progress: 0.5 }];
    const covered = run(
      'quiet',
      [0, { kind: 'tasks', tasks }],
      [0, { kind: 'covered', covered: true }],
    );
    expect(viewOf(covered, 5).shape).toBe('hidden');
    const crashed = run(
      'quiet',
      [0, { kind: 'covered', covered: true }],
      [1, { kind: 'crash', crash }],
      [2, { kind: 'collapse' }],
    );
    expect(viewOf(crashed, 3).shape).toBe('compact');
  });
});

describe('what the app says, said by him', () => {
  const saying = (sticky: boolean, tone: 'info' | 'ok' | 'fail' = 'ok'): IslandInput => ({
    kind: 'message',
    message: { title: 'Exported part.stl', tone, sticky },
  });

  it('opens as a card, folds into the line, and goes', () => {
    let state = step(initialIsland('quiet', 0), saying(false), 0);
    expect(viewOf(state, 0).shape).toBe('card');
    expect(viewOf(state, 0).mood).toBe('happy');
    state = step(state, { kind: 'tick' }, MESSAGE_SHOWN);
    expect(viewOf(state, MESSAGE_SHOWN).shape).toBe('compact');
    expect(viewOf(state, MESSAGE_SHOWN).line).toEqual({
      kind: 'message',
      text: 'Exported part.stl',
      tone: 'ok',
    });
    state = step(state, { kind: 'tick' }, MESSAGE_SHOWN + MESSAGE_KEPT);
    expect(viewOf(state, MESSAGE_SHOWN + MESSAGE_KEPT).shape).toBe('hidden');
  });

  it('keeps one said while the window was away until it is seen', () => {
    let state = step(initialIsland('quiet', 0), saying(true, 'fail'), 0);
    state = step(state, { kind: 'tick' }, 600);
    expect(viewOf(state, 600).shape).toBe('card');
    expect(viewOf(state, 600).mood).toBe('worried');
    state = step(state, { kind: 'collapse' }, 601);
    expect(viewOf(state, 601).shape).toBe('compact');
    state = step(state, { kind: 'press' }, 602);
    expect(viewOf(state, 602).shape).toBe('card');
    state = step(state, { kind: 'dismiss' }, 603);
    expect(viewOf(state, 603).shape).toBe('hidden');
  });

  it('waits on the line while a lesson card is open', () => {
    let state = step(initialIsland('quiet', 0), { kind: 'open' }, 0);
    state = step(state, saying(false), 1);
    expect(viewOf(state, 1).content?.kind).toBe('menu');
    state = step(state, { kind: 'dismiss' }, 2);
    expect(viewOf(state, 2).line?.kind).toBe('message');
  });
});

describe('two things said one after the other', () => {
  it('says the second when the first is done with, and replaces neither', () => {
    const say = (title: string): IslandInput => ({
      kind: 'message',
      message: { title, tone: 'fail', sticky: true },
    });
    let state = step(initialIsland('quiet', 0), say('a.png could not be read'), 0);
    state = step(state, say('b.png could not be read'), 0.1);
    const first = viewOf(state, 0.2).content;
    expect(first?.kind === 'message' && first.message.title).toBe('a.png could not be read');
    expect(first?.kind === 'message' && first.more).toBe(1);
    state = step(state, { kind: 'dismiss' }, 1);
    const second = viewOf(state, 1).content;
    expect(second?.kind === 'message' && second.message.title).toBe('b.png could not be read');
  });
});

describe('a failure said while something else is on show', () => {
  it('comes first, and the other waits its turn', () => {
    let state = step(
      initialIsland('quiet', 0),
      { kind: 'message', message: { title: 'View only', tone: 'info', sticky: true } },
      0,
    );
    state = step(
      state,
      { kind: 'message', message: { title: 'Could not rename', tone: 'fail', sticky: true } },
      1,
    );
    const now = viewOf(state, 1).content;
    expect(now?.kind === 'message' && now.message.title).toBe('Could not rename');
    state = step(state, { kind: 'dismiss' }, 2);
    const then = viewOf(state, 2).content;
    expect(then?.kind === 'message' && then.message.title).toBe('View only');
  });
});

describe('a question', () => {
  const question = {
    key: 7,
    title: 'This model is very large',
    text: 'Open Drawings anyway?',
    answers: [{ label: 'Stay here' }, { label: 'Open Drawings', primary: true }],
  };

  it('opens over everything, and nothing but its answer takes it away', () => {
    let state = run('quiet', [0, { kind: 'tasks', tasks: [{ label: 'Importing' }] }]);
    state = step(state, { kind: 'ask', question }, 1);
    expect(viewOf(state, 1)).toMatchObject({ shape: 'card', content: { kind: 'question' } });
    for (const kind of ['press', 'collapse', 'dismiss', 'open'] as const)
      state = step(state, { kind }, 2);
    expect(viewOf(state, 2).content?.kind).toBe('question');
    state = step(state, { kind: 'ask', question: null }, 3);
    expect(viewOf(state, 3).content).toBeNull();
  });

  it('is asked even with the bar covered or the report window open', () => {
    let state = run('quiet', [0, { kind: 'covered', covered: true }]);
    state = step(state, { kind: 'reporting', open: true }, 0);
    state = step(state, { kind: 'ask', question }, 1);
    expect(viewOf(state, 1).shape).toBe('card');
  });

  it('stays in front of a crash that comes while it is asked', () => {
    let state = run('quiet', [0, { kind: 'ask', question }]);
    state = step(state, { kind: 'crash', crash }, 1);
    expect(viewOf(state, 1).content?.kind).toBe('question');
  });
});

describe('light work', () => {
  it('shows no bar and no card: he only strains on the line', () => {
    let state = run('quiet', [0, { kind: 'tasks', tasks: [{ label: 'Updating', light: true }] }]);
    const view = viewOf(state, TASK_SHOWN_AFTER + 0.1);
    expect(view).toMatchObject({ shape: 'compact', line: { kind: 'effort' }, mood: 'strained' });
    expect(view.progress).toBeUndefined();
    state = step(state, { kind: 'press' }, TASK_SHOWN_AFTER + 0.2);
    expect(viewOf(state, TASK_SHOWN_AFTER + 0.2).shape).toBe('compact');
  });

  it('steps aside for real work, whose bar it does not hold back', () => {
    const state = run('quiet', [
      0,
      {
        kind: 'tasks',
        tasks: [
          { label: 'Updating', light: true },
          { label: 'Importing', progress: 0.4 },
        ],
      },
    ]);
    const view = viewOf(state, TASK_SHOWN_AFTER + 0.1);
    expect(view.line).toEqual({ kind: 'task', label: 'Importing', count: 1 });
    expect(view.progress).toBe(0.4);
  });
});
