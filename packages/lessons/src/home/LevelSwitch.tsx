/** Filters lessons by level, with a `SlideSwitch` stop per level plus one for all levels. */

import type { LessonLevel } from '../format/manifest.js';
import { LEVELS, levelWord } from '../format/summary.js';
import { SlideSwitch } from '../ui/SlideSwitch.js';

export { stopAt } from '../ui/SlideSwitch.js';

export type LevelChoice = LessonLevel | 'all';

const CHOICES: readonly { value: LevelChoice; label: string }[] = [
  { value: 'all', label: 'All' },
  ...LEVELS.map((level) => ({ value: level, label: levelWord(level) })),
];

export function LevelSwitch({
  value,
  onChange,
}: {
  value: LevelChoice;
  onChange: (next: LevelChoice) => void;
}) {
  return <SlideSwitch choices={CHOICES} label="Level" onChange={onChange} value={value} />;
}
