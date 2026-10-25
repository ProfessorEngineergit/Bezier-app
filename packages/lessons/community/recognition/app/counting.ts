/**
 * Whether this device contributes to usage counting, and whether the intro has been shown.
 *
 * On by default so points and badges reflect real use; RecognitionIntro explains it once and a
 * switch turns it off. Only daily totals per lesson or plugin are counted, never who did it.
 */

const COUNTING = 'bezier-community:counting';
const INTRO = 'bezier-community:intro-seen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const read = (storage: Pick<Storage, 'getItem'>, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const write = (storage: Pick<Storage, 'setItem'>, key: string, value: string): void => {
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.warn('Could not remember a community setting.', error);
  }
};

export const countingEnabled = (storage: Pick<Storage, 'getItem'> = localStorage): boolean =>
  read(storage, COUNTING) !== 'off';

export const setCounting = (enabled: boolean, storage: Store = localStorage): void =>
  write(storage, COUNTING, enabled ? 'on' : 'off');

export const introSeen = (storage: Pick<Storage, 'getItem'> = localStorage): boolean =>
  read(storage, INTRO) === 'yes';

export const markIntroSeen = (storage: Store = localStorage): void => write(storage, INTRO, 'yes');
