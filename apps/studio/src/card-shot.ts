/**
 * Crops a project picture to the 4:3 card it is shown on, keeping the middle where the camera
 * frames the model.
 */

/** Width over height of a card's picture (`.tile__face` in library.css). */
export const CARD_ASPECT = 4 / 3;
/** Twice a Retina card's width; small to store. */
const WIDEST = 800;

/** The middle region of a `width` × `height` image with the card's shape, and its output size. */
export function cardCrop(width: number, height: number) {
  const wide = width / height > CARD_ASPECT;
  const w = wide ? height * CARD_ASPECT : width;
  const h = wide ? height : width / CARD_ASPECT;
  const out = Math.min(1, WIDEST / w);
  return {
    x: (width - w) / 2,
    y: (height - h) / 2,
    width: w,
    height: h,
    outWidth: Math.round(w * out),
    outHeight: Math.round(h * out),
  };
}

/** Card picture size, drawn at the screen's pixel ratio. */
const CARD_WIDTH = 640;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT;

interface Camera {
  resize(width: number, height: number): void;
  setView(view: 'default'): void;
  capture(options?: { scale?: number }): Promise<Blob | null>;
}

/**
 * Renders the card picture from the default three-quarter view, framed on the whole model, directly
 * at 4:3. The camera is left in the default view (the project is being closed and reopens framed).
 * The drawing size is restored right after, since `toBlob` copies the canvas synchronously.
 */
export function captureCard(viewport: Camera, canvas: HTMLElement | null): Promise<Blob | null> {
  const width = canvas?.clientWidth ?? 0;
  const height = canvas?.clientHeight ?? 0;
  viewport.resize(CARD_WIDTH, CARD_HEIGHT);
  viewport.setView('default');
  const shot = viewport.capture();
  if (width > 0 && height > 0) viewport.resize(width, height);
  return shot;
}

/** The shot cropped to the card's shape, or unchanged if that fails. */
export async function cardShot(shot: Blob): Promise<Blob> {
  try {
    const image = await createImageBitmap(shot);
    const crop = cardCrop(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = crop.outWidth;
    canvas.height = crop.outHeight;
    const context = canvas.getContext('2d');
    if (context === null) return shot;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.outWidth,
      crop.outHeight,
    );
    image.close();
    const cut = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    return cut ?? shot;
  } catch {
    return shot;
  }
}
