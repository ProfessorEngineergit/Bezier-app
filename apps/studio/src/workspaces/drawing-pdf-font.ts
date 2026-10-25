/** The detached export SVG cannot inherit the workspace font; embed the local brand font. */
import type { jsPDF } from 'jspdf';

let fonts: Promise<string[]> | undefined;
async function fontData(file: string) {
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error('The drawing font could not be loaded. Please try again.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function drawingPdfFont(pdf: jsPDF, source: SVGSVGElement, copy: SVGSVGElement) {
  fonts ??= Promise.all(['archivo-pdf-regular.ttf', 'archivo-pdf-semibold.ttf'].map(fontData));
  let data: string[];
  try {
    data = await fonts;
  } catch (error) {
    fonts = undefined;
    throw error;
  }
  for (const [index, style] of ['normal', 'bold'].entries()) {
    const file = `Archivo-${style}.ttf`;
    pdf.addFileToVFS(file, data[index] ?? '');
    pdf.addFont(file, 'Archivo', style);
  }
  const original = source.querySelectorAll('text');
  copy.querySelectorAll('text').forEach((text, index) => {
    const element = original[index];
    text.style.fontFamily = 'Archivo';
    text.style.fontWeight =
      element && Number(getComputedStyle(element).fontWeight) >= 600 ? '700' : '400';
  });
}
