/** Player controls: scrub bar, play, chapters, time, speed, sound and full screen. */

import { clock } from '../format/clock.js';
import { chapterSegments, toPlayback } from '../format/timeline.js';
import { Icon } from '../ui/Icon.js';
import { Menu } from '../ui/Menu.js';
import { ScrubBar } from './ScrubBar.js';
import { type Playback, RATES } from './usePlayback.js';

interface Props {
  playback: Playback;
  fullscreen: boolean;
  onFullscreen: () => void;
  onHelp: () => void;
  compact?: boolean;
}

export function Controls({ playback, fullscreen, onFullscreen, onHelp, compact }: Props) {
  const { kept, playable, chapters, time } = playback;
  const segments = chapterSegments(chapters, playable).map(({ chapter, from, to }) => ({
    from,
    to,
    label: chapter.title,
  }));
  const position = toPlayback(kept, time);
  const button = (
    label: string,
    icon: Parameters<typeof Icon>[0]['name'],
    onClick: () => void,
    pressed?: boolean,
  ) => (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="lessons-button lessons-button--quiet lessons-button--icon"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="lessons-controls" data-compact={compact ? '' : undefined}>
      <ScrubBar
        label="Lesson timeline"
        length={playable}
        lessonTimeOf={(at) => toLessonFromPlayback(kept, at)}
        onSeek={(at) => playback.seek(toLessonFromPlayback(kept, at))}
        position={position}
        segments={segments}
      />
      <div className="lessons-controls__row">
        {button(
          playback.playing ? 'Pause' : 'Play',
          playback.playing ? 'pause' : 'play',
          playback.toggle,
        )}
        {button('Previous chapter', 'skip-back', () => playback.chapter(-1))}
        {button('Next chapter', 'skip-forward', () => playback.chapter(1))}
        <span className="lessons-controls__time">
          {clock(position)} <span className="lessons-faint">/ {clock(Math.ceil(playable))}</span>
        </span>
        <span className="lessons-controls__spacer" />
        {!compact &&
          button('Repeat this chapter', 'repeat', playback.toggleRepeat, playback.repeat)}
        <Menu
          className="lessons-button lessons-button--quiet lessons-controls__rate"
          items={RATES.map((rate) => ({
            label: `${rate}×${rate === playback.rate ? '  ✓' : ''}`,
            onSelect: () => playback.setRate(rate),
          }))}
          label="Playback speed"
          trigger={<span>{playback.rate}×</span>}
        />
        {button(
          playback.muted ? 'Unmute' : 'Mute',
          playback.muted ? 'muted' : 'volume',
          playback.toggleMute,
        )}
        {!compact && button('Keyboard shortcuts', 'keyboard', onHelp)}
        {button(
          fullscreen ? 'Leave full screen' : 'Full screen',
          fullscreen ? 'exit-fullscreen' : 'fullscreen',
          onFullscreen,
        )}
      </div>
    </div>
  );
}

function toLessonFromPlayback(kept: Playback['kept'], playbackTime: number): number {
  let before = 0;
  for (const stretch of kept) {
    const length = stretch.end - stretch.start;
    if (playbackTime <= before + length) return stretch.start + Math.max(0, playbackTime - before);
    before += length;
  }
  return kept.at(-1)?.end ?? 0;
}
