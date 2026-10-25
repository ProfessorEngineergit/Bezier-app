export const LEARN_WINDOW_URL = new URL('./learn-project-window.svg', import.meta.url).href;

/** The same asset is embedded in saved thumbnails and used while an older thumbnail is repaired. */
export function LearnProjectWatermark() {
  return (
    <img
      alt=""
      aria-hidden="true"
      draggable={false}
      className="tile__learn-watermark"
      src={LEARN_WINDOW_URL}
    />
  );
}
