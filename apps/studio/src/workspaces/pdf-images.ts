/**
 * Makes sheet pictures fit for PDF. jsPDF embeds screen captures as raw pixels with a raw alpha
 * mask (four 2880 × 1800 views made an 83 MB page, audit F-024), so each picture is redrawn at
 * print size on white and stored as JPEG, which PDF embeds as is. Lines and text stay vectors.
 */

/** Print resolution for pictures: sharp on paper, a fraction of the screen capture. */
const DOTS_PER_MM = 200 / 25.4;
const QUALITY = 0.88;

function loaded(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const picture = new Image();
    picture.onload = () => resolve(picture);
    picture.onerror = () => reject(new Error('A picture on the sheet could not be read.'));
    picture.src = href;
  });
}

/** Replaces every raster picture in `sheet` with a JPEG at print size. `sheet` is a copy. */
export async function compactImages(sheet: SVGSVGElement): Promise<void> {
  for (const image of sheet.querySelectorAll('image')) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
    if (href === null || !href.startsWith('data:image/') || href.startsWith('data:image/jpeg'))
      continue;
    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    if (!(width > 0 && height > 0)) continue;
    const picture = await loaded(href);
    // Millimetres per captured pixel as printed: the picture keeps its shape inside its box
    // (`meet`). Never more pixels than were captured.
    const printed = Math.min(width / picture.naturalWidth, height / picture.naturalHeight);
    const scale = Math.min(1, printed * DOTS_PER_MM);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (context === null) continue;
    // White behind: the sheet is white, and JPEG has no transparency to keep.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    image.setAttribute('href', canvas.toDataURL('image/jpeg', QUALITY));
    image.removeAttribute('xlink:href');
  }
}
