import { LEARN_WINDOW_URL } from './LearnProjectWatermark.js';

let emblem: Promise<HTMLImageElement> | undefined;
function learnWindow(): Promise<HTMLImageElement> {
  if (emblem === undefined) {
    const image = new Image();
    image.src = LEARN_WINDOW_URL;
    emblem = image
      .decode()
      .then(() => image)
      .catch((error: unknown) => {
        emblem = undefined;
        throw error;
      });
  }
  return emblem;
}

/** Embeds the mark in the picture so it also shows in folder and drag previews. */
export async function markLearnThumbnail(picture: Blob): Promise<Blob> {
  const mark = await learnWindow();
  const image = await createImageBitmap(picture);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('The lesson preview could not be drawn.');
    context.drawImage(image, 0, 0);
    const width = image.width * 0.2;
    const height = width * 0.82;
    const inset = image.width * 0.028;
    context.drawImage(
      mark,
      image.width - width - inset,
      image.height - height - inset,
      width,
      height,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (blob === null) reject(new Error('The lesson preview could not be saved.'));
        else resolve(blob);
      }, 'image/png'),
    );
  } finally {
    image.close();
  }
}
